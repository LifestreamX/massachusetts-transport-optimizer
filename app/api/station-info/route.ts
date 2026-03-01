/**
 * POST /api/station-info
 *
 * Accepts { station } and returns all departures/arrivals for that station.
 * Shows real-time predictions, schedules, alerts, and vehicle locations.
 */

import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';
import { AppError, BadRequestError, toError } from '@/lib/utils/errors';

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

    // --- Fetch station data (optimized) -------------------------------------
    // 1. Find all routes that serve the selected station
    let routesServingStation = [];
    try {
      const allRoutes = await mbtaClient.fetchRoutes('0,1,2');
      let allStops = [];
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
              .replace(/\b(station|stn|st|center|centre|ctr|square|sq|plaza)\b/g, ' ')
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
            const starts = normName.startsWith(normInput) || normInput.startsWith(normName);
            const score = overlap + prefixMatches * 2 + (starts ? 10 : 0);
            return score;
          }

          const scored = allStops
            .map((stop) => ({ stop, score: scoreName(stop.attributes.name || '') }))
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score);

          if (scored.length > 0) {
            const topScore = scored[0].score;
            // accept any stop within 60% of top score or with reasonable absolute score
            const threshold = Math.max(Math.ceil(topScore * 0.6), 2);
            allStops = scored.filter((s) => s.score >= threshold).map((s) => s.stop);
            console.log(`[station-info] Fuzzy matched ${allStops.length} stops for '${station}' (top=${topScore})`);
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
      const stopIds = new Set(allStops.map((stop) => stop.id));
      routesServingStation = allRoutes.filter((route) => {
        return route.stops?.some((stopId) => stopIds.has(stopId));
      });
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

    // 2. Fetch predictions, alerts, and vehicles for only those routes
    const departures: StationInfoResponse['departures'] = [];
    const alerts: StationInfoResponse['alerts'] = [];
    const alertSet = new Set<string>();
    for (const route of routesServingStation) {
      try {
        const [predictions, routeAlerts] = await Promise.all([
          mbtaClient.fetchPredictions(route.id),
          mbtaClient.fetchAlerts(route.id),
        ]);
        const routeName =
          route.attributes.long_name || route.attributes.short_name || route.id;
        for (const prediction of predictions) {
          const departureTime = prediction.attributes.departure_time;
          const arrivalTime = prediction.attributes.arrival_time;
          if (departureTime || arrivalTime) {
            const routeType = route.attributes.type;
            const mode =
              routeType === 2
                ? 'commuter'
                : routeType === 0
                  ? 'light-rail'
                  : 'subway';
            departures.push({
              routeName,
              destination:
                route.attributes.direction_destinations?.[
                  prediction.attributes.direction_id
                ] || 'Unknown',
              departureTime,
              arrivalTime,
              minutesAway: calculateMinutesAway(departureTime || arrivalTime),
              status: prediction.attributes.status,
              tripHeadsign:
                route.attributes.direction_destinations?.[
                  prediction.attributes.direction_id
                ] || 'Unknown',
              track: null,
              mode,
            });
          }
        }
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
        console.error(
          `[station-info] Error fetching data for route ${route.id}:`,
          err,
        );
      }
    }

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

    return NextResponse.json(response, { status: 200 });
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
