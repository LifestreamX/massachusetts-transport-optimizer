// UI view mode for the main page
export type ViewMode = 'route-planning';

// Transit mode filter for stations/lines
export type TransitMode = 'all' | 'subway' | 'commuter';
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
  routeId: string; // MBTA route id
  stopId: string; // MBTA stop id (origin for this leg)
  directionId?: number; // MBTA direction id (if available)
  hasPrediction?: boolean; // Indicates if live prediction is available
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
