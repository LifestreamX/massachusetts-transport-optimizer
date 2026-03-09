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
  };
}

/**
 * Fetch live MBTA data, score every route, and return a ranked list.
 * If origin/destination are provided, filter routes that serve those stops.
 */
export async function optimizeRoute(
  origin?: string,
  destination?: string,
  preference:
    | 'fastest'
    | 'least-transfers'
    | 'most-reliable'
    | 'accessible' = 'fastest',
  transitMode?: string,
): Promise<OptimizeRouteResponse> {
  const FETCH_TIMEOUT_MS = 30_000; // 30s
  const MIN_ROUTES_EXPECTED = 8; // used to mark partial data

  // Simplified approach: Fetch all routes, then filter based on available data
  // This is faster and more reliable than trying to determine direct routes upfront

  let allRoutes: any[] = [];
  try {
    const routeFilter =
      transitMode === 'subway'
        ? '0,1'
        : transitMode === 'commuter'
          ? '2'
          : '0,1';
    allRoutes = await mbtaClient.fetchRoutes(routeFilter);
    console.info(
      `[optimizeRoute] Fetched ${allRoutes.length} routes for transitMode: ${transitMode ?? 'all'}`,
    );
  } catch (err) {
    console.error('[optimizeRoute] Failed to fetch routes:', err);
    return {
      routes: [],
      lastUpdated: new Date().toISOString(),
      usedFallback: false,
    };
  }

  if (allRoutes.length === 0) {
    return {
      routes: [],
      lastUpdated: new Date().toISOString(),
      usedFallback: false,
    };
  }

  // If both origin and destination are provided, filter to only routes that serve both
  let allowedRouteIds: Set<string> | undefined = undefined;
  if (origin && destination) {
    const directLines = findDirectLines(origin, destination);
    allowedRouteIds = new Set(directLines.map((line) => line.id));
    // For Green Line branches, MBTA API uses ids like 'Green-B', 'Green-C', etc.
    // Normalize to lower-case and handle both 'green-b' and 'Green-B' forms
    if (allowedRouteIds.size === 0) {
      // No direct lines, so no valid routes
      return {
        routes: [],
        lastUpdated: new Date().toISOString(),
        usedFallback: false,
      };
    }
    // Filter allRoutes to only those in allowedRouteIds (case-insensitive)
    allRoutes = allRoutes.filter((route) => {
      const routeId = String(route.id).toLowerCase();
      return Array.from(allowedRouteIds).some(
        (allowedId) => routeId === allowedId.toLowerCase(),
      );
    });
  }

  // Fetch live data for all routes in parallel with timeout
  const fetchPromise = (async () => {
    const results = [];
    // Process routes sequentially to avoid rate limiting
    for (const route of allRoutes) {
      try {
        const [predictions, alerts, vehicles] = await Promise.all([
          mbtaClient.fetchPredictions(route.id),
          mbtaClient.fetchAlerts(route.id),
          mbtaClient.fetchVehicles(route.id),
        ]);
        results.push({ route, predictions, alerts, vehicles });

        // Small delay to avoid bursts
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.warn(
          `[optimizeRoute] Failed to fetch data for route ${route.id}:`,
          err,
        );
      }
    }
    return results;
  })();

  const timeoutSignal = Symbol('timeout');
  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve(timeoutSignal), FETCH_TIMEOUT_MS),
  );

  let allRouteData: any[] | undefined;

  const raceResult = await Promise.race([fetchPromise, timeoutPromise]);
  if (raceResult === timeoutSignal) {
    console.warn('[optimizeRoute] MBTA fetch timed out (waiting extended)');
    try {
      allRouteData = (await Promise.race([
        fetchPromise,
        new Promise((resolve) => setTimeout(() => resolve(undefined), 2000)),
      ])) as any[] | undefined;
    } catch (err) {
      console.warn('[optimizeRoute] MBTA fetch failed after timeout', err);
    }
    if (
      !allRouteData ||
      !Array.isArray(allRouteData) ||
      allRouteData.length === 0
    ) {
      return {
        routes: [],
        lastUpdated: new Date().toISOString(),
        usedFallback: false,
      };
    }
  } else {
    allRouteData = raceResult as any[];
  }

  // Process route data and build route options
  let routeOptions: RouteOption[] = [];
  for (const { route, predictions, alerts, vehicles } of allRouteData) {
    const routeName =
      route.attributes.long_name || route.attributes.short_name || route.id;

    const now = Date.now();
    const arrivals = predictions
      .map((p: any) => p.attributes.arrival_time)
      .filter((t: string | null): t is string => t !== null)
      .map((t: string) => new Date(t).getTime())
      .filter((ms: number) => ms > now)
      .sort((a: number, b: number) => a - b);

    if (arrivals.length > 0) {
      // Limit to top 5 upcoming arrivals per route
      for (const arrMs of arrivals.slice(0, 5)) {
        const s = scoreRoute(
          routeName,
          [
            {
              ...predictions[0],
              attributes: {
                ...predictions[0].attributes,
                arrival_time: new Date(arrMs).toISOString(),
              },
            },
          ],
          alerts,
          vehicles,
        );
        routeOptions.push({
          ...toRouteOption({ ...s, nextArrivalMs: arrMs }),
        });
      }
    } else {
      // If no predictions, still show the direct route
      const s = scoreRoute(routeName, predictions, alerts, vehicles);
      routeOptions.push({ ...toRouteOption(s) });
    }
  }

  // Remove duplicates (same routeName + nextArrivalMinutes)
  routeOptions = routeOptions.filter(
    (opt, idx, arr) =>
      arr.findIndex(
        (o) =>
          o.routeName === opt.routeName &&
          o.nextArrivalMinutes === opt.nextArrivalMinutes,
      ) === idx,
  );

  // Apply preference-based sorting
  routeOptions.sort((a, b) => {
    // Fastest: use the total estimated travel time (includes delays)
    if (preference === 'fastest') {
      if (a.totalEstimatedTime !== b.totalEstimatedTime) {
        return a.totalEstimatedTime - b.totalEstimatedTime;
      }
      // tie-breaker: reliability
      if (a.reliabilityScore !== b.reliabilityScore) {
        return b.reliabilityScore - a.reliabilityScore;
      }
    } else if (preference === 'most-reliable') {
      if (a.reliabilityScore !== b.reliabilityScore) {
        return b.reliabilityScore - a.reliabilityScore;
      }
      // tie-breaker: total estimated time
      if (a.totalEstimatedTime !== b.totalEstimatedTime) {
        return a.totalEstimatedTime - b.totalEstimatedTime;
      }
    } else if (preference === 'accessible') {
      // If accessibility data becomes available prefer accessible routes.
      // For now fallback to reliability then time.
      if (a.reliabilityScore !== b.reliabilityScore) {
        return b.reliabilityScore - a.reliabilityScore;
      }
      if (a.totalEstimatedTime !== b.totalEstimatedTime) {
        return a.totalEstimatedTime - b.totalEstimatedTime;
      }
    } else if (preference === 'least-transfers') {
      // Transfers are not modelled in single-route responses; if a
      // transfersEstimate field is present prefer lower values. Otherwise
      // fallback to totalEstimatedTime.
      const aTransfers =
        (a as any).transfersEstimate ?? Number.POSITIVE_INFINITY;
      const bTransfers =
        (b as any).transfersEstimate ?? Number.POSITIVE_INFINITY;
      if (aTransfers !== bTransfers) return aTransfers - bTransfers;
      if (a.totalEstimatedTime !== b.totalEstimatedTime) {
        return a.totalEstimatedTime - b.totalEstimatedTime;
      }
    }

    // Final deterministic tie-breakers: next arrival then route name
    const am = a.nextArrivalMinutes ?? Number.POSITIVE_INFINITY;
    const bm = b.nextArrivalMinutes ?? Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    return a.routeName.localeCompare(b.routeName);
  });

  // Limit to top 10 for UI
  const resultRoutes = routeOptions.slice(0, 10);

  const partialData =
    Array.isArray(allRouteData) && allRouteData.length < MIN_ROUTES_EXPECTED;

  return {
    routes: resultRoutes,
    lastUpdated: new Date().toISOString(),
    usedFallback: undefined,
    partialData: partialData || undefined,
  };
}

// getLinesForStation is now obsolete; use MBTA API dynamically
