/**
 * Decision engine – orchestrates data retrieval, scoring, and ranking.
 *
 * This is the single entry point for the API route.
 * It delegates to `scoring.ts` for pure computations and to `mbtaClient`
 * for external data.
 */

import { mbtaClient } from '../mbta/mbtaClient';
import { scoreRoute, type RouteScore } from './scoring';
import type {
  OptimizeRouteResponse,
  RouteOption,
} from '../../types/routeTypes';
import { findLinesOriginToDestination } from '../data/stationsByLine';
import { cacheService } from '../cache/cacheService';

/* ------------------------------------------------------------------ */
/*  Route→Stop caching helper                                          */
/* ------------------------------------------------------------------ */

/**
 * Cache route→stop mappings to reduce repeated MBTA API calls.
 * Key format: `route-stop-map:{routeId}:{stationName}`
 * TTL: 24 hours (stop mappings are relatively stable)
 */
async function getStopIdForRoute(
  routeId: string,
  stationName: string,
): Promise<string | null> {
  const cacheKey = `route-stop-map:${routeId}:${stationName.toLowerCase()}`;
  
  return cacheService.getOrFetch(
    cacheKey,
    async () => {
      const routeStops = await mbtaClient.fetchStops({ routeId });
      const stationLower = stationName.toLowerCase();
      
      const stopForRoute = routeStops.find(
        (s: any) =>
          s.attributes.name.toLowerCase() === stationLower ||
          s.attributes.name.toLowerCase().includes(stationLower),
      );
      
      return stopForRoute?.id || null;
    },
    24 * 60 * 60, // 24 hours
  );
}

/* ------------------------------------------------------------------ */
/*  Deterministic sorting                                              */
/* ------------------------------------------------------------------ */

/**
 * Sort rules (deterministic):
 *  1. totalEstimatedTime ASC
 *  2. reliabilityScore DESC
 *  3. routeName ASC (tie-breaker for full determinism)
 */
function compareRoutes(a: RouteScore, b: RouteScore): number {
  if (a.totalEstimatedTime !== b.totalEstimatedTime) {
    return a.totalEstimatedTime - b.totalEstimatedTime;
  }
  if (a.reliabilityScore !== b.reliabilityScore) {
    return b.reliabilityScore - a.reliabilityScore;
  }
  return a.routeName.localeCompare(b.routeName);
}

/* ------------------------------------------------------------------ */
/*  Main optimiser                                                     */
/* ------------------------------------------------------------------ */

function toRouteOption(score: RouteScore): RouteOption {
  return {
    routeName: score.routeName,
    totalEstimatedTime: score.totalEstimatedTime,
    delayMinutes: score.delayMinutes,
    reliabilityScore: score.reliabilityScore,
    alertSummary: score.alertSummary,
    nextArrivalISO: score.nextArrivalMs
      ? new Date(score.nextArrivalMs).toISOString()
      : undefined,
    nextArrivalMinutes:
      typeof score.nextArrivalMs === 'number'
        ? Math.max(0, Math.round((score.nextArrivalMs - Date.now()) / 60_000))
        : undefined,
    routeId: score.routeId || '',
    stopId: score.stopId || '',
    directionId: score.directionId,
  };
}

/**
 * Helper: Determine the direction (0 or 1) that goes from origin to destination on a given line.
 * Returns the direction ID, or undefined if origin/destination not found or they're the same.
 */
function getDirectionForTrip(
  line: any,
  origin: string,
  destination: string,
): number | undefined {
  if (!line.stations || !Array.isArray(line.stations)) return undefined;

  const originIdx = line.stations.findIndex(
    (s: string) => s.toLowerCase() === origin.toLowerCase(),
  );
  const destIdx = line.stations.findIndex(
    (s: string) => s.toLowerCase() === destination.toLowerCase(),
  );

  if (originIdx === -1 || destIdx === -1 || originIdx === destIdx)
    return undefined;

  // MBTA Red Line: direction_id is 0 (southbound/outbound), 1 (northbound/inbound)
  // For Red Line, invert the logic
  if (line.id && line.id.toLowerCase() === 'red') {
    return destIdx > originIdx ? 0 : 1;
  }
  // For other lines, use default heuristic
  return destIdx > originIdx ? 1 : 0;
}

/**
 * Fetch live MBTA data, score every route, and return a ranked list.
 * If origin/destination are provided, filter routes that serve those stops.
 * NEW LOGIC: Fetches predictions by origin stop, filters by direction, and returns 5 upcoming trains per route.
 */
export async function optimizeRoute(
  origin?: string,
  destination?: string,
  transitMode?: string,
): Promise<OptimizeRouteResponse> {
  const FETCH_TIMEOUT_MS = 30_000; // 30s
  const MIN_ROUTES_EXPECTED = 8; // used to mark partial data

  // Must have both origin and destination for proper filtering
  if (!origin || !destination) {
    return {
      routes: [],
      lastUpdated: new Date().toISOString(),
      usedFallback: false,
    };
  }

  // Step 1: Find all lines (subway or commuter rail) where origin comes before destination
  const directLines = findLinesOriginToDestination(origin, destination);
  if (directLines.length === 0) {
    // Try fallback: fuzzy match with all stations
    const { getAllStations } = await import('../data/stationsByLine');
    const allStations = getAllStations();
    function normalizeStationName(name: string): string {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
    }
    const normOrigin = normalizeStationName(origin);
    const normDest = normalizeStationName(destination);
    const fuzzyOrigin = allStations.find(
      (s) =>
        normalizeStationName(s) === normOrigin ||
        normalizeStationName(s).includes(normOrigin) ||
        normOrigin.includes(normalizeStationName(s)),
    );
    const fuzzyDest = allStations.find(
      (s) =>
        normalizeStationName(s) === normDest ||
        normalizeStationName(s).includes(normDest) ||
        normDest.includes(normalizeStationName(s)),
    );
    if (fuzzyOrigin && fuzzyDest) {
      const fallbackLines = findLinesOriginToDestination(
        fuzzyOrigin,
        fuzzyDest,
      );
      if (fallbackLines.length > 0) {
        console.warn(
          `[optimizeRoute] Fallback: matched origin='${origin}'→'${fuzzyOrigin}', destination='${destination}'→'${fuzzyDest}'`,
        );
        return await optimizeRoute(fuzzyOrigin, fuzzyDest, transitMode);
      }
    }
    console.warn(
      `[optimizeRoute] No direct lines found for origin='${origin}', destination='${destination}' even after fallback.`,
    );
    return {
      routes: [],
      lastUpdated: new Date().toISOString(),
      usedFallback: true,
    };
  }

  console.info(
    `[optimizeRoute] Found ${directLines.length} lines from ${origin} to ${destination} (direction-aware): ${directLines.map((l) => l.id).join(', ')}`,
  );

  // Determine route filter based on transitMode so we fetch only relevant MBTA routes
  const routeFilter =
    transitMode === 'subway'
      ? '0,1'
      : transitMode === 'commuter'
        ? '2'
        : '0,1,2'; // include commuter for 'all'

  // Fetch MBTA routes up front and map local `directLines` to MBTA route IDs.
  // This is necessary because our local line IDs (e.g., 'fitchburg') don't always
  // match MBTA route resource IDs (e.g., 'CR-Fitchburg'). We'll match by name.
  let allRoutesForMode: any[] = [];
  try {
    allRoutesForMode = await mbtaClient.fetchRoutes(routeFilter);
  } catch (err) {
    console.warn(
      '[optimizeRoute] Could not fetch MBTA routes for mapping:',
      err,
    );
  }

  // Build a set of valid MBTA route IDs that correspond to our `directLines`.
  const validRouteIds = new Set<string>();
  const mbtaRouteIdToLine = new Map<string, any>();
  const normalize = (s: string) =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  const directLineNameNorms = directLines.map((l) => normalize(l.name));
  const directLineIdNorms = directLines.map((l) => normalize(l.id));
  for (const r of allRoutesForMode) {
    const longName = r.attributes?.long_name || '';
    const shortName = r.attributes?.short_name || '';
    const candidate = normalize(longName + ' ' + shortName + ' ' + r.id);
    // If the MBTA route's normalized name/id contains any of our direct line names/ids, accept it
    if (
      directLineNameNorms.some((dn) => candidate.includes(dn)) ||
      directLineIdNorms.some((di) => candidate.includes(di))
    ) {
      const rid = (r.id || '').toLowerCase();
      validRouteIds.add(rid);
      // map MBTA route id -> the matching direct line (first match)
      const matched = directLines.find(
        (l) =>
          candidate.includes(normalize(l.name)) ||
          candidate.includes(normalize(l.id)),
      );
      if (matched) mbtaRouteIdToLine.set(rid, matched);
    }
  }

  // If we couldn't map any MBTA routes (edge case), fall back to using local ids
  if (validRouteIds.size === 0) {
    for (const l of directLines) validRouteIds.add((l.id || '').toLowerCase());
  }

  // Step 2: Build a map of route ID -> stop ID for the origin station
  // KEY FIX: Each route (especially commuter rail) may use different stop IDs for the same station
  // OPTIMIZATION: Cache route→stop mappings to reduce repeated API calls
  const routeToOriginStopId = new Map<string, string>();
  for (const route of allRoutesForMode) {
    const normalizedRouteId = route.id.toLowerCase();
    if (!validRouteIds.has(normalizedRouteId)) continue;

    try {
      // Use cached lookup for route→stop mapping
      const stopId = await getStopIdForRoute(route.id, origin);
      
      if (stopId) {
        routeToOriginStopId.set(normalizedRouteId, stopId);
        console.info(
          `[optimizeRoute] Route ${route.id} -> origin stop ${stopId}`,
        );
      }
    } catch (err) {
      console.warn(
        `[optimizeRoute] Failed to fetch stops for route ${route.id}:`,
        err,
      );
    }
  }

  if (routeToOriginStopId.size === 0) {
    console.warn(
      `[optimizeRoute] Could not find any origin stops for "${origin}" on the valid routes`,
    );
    return {
      routes: [],
      lastUpdated: new Date().toISOString(),
      usedFallback: false,
    };
  }

  // Step 3: Fetch predictions per route using the correct stop ID for each route
  const now = Date.now();
  const predictionsByRoute = new Map<string, any[]>();

  for (const [normalizedRouteId, stopId] of routeToOriginStopId.entries()) {
    try {
      const predictions = await mbtaClient.fetchPredictionsByStop(stopId);
      console.info(
        `[optimizeRoute] Fetched ${predictions.length} predictions for route ${normalizedRouteId} at stop ${stopId}`,
      );

      // Filter predictions for this route and future arrivals
      const line =
        mbtaRouteIdToLine.get(normalizedRouteId) ||
        directLines.find((l) => l.id.toLowerCase() === normalizedRouteId);
      const expectedDirection = line
        ? getDirectionForTrip(line, origin, destination)
        : undefined;

      const validPredictions = predictions.filter((pred: any) => {
        const routeId = pred.relationships?.route?.data?.id?.toLowerCase();
        if (routeId !== normalizedRouteId) return false;

        const arrivalTime =
          pred.attributes.arrival_time || pred.attributes.departure_time;
        if (!arrivalTime) return false;

        const arrivalMs = new Date(arrivalTime).getTime();
        if (arrivalMs <= now) return false;

        // Filter by direction if known
        const predDirection = pred.attributes.direction_id;
        if (expectedDirection !== undefined && predDirection !== undefined) {
          if (predDirection !== expectedDirection) {
            console.info(
              `[optimizeRoute] Skipping prediction: route=${routeId}, predDirection=${predDirection}, expectedDirection=${expectedDirection}`,
            );
            return false;
          }
        }

        return true;
      });

      if (validPredictions.length > 0) {
        predictionsByRoute.set(normalizedRouteId, validPredictions);
      }
    } catch (err) {
      console.warn(
        `[optimizeRoute] Failed to fetch predictions for route ${normalizedRouteId}:`,
        err,
      );
    }
  }

  // Step 6: Prepare route details for the valid MBTA routes we mapped earlier.
  // Reuse previously fetched `allRoutesForMode` when available.
  let allRoutes: any[] =
    allRoutesForMode && allRoutesForMode.length > 0 ? allRoutesForMode : [];
  if (allRoutes.length === 0) {
    // As a last resort fetch all route types so we can still build options
    try {
      allRoutes = await mbtaClient.fetchRoutes('0,1,2');
    } catch (err) {
      console.error('[optimizeRoute] Failed to fetch routes:', err);
    }
  }

  const validRoutes = allRoutes.filter((route) =>
    validRouteIds.has((route.id || '').toLowerCase()),
  );

  // Step 4: Build route options (up to 5 per route, fallback if none)
  let routeOptions: RouteOption[] = [];
  for (const route of validRoutes) {
    const normalizedRouteId = route.id.toLowerCase();
    const predictions = predictionsByRoute.get(normalizedRouteId);
    const routeOriginStopId = routeToOriginStopId.get(normalizedRouteId);

    // Skip this route if we don't have a valid origin stop for it
    if (!routeOriginStopId) {
      console.warn(
        `[optimizeRoute] Skipping route ${route.id}: no origin stop found`,
      );
      continue;
    }

    // Fetch alerts and vehicles for this route
    let alerts: any[] = [];
    let vehicles: any[] = [];
    try {
      [alerts, vehicles] = await Promise.all([
        mbtaClient.fetchAlerts(route.id),
        mbtaClient.fetchVehicles(route.id),
      ]);
    } catch (err) {
      console.warn(
        `[optimizeRoute] Failed to fetch alerts/vehicles for route ${route.id}:`,
        err,
      );
    }

    const routeName =
      route.attributes.long_name || route.attributes.short_name || route.id;

    if (predictions && predictions.length > 0) {
      // Sort predictions by arrival time and take first 5
      const sortedPredictions = predictions
        .sort((a, b) => {
          const aTime = new Date(
            a.attributes.arrival_time || a.attributes.departure_time,
          ).getTime();
          const bTime = new Date(
            b.attributes.arrival_time || b.attributes.departure_time,
          ).getTime();
          return aTime - bTime;
        })
        .slice(0, 5);

      // Create a route option for each of the top 5 predictions
      for (const pred of sortedPredictions) {
        const arrivalTime =
          pred.attributes.arrival_time || pred.attributes.departure_time;
        const arrivalMs = new Date(arrivalTime).getTime();
        const s = scoreRoute(routeName, [pred], alerts, vehicles);

        // Fetch stop info
        let stopName, platformName, wheelchairBoarding;
        if (pred.relationships?.stop?.data?.id) {
          const stops = await mbtaClient.fetchStops({});
          const stop = stops.find(
            (s) => s.id === pred.relationships.stop.data.id,
          );
          if (stop) {
            stopName = stop.attributes.name;
            platformName = stop.attributes.platform_name;
            wheelchairBoarding = stop.attributes.wheelchair_boarding;
          }
        }

        // Direction info
        const directionId = pred.attributes.direction_id;
        const directionName =
          route.attributes.direction_names?.[directionId] || undefined;
        const directionDestination =
          route.attributes.direction_destinations?.[directionId] || undefined;

        // Vehicle info
        let vehicleStatus, vehicleUpdatedAt;
        if (vehicles.length > 0) {
          const v = vehicles.find(
            (v) => v.attributes.direction_id === directionId,
          );
          if (v) {
            vehicleStatus = v.attributes.current_status;
            vehicleUpdatedAt = v.attributes.updated_at;
          }
        }

        // Route short name, description, headsign
        const routeShortName = route.attributes.short_name;
        const routeDescription = route.attributes.description;
        let headsign = directionDestination;
        // If prediction has trip/headsign, prefer that (not shown in current types, but could be added)

        routeOptions.push({
          ...toRouteOption({
            ...s,
            nextArrivalMs: arrivalMs,
            routeId: route.id,
            stopId: pred.relationships?.stop?.data?.id || routeOriginStopId,
            directionId,
          }),
          hasPrediction: true,
          stopName,
          platformName: platformName ?? undefined,
          wheelchairBoarding,
          directionName,
          directionDestination,
          vehicleStatus,
          vehicleUpdatedAt,
          routeShortName,
          routeDescription,
          headsign,
          lastUpdated: new Date().toISOString(),
        });
      }
    } else {
      // No predictions: attempt schedules fallback (use MBTA schedules)
      const s = scoreRoute(routeName, [], alerts, vehicles);
      // Use route-specific origin stop for fallback info
      let stopName, platformName, wheelchairBoarding;
      const stops = await mbtaClient.fetchStops({});
      const stop = stops.find((s) => s.id === routeOriginStopId);
      if (stop) {
        stopName = stop.attributes.name;
        platformName = stop.attributes.platform_name;
        wheelchairBoarding = stop.attributes.wheelchair_boarding;
      }
      const directionId = undefined;
      const directionName = undefined;
      const directionDestination = undefined;
      let vehicleStatus, vehicleUpdatedAt;
      if (vehicles.length > 0) {
        const v = vehicles[0];
        vehicleStatus = v.attributes.current_status;
        vehicleUpdatedAt = v.attributes.updated_at;
      }
      const routeShortName = route.attributes.short_name;
      const routeDescription = route.attributes.description;
      const headsign = undefined;

      // Try fetching schedules for this route at the route-specific origin stop
      let scheduleNextMs: number | undefined;
      try {
        const schedules = await mbtaClient.fetchSchedules(
          route.id,
          routeOriginStopId,
        );
        console.info(
          `[optimizeRoute] Fetched ${schedules.length} schedules for ${route.id} @ ${routeOriginStopId}`,
        );
        if (Array.isArray(schedules) && schedules.length > 0) {
          const nextSched = schedules.find((sch: any) => {
            const t =
              sch.attributes.arrival_time || sch.attributes.departure_time;
            if (!t) return false;
            return new Date(String(t)).getTime() > now;
          });
          if (nextSched) {
            const t =
              nextSched.attributes.arrival_time ||
              nextSched.attributes.departure_time;
            if (t) scheduleNextMs = new Date(String(t)).getTime();
          }
        }
      } catch (err) {
        console.warn(
          `[optimizeRoute] Failed to fetch schedules for ${route.id} @ ${routeOriginStopId}:`,
          err,
        );
      }

      routeOptions.push({
        ...toRouteOption({
          ...s,
          nextArrivalMs: scheduleNextMs,
          routeId: route.id,
          stopId: routeOriginStopId,
          directionId,
        }),
        hasPrediction: false,
        hasSchedule: typeof scheduleNextMs === 'number' ? true : false,
        stopName,
        platformName: platformName ?? undefined,
        wheelchairBoarding,
        directionName,
        directionDestination,
        vehicleStatus,
        vehicleUpdatedAt,
        routeShortName,
        routeDescription,
        headsign,
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  // Step 8: Remove duplicates (same route + arrival time)
  routeOptions = routeOptions.filter(
    (opt, idx, arr) =>
      arr.findIndex(
        (o) =>
          o.routeId === opt.routeId && o.nextArrivalISO === opt.nextArrivalISO,
      ) === idx,
  );

  console.info(
    `[optimizeRoute] Created ${routeOptions.length} route options after deduplication`,
  );

  // Step 9: Sort by fastest arrival, then reliability
  routeOptions.sort((a, b) => {
    const am = a.nextArrivalMinutes ?? Number.POSITIVE_INFINITY;
    const bm = b.nextArrivalMinutes ?? Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    if (a.reliabilityScore !== b.reliabilityScore) {
      return b.reliabilityScore - a.reliabilityScore;
    }
    return a.routeName.localeCompare(b.routeName);
  });

  // Limit to top 10 for UI
  const resultRoutes = routeOptions.slice(0, 10);

  const partialData = resultRoutes.length < 5;

  return {
    routes: resultRoutes,
    lastUpdated: new Date().toISOString(),
    usedFallback: undefined,
    partialData: partialData || undefined,
  };
}

// getLinesForStation is now obsolete; use MBTA API dynamically
