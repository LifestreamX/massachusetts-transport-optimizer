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
import { findDirectLines } from '../data/stationsByLine';

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

  // Step 1: Find direct lines (routes that serve both origin and destination)
  const directLines = findDirectLines(origin, destination);
  if (directLines.length === 0) {
    return {
      routes: [],
      lastUpdated: new Date().toISOString(),
      usedFallback: false,
    };
  }

  console.info(
    `[optimizeRoute] Found ${directLines.length} direct lines from ${origin} to ${destination}: ${directLines.map((l) => l.id).join(', ')}`,
  );

  // Step 2: Get the origin stop ID by fetching stops for the valid routes and matching by name
  let originStopId: string | undefined;
  try {
    // Try fetching stops by querying for the origin name
    const possibleStops = await mbtaClient.fetchStops({ query: origin });

    if (possibleStops.length === 0) {
      // Fallback: fetch all stops and find by fuzzy match
      const allStops = await mbtaClient.fetchStops();
      const originLower = origin.toLowerCase();
      const originStop = allStops.find(
        (s) =>
          s.attributes.name.toLowerCase().includes(originLower) ||
          s.attributes.name.toLowerCase() === originLower,
      );
      originStopId = originStop?.id;
    } else {
      // Use the first matching stop (or find the best match)
      const originLower = origin.toLowerCase();
      const exactMatch = possibleStops.find(
        (s) => s.attributes.name.toLowerCase() === originLower,
      );
      const partialMatch = possibleStops.find((s) =>
        s.attributes.name.toLowerCase().includes(originLower),
      );
      originStopId = exactMatch?.id || partialMatch?.id || possibleStops[0]?.id;
    }

    if (!originStopId) {
      console.warn(
        `[optimizeRoute] Could not find stop ID for origin: ${origin}`,
      );
      return {
        routes: [],
        lastUpdated: new Date().toISOString(),
        usedFallback: false,
      };
    }
    console.info(
      `[optimizeRoute] Origin stop ID: ${originStopId} for "${origin}"`,
    );
  } catch (err) {
    console.error('[optimizeRoute] Failed to fetch stops:', err);
    return {
      routes: [],
      lastUpdated: new Date().toISOString(),
      usedFallback: false,
    };
  }

  // Step 3: Fetch predictions for the origin stop
  let allPredictions: any[] = [];
  try {
    allPredictions = await mbtaClient.fetchPredictionsByStop(originStopId);
    console.info(
      `[optimizeRoute] Fetched ${allPredictions.length} predictions for stop ${originStopId}`,
    );
  } catch (err) {
    console.error('[optimizeRoute] Failed to fetch predictions:', err);
    return {
      routes: [],
      lastUpdated: new Date().toISOString(),
      usedFallback: false,
    };
  }

  // Step 4: Filter predictions by valid routes and direction
  const now = Date.now();
  const validRouteIds = new Set(
    directLines.map((line) => line.id.toLowerCase()),
  );

  // Group predictions by route
  const predictionsByRoute = new Map<string, any[]>();
  for (const pred of allPredictions) {
    const routeId = pred.relationships?.route?.data?.id;
    if (!routeId) continue;

    const normalizedRouteId = routeId.toLowerCase();
    if (!validRouteIds.has(normalizedRouteId)) continue;

    // Check if this prediction has a valid arrival or departure time in the future
    const arrivalTime =
      pred.attributes.arrival_time || pred.attributes.departure_time;
    if (!arrivalTime) continue;

    const arrivalMs = new Date(arrivalTime).getTime();
    if (arrivalMs <= now) continue;

    // Determine expected direction for this route
    const line = directLines.find(
      (l) => l.id.toLowerCase() === normalizedRouteId,
    );
    const expectedDirection = line
      ? getDirectionForTrip(line, origin, destination)
      : undefined;

    // Filter by direction if we know it
    const predDirection = pred.attributes.direction_id;
    if (expectedDirection !== undefined) {
      if (predDirection === undefined) {
        console.warn(
          `[optimizeRoute] Prediction missing direction_id: route=${routeId}, origin=${origin}, destination=${destination}, expectedDirection=${expectedDirection}`,
        );
        // Allow through if direction is missing
      } else if (predDirection !== expectedDirection) {
        console.info(
          `[optimizeRoute] Skipping prediction: route=${routeId}, predDirection=${predDirection}, expectedDirection=${expectedDirection}`,
        );
        continue; // Wrong direction
      }
    }

    if (!predictionsByRoute.has(normalizedRouteId)) {
      predictionsByRoute.set(normalizedRouteId, []);
    }
    predictionsByRoute.get(normalizedRouteId)!.push(pred);
  }

  console.info(
    `[optimizeRoute] Found predictions for ${predictionsByRoute.size} routes`,
  );

  // Step 5: Fetch route details, alerts, and vehicles for valid routes
  const routeFilter =
    transitMode === 'subway' ? '0,1' : transitMode === 'commuter' ? '2' : '0,1';
  let allRoutes: any[] = [];
  try {
    allRoutes = await mbtaClient.fetchRoutes(routeFilter);
  } catch (err) {
    console.error('[optimizeRoute] Failed to fetch routes:', err);
  }

  const validRoutes = allRoutes.filter((route) =>
    validRouteIds.has(route.id.toLowerCase()),
  );

  // Step 6: Build route options (up to 5 per route)
  let routeOptions: RouteOption[] = [];
  for (const route of validRoutes) {
    const normalizedRouteId = route.id.toLowerCase();
    const predictions = predictionsByRoute.get(normalizedRouteId);
    if (!predictions || predictions.length === 0) continue;

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

    // Create a route option for each of the top 5 predictions
    for (const pred of sortedPredictions) {
      const arrivalTime =
        pred.attributes.arrival_time || pred.attributes.departure_time;
      const arrivalMs = new Date(arrivalTime).getTime();

      const s = scoreRoute(routeName, [pred], alerts, vehicles);

      routeOptions.push({
        ...toRouteOption({
          ...s,
          nextArrivalMs: arrivalMs,
          routeId: route.id,
          stopId: pred.relationships?.stop?.data?.id || originStopId,
          directionId: pred.attributes.direction_id,
        }),
      });
    }
  }

  // Step 7: Remove duplicates (same route + arrival time)
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

  // Step 8: Sort by fastest arrival, then reliability
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
