/**
 * Shared route-level types used across API, decision engine, and frontend.
 */

/** A single scored route option returned to the client. */
export interface RouteOption {
  routeName: string;
  totalEstimatedTime: number;
  delayMinutes: number;
  reliabilityScore: number;
  alertSummary: string[];
  transfersEstimate?: number;
  accessible?: boolean;
  nextArrivalISO?: string;
  nextArrivalMinutes?: number;
}

/** Successful API response shape. */
export interface OptimizeRouteResponse {
  routes: RouteOption[];
  lastUpdated: string; // ISO-8601
  usedFallback?: boolean;
  partialData?: boolean;
}

/** API error response shape. */
export interface ApiErrorResponse {
  error: string;
  statusCode: number;
}

/** Query parameters accepted by POST /api/optimize-route */
export interface OptimizeRouteRequest {
  origin: string;
  destination: string;
}

export type RoutePreference =
  | 'fastest'
  | 'least-transfers'
  | 'most-reliable'
  | 'accessible';

export interface OptimizeRouteRequestWithPref extends OptimizeRouteRequest {
  preference?: RoutePreference;
}
