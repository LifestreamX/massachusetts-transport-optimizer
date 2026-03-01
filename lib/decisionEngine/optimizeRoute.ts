/**
 * Decision engine – orchestrates data retrieval, scoring, and ranking.
 *
 * This is the single entry point for the API route.
 * It delegates to `scoring.ts` for pure computations and to `mbtaClient`
 * for external data.
 */

import { mbtaClient } from '@/lib/mbta/mbtaClient';
import { scoreRoute, type RouteScore } from './scoring';
import type { OptimizeRouteResponse, RouteOption } from '@/types/routeTypes';

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
): Promise<OptimizeRouteResponse> {
  // Origin and destination will be used for future trip planning integration
  void origin;
  void destination;

  const allRouteData = await mbtaClient.fetchAllRouteData();

  // In production, you'd use the MBTA's trip planning API to filter
  // routes between origin and destination. For now, return all routes.
  const filteredRouteData = allRouteData;

  const scores: RouteScore[] = filteredRouteData.map(
    ({ route, predictions, alerts, vehicles }) =>
      scoreRoute(
        route.attributes.long_name || route.attributes.short_name || route.id,
        predictions,
        alerts,
        vehicles,
      ),
  );

  scores.sort(compareRoutes);

  return {
    routes: scores.map(toRouteOption),
    lastUpdated: new Date().toISOString(),
  };
}
