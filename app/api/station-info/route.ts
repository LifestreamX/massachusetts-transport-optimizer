/**
 * POST /api/station-info
 *
 * Accepts { station } and returns all departures/arrivals for that station.
 * Shows real-time predictions, schedules, alerts, and vehicle locations.
 *
 * CACHE-FIRST STRATEGY: Checks cache first, fallback to live API if stale/missing.
 */

import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';
import { cacheService } from '@/lib/cache/cacheService';
import { AppError, BadRequestError, toError } from '@/lib/utils/errors';
import type { MbtaStopResource } from '@/lib/mbta/mbtaTypes';

interface StationInfoRequest {
  station: string;
}

interface StationInfoResponse {
  stationName: string;
  departures: {
    routeName: string;
    destination: string;
    departureTime: string | null;
    arrivalTime: string | null;
    minutesAway: number;
    status: string | null;
    tripHeadsign: string;
    track: string | null;
    mode?: 'subway' | 'commuter' | 'light-rail';
  }[];
  alerts: {
    header: string;
    severity: number;
    effect: string;
  }[];
  lastUpdated: string;
}

function jsonError(message: string, statusCode: number): NextResponse {
  return NextResponse.json(
    { error: message, statusCode },
    { status: statusCode },
  );
}

function calculateMinutesAway(departureTime: string | null): number {
  if (!departureTime) return 0;

  const now = new Date();
  const departure = new Date(departureTime);
  const diff = departure.getTime() - now.getTime();

  return Math.max(0, Math.round(diff / 60000));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // --- Input validation ---------------------------------------------------
    let body: StationInfoRequest;
    try {
      body = (await request.json()) as StationInfoRequest;
    } catch {
      throw new BadRequestError('Request body must be valid JSON');
    }

    const { station } = body;

    if (
      !station ||
      typeof station !== 'string' ||
      station.trim().length === 0
    ) {
      throw new BadRequestError(
        'station is required and must be a non-empty string',
      );
    }

    // --- Check cache first (cache-first strategy) ---------------------------
    const cacheKey = `station:${station.toLowerCase().replace(/\s+/g, '-')}:info`;

    try {
      const cachedData = await cacheService.get(cacheKey);
      if (cachedData) {
        console.log(`[station-info] Cache HIT for '${station}'`);
        return NextResponse.json(cachedData, {
          status: 200,
          headers: { 'X-Cache': 'HIT' },
        });
      }
      console.log(
        `[station-info] Cache MISS for '${station}' - fetching live data`,
      );
    } catch (err) {
      // Cache errors should not block the request
      console.warn(`[station-info] Cache error for '${station}':`, err);
    }

    // --- Fetch station data (optimized) -------------------------------------
    // 1. Find all routes that serve the selected station
    let routesServingStation = [];
    let allStops: MbtaStopResource[] = [];
    let stopIds = new Set<string>();
    try {
      const allRoutes = await mbtaClient.fetchRoutes('0,1,2');
      try {
        allStops = await mbtaClient.fetchStops(station);
      } catch (err) {
        // If filter[name] fails (400), fallback to fetching all stops and matching locally
        if (err instanceof Error && err.message.includes('400')) {
          console.warn(
            `[station-info] filter[name] failed for '${station}', fetching all stops and matching locally.`,
          );
          allStops = await mbtaClient.fetchStops();

          // Fuzzy / token matching fallback
          const normalizedInput = (s: string) =>
            s
              .toLowerCase()
              .replace(/[\u2018\u2019\u201c\u201d']/g, '')
              .replace(/[.,/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
              .replace(
                /\b(station|stn|st|center|centre|ctr|square|sq|plaza)\b/g,
                ' ',
              )
              .replace(/\s+/g, ' ')
              .trim();

          const tokenize = (s: string) =>
            normalizedInput(s).split(/\s+/).filter(Boolean);

          const inputTokens = tokenize(station);

          function scoreName(name: string) {
            const nameTokens = tokenize(name);
            if (nameTokens.length === 0) return 0;

            // exact match highest
            const normName = normalizedInput(name);
            const normInput = normalizedInput(station);
            if (normName === normInput) return 100;

            // token overlap and prefix matches
            let overlap = 0;
            let prefixMatches = 0;
            for (const t of inputTokens) {
              for (const nt of nameTokens) {
                if (nt === t) {
                  overlap += 2;
                } else if (nt.startsWith(t) || t.startsWith(nt)) {
                  prefixMatches += 1;
                } else if (nt.includes(t) || t.includes(nt)) {
                  overlap += 1;
                }
              }
            }

            // Boost if name starts with same tokens
            const starts =
              normName.startsWith(normInput) || normInput.startsWith(normName);
            const score = overlap + prefixMatches * 2 + (starts ? 10 : 0);
            return score;
          }

          const scored = allStops
            .map((stop) => ({
              stop,
              score: scoreName(stop.attributes.name || ''),
            }))
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score);

          if (scored.length > 0) {
            const topScore = scored[0].score;
            // accept any stop within 60% of top score or with reasonable absolute score
            const threshold = Math.max(Math.ceil(topScore * 0.6), 2);
            allStops = scored
              .filter((s) => s.score >= threshold)
              .map((s) => s.stop);
            console.log(
              `[station-info] Fuzzy matched ${allStops.length} stops for '${station}' (top=${topScore})`,
            );
          } else {
            allStops = [];
          }
        } else {
          throw err;
        }
      }
      if (allStops.length === 0) {
        throw new Error(`No stops found for station: ${station}`);
      }

      // Filter to only actual platform stops
      // 1. Try location_type first (0 = stop/platform, 1 = station)
      let platformStops = allStops.filter(
        (stop) =>
          stop.attributes.location_type === 0 ||
          stop.attributes.location_type === 1,
      );

      // 2. If no location_type set, filter by name/ID patterns
      // Exclude nodes, entrances, exits, stairs, lobbies
      if (platformStops.length === 0) {
        platformStops = allStops.filter(
          (stop) =>
            !stop.id.startsWith('node-') &&
            !stop.id.includes('-lobby') &&
            !stop.id.includes('-under') &&
            !stop.id.includes('-stair') &&
            !stop.id.includes('-exit') &&
            !stop.id.includes('-entrance') &&
            !stop.id.includes('unpaid') &&
            !stop.id.includes('fare') &&
            !/^\d+$/.test(stop.id), // Exclude numeric-only IDs (often generic nodes)
        );
      }

      // 3. If still too many, limit to first 3 stops to ensure fast response
      if (platformStops.length > 3) {
        console.warn(
          `[station-info] Too many stops (${platformStops.length}) for '${station}', limiting to first 3`,
        );
        platformStops = platformStops.slice(0, 3);
      }

      if (platformStops.length === 0) {
        // Last resort fallback
        platformStops = allStops.slice(0, 5);
        console.warn(
          `[station-info] Could not filter stops for '${station}', using first 5 of ${allStops.length}`,
        );
      }

      stopIds = new Set(platformStops.map((stop) => stop.id));
      console.log(
        `[station-info] Found ${allStops.length} stops for '${station}', filtered to ${platformStops.length} platforms`,
      );
      // The MBTA /routes endpoint doesn't return stop lists by default.
      // We'll consider all routes and filter predictions by stop IDs later.
      routesServingStation = allRoutes;
      if (routesServingStation.length === 0) {
        console.warn(
          `[station-info] No routes found serving station: ${station}`,
        );
      }
    } catch (err) {
      console.error(
        `[station-info] Error finding routes for station ${station}:`,
        err,
      );
      throw new Error('Failed to find routes for station');
    }

    // 2. Fetch predictions and schedules per-stop (reduces heavy fan-out)
    const departures: StationInfoResponse['departures'] = [];
    const alerts: StationInfoResponse['alerts'] = [];
    const alertSet = new Set<string>();
    const departureSet = new Set<string>();

    // Map routes by id for quick lookup
    const routeMap = new Map<string, any>(
      routesServingStation.map((r: any) => [r.id, r]),
    );

    const routeIdsForAlerts = new Set<string>();

    // Process all stops in parallel with controlled concurrency
    const stopIdArray = Array.from(stopIds);
    const concurrency = 3; // Fetch up to 3 stops at once (balance speed vs rate limits)
    let stopIndex = 0;

    async function processNextStop() {
      if (stopIndex >= stopIdArray.length) return;
      const stopId = stopIdArray[stopIndex++];

      try {
        // Add 10s timeout per stop fetch
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Stop fetch timeout')), 10000),
        );

        const predictions = (await Promise.race([
          mbtaClient.fetchPredictionsByStop(stopId),
          timeoutPromise,
        ])) as any[];

        if (predictions.length > 0) {
          for (const prediction of predictions) {
            const routeId = prediction.relationships?.route?.data?.id;
            if (!routeId) continue;

            routeIdsForAlerts.add(routeId);

            const route = routeId ? routeMap.get(routeId) : undefined;
            const routeName =
              (route &&
                (route.attributes.long_name || route.attributes.short_name)) ||
              routeId;
            const routeType = route?.attributes?.type ?? 1;
            const mode =
              routeType === 2
                ? 'commuter'
                : routeType === 0
                  ? 'light-rail'
                  : 'subway';

            const departureTime = prediction.attributes.departure_time;
            const arrivalTime = prediction.attributes.arrival_time;
            if (departureTime || arrivalTime) {
              const destination =
                route?.attributes?.direction_destinations?.[
                  prediction.attributes.direction_id
                ] || 'Unknown';
              const key = `${routeName}:${destination}:${departureTime || arrivalTime}`;
              if (!departureSet.has(key)) {
                departureSet.add(key);
                departures.push({
                  routeName,
                  destination,
                  departureTime,
                  arrivalTime,
                  minutesAway: calculateMinutesAway(
                    departureTime || arrivalTime,
                  ),
                  status: prediction.attributes.status,
                  tripHeadsign: destination,
                  track: null,
                  mode,
                });
              }
            }
          }
        } else {
          // No predictions — try schedules
          try {
            const schedules = (await Promise.race([
              mbtaClient.fetchSchedulesByStop(stopId),
              timeoutPromise,
            ])) as any[];

            for (const sched of schedules) {
              const routeId = sched.relationships?.route?.data?.id;
              if (routeId) routeIdsForAlerts.add(routeId);

              const route = routeId ? routeMap.get(routeId) : undefined;
              const routeName =
                (route &&
                  (route.attributes.long_name ||
                    route.attributes.short_name)) ||
                routeId ||
                'Unknown';
              const routeType = route?.attributes?.type ?? 1;
              const mode =
                routeType === 2
                  ? 'commuter'
                  : routeType === 0
                    ? 'light-rail'
                    : 'subway';

              const departureTime = sched.attributes.departure_time;
              const arrivalTime = sched.attributes.arrival_time;
              if (departureTime || arrivalTime) {
                const destination =
                  route?.attributes?.direction_destinations?.[
                    sched.attributes.direction_id
                  ] || 'Unknown';
                const key = `${routeName}:${destination}:${departureTime || arrivalTime}`;
                if (!departureSet.has(key)) {
                  departureSet.add(key);
                  departures.push({
                    routeName,
                    destination,
                    departureTime,
                    arrivalTime,
                    minutesAway: calculateMinutesAway(
                      departureTime || arrivalTime,
                    ),
                    status: null,
                    tripHeadsign: destination,
                    track: sched.attributes.timepoint ? 'TP' : null,
                    mode,
                  });
                }
              }
            }
          } catch (err) {
            // Ignore schedule errors
          }
        }
      } catch (err) {
        console.error(
          `[station-info] Error fetching data for stop ${stopId}:`,
          err,
        );
      }

      await processNextStop();
    }

    // Start concurrent processing chains
    await Promise.all(Array.from({ length: concurrency }, processNextStop));

    // Fetch alerts for all discovered routes in parallel
    const alertPromises = Array.from(routeIdsForAlerts).map(async (routeId) => {
      try {
        const routeAlerts = await mbtaClient.fetchAlerts(routeId);
        for (const alert of routeAlerts) {
          const alertKey = `${alert.attributes.header}_${alert.attributes.severity}`;
          if (!alertSet.has(alertKey)) {
            alertSet.add(alertKey);
            alerts.push({
              header: alert.attributes.header,
              severity: alert.attributes.severity,
              effect: alert.attributes.effect,
            });
          }
        }
      } catch (err) {
        // Ignore alert fetch errors
      }
    });

    await Promise.all(alertPromises);

    // Sort departures by minutes away
    departures.sort((a, b) => a.minutesAway - b.minutesAway);

    // Take only next 20 departures
    const nextDepartures = departures.slice(0, 20);

    const response: StationInfoResponse = {
      stationName: station.trim(),
      departures: nextDepartures,
      alerts,
      lastUpdated: new Date().toISOString(),
    };

    // --- Cache the response for 5 minutes ---
    try {
      await cacheService.set(cacheKey, response, 300); // 5 min TTL
      console.log(
        `[station-info] Cached response for '${station}' (${nextDepartures.length} departures)`,
      );
    } catch (err) {
      console.warn(
        `[station-info] Failed to cache response for '${station}':`,
        err,
      );
    }

    return NextResponse.json(response, {
      status: 200,
      headers: { 'X-Cache': 'MISS' },
    });
  } catch (caught: unknown) {
    const err = toError(caught);

    if (err instanceof AppError) {
      return jsonError(err.message, err.statusCode);
    }

    // Unexpected error → 500
    console.error('[station-info] Unhandled error:', err);
    return jsonError('Internal server error', 500);
  }
}

/**
 * GET handler returns 405 Method Not Allowed with a helpful message.
 */
export async function GET(): Promise<NextResponse> {
  return jsonError('Use POST with { station } body', 405);
}
