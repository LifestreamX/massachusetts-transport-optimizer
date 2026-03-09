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
import { ALL_LINES, findDirectLines } from '../data/stationsByLine';

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
): Promise<OptimizeRouteResponse> {
  // Avoid long-running MBTA fetches causing request timeouts. MBTA can be
  // slow or rate-limited; prefer a short timeout so we can fall back to
  // synthetic data quickly and keep the API responsive in degraded states.
  const FETCH_TIMEOUT_MS = 5_000; // 5s (reduced from 60s)

  const MIN_ROUTES_EXPECTED = 10; // used to mark partial data

  const fetchPromise = mbtaClient.fetchAllRouteData();
  const timeoutSignal = Symbol('timeout');

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve(timeoutSignal), FETCH_TIMEOUT_MS),
  );

  let allRouteData: any[] | undefined;
  let usedFallback = false;

  const raceResult = await Promise.race([fetchPromise, timeoutPromise]);
  if (raceResult === timeoutSignal) {
    // MBTA fetch didn't finish within timeout. Try to await a short grace
    // period to allow partial responses; otherwise use synthetic fallback.
    console.warn('[optimizeRoute] MBTA fetch timed out (waiting extended)');
    try {
      // small additional grace period for the fetch to finish
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
      usedFallback = true;
      console.warn('[optimizeRoute] using synthetic fallback dataset');
      // Provide a small, meaningful fallback set consisting of major
      // MBTA lines so the UI can show reasonable options when live data
      // is unavailable. These entries intentionally omit predictions.
      const fallbackRoutes = [
        {
          id: 'Red',
          attributes: {
            long_name: 'Red Line',
            short_name: 'Red',
            type: 1,
            description: 'Red Line (fallback)',
            direction_names: ['Southbound', 'Northbound'],
            direction_destinations: ['Braintree/Ashmont', 'Alewife'],
          },
        },
        {
          id: 'Orange',
          attributes: {
            long_name: 'Orange Line',
            short_name: 'Orange',
            type: 1,
            description: 'Orange Line (fallback)',
            direction_names: ['Southbound', 'Northbound'],
            direction_destinations: ['Forest Hills', 'Oak Grove'],
          },
        },
        {
          id: 'Blue',
          attributes: {
            long_name: 'Blue Line',
            short_name: 'Blue',
            type: 1,
            description: 'Blue Line (fallback)',
            direction_names: ['Outbound', 'Inbound'],
            direction_destinations: ['Wonderland', 'Bowdoin'],
          },
        },
        {
          id: 'Green-B',
          attributes: {
            long_name: 'Green Line B',
            short_name: 'Green-B',
            type: 0,
            description: 'Green Line B (fallback)',
            direction_names: ['Outbound', 'Inbound'],
            direction_destinations: ['Boston College', 'Park Street'],
          },
        },
        {
          id: 'Green-C',
          attributes: {
            long_name: 'Green Line C',
            short_name: 'Green-C',
            type: 0,
            description: 'Green Line C (fallback)',
            direction_names: ['Outbound', 'Inbound'],
            direction_destinations: ['Cleveland Circle', 'North Station'],
          },
        },
        {
          id: 'Green-D',
          attributes: {
            long_name: 'Green Line D',
            short_name: 'Green-D',
            type: 0,
            description: 'Green Line D (fallback)',
            direction_names: ['Outbound', 'Inbound'],
            direction_destinations: ['Riverside', 'Government Center'],
          },
        },
        {
          id: 'Green-E',
          attributes: {
            long_name: 'Green Line E',
            short_name: 'Green-E',
            type: 0,
            description: 'Green Line E (fallback)',
            direction_names: ['Outbound', 'Inbound'],
            direction_destinations: ['Heath Street', 'Lechmere'],
          },
        },
      ];

      allRouteData = fallbackRoutes.map((r) => ({
        route: r,
        predictions: [],
        alerts: [],
        vehicles: [],
      }));

      // Filter fallback routes based on origin/destination connectivity
      if (origin && destination) {
        const validLines = findDirectLines(origin, destination);
        const validLineNames = validLines.map((line) =>
          line.name.toLowerCase(),
        );

        if (validLineNames.length > 0) {
          allRouteData = allRouteData.filter(({ route }) => {
            const routeName = (
              route.attributes.long_name ||
              route.attributes.short_name ||
              route.id
            )
              .toString()
              .toLowerCase();
            return validLineNames.some((validName) =>
              routeName.includes(validName),
            );
          });
        } else {
          // No direct lines found - return empty array
          allRouteData = [];
        }
      }

      // If we are using the synthetic fallback, construct and return a
      // minimal set of RouteOptions immediately so the client sees useful
      // options without further MBTA-dependent processing.
      const fallbackMapped = allRouteData.map(
        ({ route, predictions, alerts, vehicles }) => {
          const s = scoreRoute(
            route.attributes.long_name ||
              route.attributes.short_name ||
              route.id,
            predictions,
            alerts,
            vehicles,
          );
          return {
            ...toRouteOption(s),
          } as RouteOption;
        },
      );

      const RETURN_N = 10;
      return {
        routes: fallbackMapped.slice(0, RETURN_N),
        lastUpdated: new Date().toISOString(),
        usedFallback: true,
      };
    }
  } else {
    allRouteData = raceResult as any[];
  }

  // If origin/destination provided, attempt a filter using our
  // station->line metadata to only show routes that serve both stations.
  let filteredRouteData: any[] = allRouteData as any[];
  try {
    if (origin && destination) {
      const validLines = findDirectLines(origin, destination);
      const validLineNames = validLines.map((line) => line.name.toLowerCase());

      if (validLineNames.length > 0) {
        const source = allRouteData as any[];
        filteredRouteData = source.filter(({ route }) => {
          const name = (
            (route.attributes &&
              (route.attributes.long_name || route.attributes.short_name)) ||
            route.id
          )
            .toString()
            .toLowerCase();
          // Match if route long_name contains any of the valid line names
          return validLineNames.some((ln) => name.includes(ln));
        });
      } else {
        // No direct lines found - return empty array
        filteredRouteData = [];
      }
    }
  } catch (err) {
    // If any error happens, fall back to returning all routes
    console.warn('[optimizeRoute] Error filtering by origin/destination', err);
    filteredRouteData = allRouteData;
  }

  // --- NEW LOGIC: For direct lines, return multiple RouteOptions per upcoming train ---
  // Prepare metadata for heuristics
  const od = [origin, destination].filter(Boolean) as string[];
  const selectedLineNames = od.length
    ? ALL_LINES.filter((line) => od.some((s) => line.stations.includes(s))).map(
        (l) => l.name.toLowerCase(),
      )
    : [];

  let originStopIds: string[] = [];
  let destStopIds: string[] = [];
  let originStops: string[] = [];
  let destStops: string[] = [];
  let originWheelchair = false;
  let destWheelchair = false;
  try {
    if (origin && typeof (mbtaClient as any).fetchStops === 'function') {
      const os = await (mbtaClient as any).fetchStops(origin);
      originStops = os.map((s: any) => (s.attributes.name ?? '').toString());
      originStopIds = os.map((s: any) => s.id);
      originWheelchair = os.some(
        (s: any) => s.attributes.wheelchair_boarding === 1,
      );
    }
    if (destination && typeof (mbtaClient as any).fetchStops === 'function') {
      const ds = await (mbtaClient as any).fetchStops(destination);
      destStops = ds.map((s: any) => (s.attributes.name ?? '').toString());
      destStopIds = ds.map((s: any) => s.id);
      destWheelchair = ds.some(
        (s: any) => s.attributes.wheelchair_boarding === 1,
      );
    }
  } catch (err) {
    console.warn('[optimizeRoute] failed to fetch stop metadata', err);
  }

  // For each filtered route, if it is a direct line, create a RouteOption for each upcoming train
  let routeOptions: RouteOption[] = [];
  for (const { route, predictions, alerts, vehicles } of filteredRouteData) {
    // Only do this for direct lines (origin/destination on same line)
    const routeName =
      route.attributes.long_name || route.attributes.short_name || route.id;
    const isDirect = selectedLineNames.some((ln) =>
      routeName.toLowerCase().includes(ln),
    );
    if (isDirect && predictions.length > 0) {
      // For each upcoming arrival, create a RouteOption
      const now = Date.now();
      const arrivals = predictions
        .map((p) => p.attributes.arrival_time)
        .filter((t): t is string => t !== null)
        .map((t) => new Date(t).getTime())
        .filter((ms) => ms > now)
        .sort((a, b) => a - b);
      for (const arrMs of arrivals) {
        // Score as if this is the next train
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
      // Fallback: one RouteOption per route as before
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

  // Sort by next arrival, then by routeName
  routeOptions.sort((a, b) => {
    const am = a.nextArrivalMinutes ?? Number.POSITIVE_INFINITY;
    const bm = b.nextArrivalMinutes ?? Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    return a.routeName.localeCompare(b.routeName);
  });

  // Limit to top 10 for UI
  const resultRoutes = routeOptions.slice(0, 10);

  const partialData =
    !usedFallback &&
    Array.isArray(allRouteData) &&
    allRouteData.length < MIN_ROUTES_EXPECTED;

  return {
    routes: resultRoutes,
    lastUpdated: new Date().toISOString(),
    usedFallback: usedFallback || undefined,
    partialData: partialData || undefined,
  };
}

function getLinesForStation(stationName: string): string[] {
  const lower = (stationName ?? '').toString().toLowerCase();
  return ALL_LINES.filter((l) =>
    l.stations.some((s) => s.toLowerCase() === lower),
  ).map((l) => l.id);
}
