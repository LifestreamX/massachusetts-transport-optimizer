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
import { ALL_LINES } from '../data/stationsByLine';

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
 * TODO: Implement actual trip planning with origin/destination filtering
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
  // Origin and destination will be used for future trip planning integration
  void origin;
  void destination;
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

  // If origin/destination provided, attempt a simple filter using our
  // station->line metadata. Skip filtering when we are using the
  // synthetic fallback dataset so the fallback options remain visible.
  let filteredRouteData: any[] = allRouteData as any[];
  try {
    if (!usedFallback) {
      const od = [origin, destination].filter(Boolean) as string[];
      if (od.length > 0) {
        const selectedLineNames = ALL_LINES.filter((line) =>
          od.some((s) => line.stations.includes(s)),
        ).map((l) => l.name.toLowerCase());

        if (selectedLineNames.length > 0) {
          const source = allRouteData as any[];
          filteredRouteData = source.filter(({ route }) => {
            const name = (
              (route.attributes &&
                (route.attributes.long_name || route.attributes.short_name)) ||
              route.id
            )
              .toString()
              .toLowerCase();
            // Match if route long_name contains any of the selected line names
            return selectedLineNames.some((ln) => name.includes(ln));
          });
        }
      }
    } else {
      // When using the synthetic fallback, keep all routes so the UI can
      // display the fallback options instead of filtering them out.
      filteredRouteData = allRouteData as any[];
    }
  } catch (err) {
    // If any error happens, fall back to returning all routes
    console.warn('[optimizeRoute] Error filtering by origin/destination', err);
    filteredRouteData = allRouteData;
  }

  // Score routes and keep route ids paired with their scores for heuristics
  type Paired = { routeId: string; score: RouteScore };
  console.info(
    `[optimizeRoute] allRouteData.length=${
      Array.isArray(allRouteData) ? allRouteData.length : 'nil'
    } filteredRouteData.length=${filteredRouteData.length} usedFallback=${usedFallback}`,
  );

  const paired: Paired[] = filteredRouteData.map(
    ({ route, predictions, alerts, vehicles }) => ({
      routeId: route.id,
      score: scoreRoute(
        route.attributes.long_name || route.attributes.short_name || route.id,
        predictions,
        alerts,
        vehicles,
      ),
    }),
  );

  console.info(`[optimizeRoute] paired.length=${paired.length}`);

  // Prepare some metadata for origin/destination -> line matching
  const od = [origin, destination].filter(Boolean) as string[];
  const selectedLineNames = od.length
    ? ALL_LINES.filter((line) => od.some((s) => line.stations.includes(s))).map(
        (l) => l.name.toLowerCase(),
      )
    : [];

  // Try to fetch stop metadata (wheelchair_boarding + canonical stop names)
  // to improve accessibility and transfer heuristics. Failures are non-fatal.
  let originStopIds: string[] = [];
  let destStopIds: string[] = [];
  let originStops: string[] = [];
  let destStops: string[] = [];
  let originWheelchair = false;
  let destWheelchair = false;
  try {
    // Fetch stop metadata when available. Tests mock `mbtaClient.fetchStops`,
    // so prefer calling it when present rather than skipping based on
    // environment variables. Failures are non-fatal.
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

  // Predeclare heuristic maps so mapping step can reuse them
  let transfersMap: Map<string, number> = new Map<string, number>();
  let accessibleMap: Map<string, boolean> = new Map<string, boolean>();

  // Apply preference-aware sorting.
  if (preference === 'most-reliable') {
    paired.sort((a, b) => {
      const A = a.score;
      const B = b.score;
      if (A.reliabilityScore !== B.reliabilityScore) {
        return B.reliabilityScore - A.reliabilityScore; // higher reliability first
      }
      return A.totalEstimatedTime - B.totalEstimatedTime; // tie-breaker by time
    });
  } else if (preference === 'least-transfers') {
    // Compute an empirical transfers estimate by checking whether the route
    // serves the origin/destination stops (via schedules). We keep this
    // lightweight: 0 if route serves both stops, 1 if it serves one side,
    // 2 otherwise. We precompute per-route estimates to avoid repeated
    // network calls during sort.
    transfersMap = new Map<string, number>();
    // limit concurrency of schedule fetches
    const concurrency = 6;
    let idx = 0;
    async function worker() {
      while (idx < paired.length) {
        const i = idx++;
        const rid = paired[i].routeId;
        try {
          if (
            originStopIds.length === 0 &&
            destStopIds.length === 0 &&
            selectedLineNames.length > 0
          ) {
            // Fallback to name-based heuristic if we couldn't resolve stops
            const name = paired[i].score.routeName.toLowerCase();
            if (selectedLineNames.some((ln) => name.includes(ln))) {
              transfersMap.set(rid, 0);
            } else if (
              ALL_LINES.some((l) => name.includes(l.name.toLowerCase()))
            ) {
              transfersMap.set(rid, 1);
            } else {
              transfersMap.set(rid, 2);
            }
            continue;
          }

          // Try to fetch schedules for the route and check stop ids
          const schedules = await (mbtaClient as any).fetchSchedules(rid);
          const servedStopIds = new Set(
            schedules
              .map((s: any) => s.relationships?.stop?.data?.id)
              .filter(Boolean),
          );
          const servesOrigin = originStopIds.some((id) =>
            servedStopIds.has(id),
          );
          const servesDest = destStopIds.some((id) => servedStopIds.has(id));
          if (servesOrigin && servesDest) transfersMap.set(rid, 0);
          else if (servesOrigin || servesDest) transfersMap.set(rid, 1);
          else transfersMap.set(rid, 2);
        } catch (err) {
          // On error, fall back to cheap name-based heuristic
          const name = paired[i].score.routeName.toLowerCase();
          if (selectedLineNames.some((ln) => name.includes(ln))) {
            transfersMap.set(rid, 0);
          } else if (
            ALL_LINES.some((l) => name.includes(l.name.toLowerCase()))
          ) {
            transfersMap.set(rid, 1);
          } else {
            transfersMap.set(rid, 2);
          }
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));

    paired.sort((a, b) => {
      const ta = transfersMap?.get(a.routeId) ?? 2;
      const tb = transfersMap?.get(b.routeId) ?? 2;
      if (ta !== tb) return ta - tb;
      return a.score.totalEstimatedTime - b.score.totalEstimatedTime;
    });
  } else if (preference === 'accessible') {
    // Heuristic: prefer subway lines (more frequent + likely accessible), then by reliability
    const isSubwayRoute = (routeName: string) => {
      const name = routeName.toLowerCase();
      return ALL_LINES.some(
        (l) => l.type === 'subway' && name.includes(l.name.toLowerCase()),
      );
    };

    // For accessibility, prefer routes that (a) serve both origin and dest
    // where both stops are wheelchair-accessible, or (b) are subway lines.
    // Precompute served-both flags using schedules where possible.
    accessibleMap = new Map<string, boolean>();
    const concurrency = 6;
    let idxA = 0;
    async function workerA() {
      while (idxA < paired.length) {
        const i = idxA++;
        const rid = paired[i].routeId;
        try {
          if (originStopIds.length > 0 && destStopIds.length > 0) {
            const schedules = await (mbtaClient as any).fetchSchedules(rid);
            const servedStopIds = new Set(
              schedules
                .map((s: any) => s.relationships?.stop?.data?.id)
                .filter(Boolean),
            );
            const servesOrigin = originStopIds.some((id) =>
              servedStopIds.has(id),
            );
            const servesDest = destStopIds.some((id) => servedStopIds.has(id));
            accessibleMap.set(
              rid,
              servesOrigin && servesDest && originWheelchair && destWheelchair,
            );
          } else {
            accessibleMap.set(rid, isSubwayRoute(paired[i].score.routeName));
          }
        } catch (err) {
          accessibleMap.set(rid, isSubwayRoute(paired[i].score.routeName));
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, workerA));
    paired.sort((a, b) => {
      const aa = accessibleMap?.get(a.routeId) ? 1 : 0;
      const ab = accessibleMap?.get(b.routeId) ? 1 : 0;
      if (aa !== ab) return ab - aa; // accessible-first
      if (a.score.reliabilityScore !== b.score.reliabilityScore)
        return b.score.reliabilityScore - a.score.reliabilityScore;
      return a.score.totalEstimatedTime - b.score.totalEstimatedTime;
    });
  } else {
    // default and other preferences fall back to fastest-first deterministic
    paired.sort((a, b) => compareRoutes(a.score, b.score));
  }

  // Map to RouteOption and attach heuristic metadata for client-side UI
  const mapped: RouteOption[] = paired.map((p) => {
    const s = p.score;
    const name = s.routeName.toLowerCase();

    let transfersEstimate: number | undefined = undefined;
    if (od.length > 0) {
      const servesOrigin = selectedLineNames.length
        ? selectedLineNames.some((ln) => name.includes(ln))
        : originStops.some((st) => name.includes(st.toLowerCase()));
      const servesDest = selectedLineNames.length
        ? selectedLineNames.some((ln) => name.includes(ln))
        : destStops.some((st) => name.includes(st.toLowerCase()));

      // Prefer precomputed transfersMap when available
      if (transfersMap && transfersMap.has(p.routeId)) {
        transfersEstimate = transfersMap.get(p.routeId);
      } else if (servesOrigin && servesDest) {
        transfersEstimate = 0;
      } else {
        const originLines = originStops.flatMap((st) => getLinesForStation(st));
        const destLines = destStops.flatMap((st) => getLinesForStation(st));
        const interchangeExists = ALL_LINES.some((l) =>
          l.stations.some(
            (station) =>
              originLines.some((ol) =>
                getLinesForStation(station).includes(ol),
              ) &&
              destLines.some((dl) => getLinesForStation(station).includes(dl)),
          ),
        );
        transfersEstimate = interchangeExists ? 1 : 2;
      }
    }

    // Prefer precomputed accessibleMap when available
    const accessible =
      accessibleMap?.get(p.routeId) ?? (originWheelchair && destWheelchair);

    return {
      ...toRouteOption(s),
      transfersEstimate,
      accessible,
    };
  });

  // Decide if data appears partial (fewer routes than expected)
  const partialData =
    !usedFallback &&
    Array.isArray(allRouteData) &&
    allRouteData.length < MIN_ROUTES_EXPECTED;

  // Show up to N candidate routes to the client. Strategy:
  // 1. Take the top K routes by current preference ranking (to keep relevance)
  // 2. Sort those K by next-arrival ascending so the client shows soonest options first
  // 3. Return the first N for display
  const TOP_K = 10;
  const RETURN_N = 10;

  const topK = mapped.slice(0, TOP_K);
  topK.sort((a, b) => {
    const am = a.nextArrivalMinutes ?? Number.POSITIVE_INFINITY;
    const bm = b.nextArrivalMinutes ?? Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    // fallback deterministic tie-breaker
    return a.routeName.localeCompare(b.routeName);
  });

  const resultRoutes = topK.slice(0, RETURN_N);

  return {
    routes: resultRoutes,
    lastUpdated: new Date().toISOString(),
    usedFallback: usedFallback || undefined,
    partialData: partialData || undefined,
  };
  // (Removed unreachable duplicate code after main return)
}

function getLinesForStation(stationName: string): string[] {
  const lower = (stationName ?? '').toString().toLowerCase();
  return ALL_LINES.filter((l) =>
    l.stations.some((s) => s.toLowerCase() === lower),
  ).map((l) => l.id);
}
