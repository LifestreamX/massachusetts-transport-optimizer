/**
 * Scoring functions for the decision engine.
 *
 * Pure functions – no side effects, easy to unit test.
 */

import type {
  MbtaPredictionResource,
  MbtaAlertResource,
  MbtaVehicleResource,
} from '@/lib/mbta/mbtaTypes';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Default base travel-time estimate in minutes when no predictions exist. */
const DEFAULT_BASE_TRAVEL_TIME_MIN = 15;

/** Weight applied to each severity point of an active alert. */
const ALERT_SEVERITY_MULTIPLIER = 5;

/** Weight applied to each delay minute for reliability calculation. */
const DELAY_RELIABILITY_MULTIPLIER = 2;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Estimate base travel time from prediction data.
 *
 * Strategy: take the soonest predicted arrival and compute how many
 * minutes from *now* that prediction is. If no arrival predictions
 * exist, fall back to a reasonable default.
 */
export function estimateBaseTravelTime(
  predictions: MbtaPredictionResource[],
): number {
  const now = Date.now();

  const upcomingArrivals = predictions
    .map((p) => p.attributes.arrival_time)
    .filter((t): t is string => t !== null)
    .map((t) => new Date(t).getTime())
    .filter((ms) => ms > now)
    .sort((a, b) => a - b);

  if (upcomingArrivals.length === 0) return DEFAULT_BASE_TRAVEL_TIME_MIN;

  const diffMinutes = Math.round((upcomingArrivals[0] - now) / 60_000);
  return Math.max(1, diffMinutes);
}

/**
 * Compute delay minutes by looking at vehicle statuses and prediction gaps.
 *
 * Heuristic: if there are active vehicles that are STOPPED_AT for an
 * extended period or if predicted arrival times are significantly spread,
 * we infer delays.
 */
export function computeDelayMinutes(
  predictions: MbtaPredictionResource[],
  vehicles: MbtaVehicleResource[],
): number {
  let delayScore = 0;

  // Factor 1: vehicles that are stopped (likely holding)
  const stoppedVehicles = vehicles.filter(
    (v) => v.attributes.current_status === 'STOPPED_AT',
  );
  if (vehicles.length > 0) {
    const stoppedRatio = stoppedVehicles.length / vehicles.length;
    if (stoppedRatio > 0.5) delayScore += 3;
    else if (stoppedRatio > 0.25) delayScore += 1;
  }

  // Factor 2: a wide spread between consecutive predicted arrivals
  const arrivalTimes = predictions
    .map((p) => p.attributes.arrival_time)
    .filter((t): t is string => t !== null)
    .map((t) => new Date(t).getTime())
    .sort((a, b) => a - b);

  if (arrivalTimes.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < arrivalTimes.length; i++) {
      gaps.push((arrivalTimes[i] - arrivalTimes[i - 1]) / 60_000);
    }
    const maxGap = Math.max(...gaps);
    if (maxGap > 15) delayScore += 4;
    else if (maxGap > 10) delayScore += 2;
    else if (maxGap > 6) delayScore += 1;
  }

  // No empty prediction data shouldn't heavily penalise
  if (predictions.length === 0 && vehicles.length === 0) {
    delayScore += 2; // unknown → mild penalty
  }

  return delayScore;
}

/**
 * Compute the cumulative alert severity weight for a route.
 *
 * Each active alert contributes its severity value (0-10 per MBTA docs).
 */
export function computeAlertSeverityWeight(
  alerts: MbtaAlertResource[],
): number {
  if (alerts.length === 0) return 0;
  return alerts.reduce((sum, a) => sum + a.attributes.severity, 0);
}

/**
 * Return a flat list of human-readable alert headers.
 */
export function summariseAlerts(alerts: MbtaAlertResource[]): string[] {
  return alerts.map((a) => a.attributes.header);
}

/* ------------------------------------------------------------------ */
/*  Core scoring                                                       */
/* ------------------------------------------------------------------ */

export interface RouteScore {
  routeName: string;
  baseTravelTime: number;
  delayMinutes: number;
  totalEstimatedTime: number;
  activeAlertsCount: number;
  alertSeverityWeight: number;
  reliabilityScore: number;
  alertSummary: string[];
  nextArrivalMs?: number;
}

export function scoreRoute(
  routeName: string,
  predictions: MbtaPredictionResource[],
  alerts: MbtaAlertResource[],
  vehicles: MbtaVehicleResource[],
): RouteScore {
  const baseTravelTime = estimateBaseTravelTime(predictions);
  // Compute next arrival ms (if any) for downstream sorting/display
  const now = Date.now();
  const upcomingArrivalsMs = predictions
    .map((p) => p.attributes.arrival_time)
    .filter((t): t is string => t !== null)
    .map((t) => new Date(t).getTime())
    .filter((ms) => ms > now)
    .sort((a, b) => a - b);
  const nextArrivalMs =
    upcomingArrivalsMs.length > 0 ? upcomingArrivalsMs[0] : undefined;
  const delayMinutes = computeDelayMinutes(predictions, vehicles);
  const alertSeverityWeight = computeAlertSeverityWeight(alerts);
  const alertSummary = summariseAlerts(alerts);

  const totalEstimatedTime = baseTravelTime + delayMinutes;
  const reliabilityScore = Math.max(
    0,
    100 -
      delayMinutes * DELAY_RELIABILITY_MULTIPLIER -
      alertSeverityWeight * ALERT_SEVERITY_MULTIPLIER,
  );

  return {
    routeName,
    baseTravelTime,
    delayMinutes,
    totalEstimatedTime,
    activeAlertsCount: alerts.length,
    alertSeverityWeight,
    reliabilityScore,
    alertSummary,
    nextArrivalMs,
  };
}
