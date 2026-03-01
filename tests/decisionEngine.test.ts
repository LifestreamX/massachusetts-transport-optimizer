/**
 * Unit tests for the decision engine.
 *
 * Covers:
 *  - Base travel time estimation
 *  - Delay computation
 *  - Alert severity weighting
 *  - Alert summarisation
 *  - Full route scoring
 *  - Deterministic sorting
 *  - Edge cases (empty data, ties, etc.)
 *
 * Uses Vitest with mock MBTA response data.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateBaseTravelTime,
  computeDelayMinutes,
  computeAlertSeverityWeight,
  summariseAlerts,
  scoreRoute,
  type RouteScore,
} from '@/lib/decisionEngine/scoring';
import type {
  MbtaPredictionResource,
  MbtaAlertResource,
  MbtaVehicleResource,
} from '@/lib/mbta/mbtaTypes';

/* ------------------------------------------------------------------ */
/*  Factory helpers – produce minimal valid MBTA resources             */
/* ------------------------------------------------------------------ */

function makePrediction(
  overrides: Partial<MbtaPredictionResource['attributes']> = {},
  routeId = 'Red',
): MbtaPredictionResource {
  return {
    id: `pred-${Math.random().toString(36).slice(2, 8)}`,
    type: 'prediction',
    attributes: {
      arrival_time: null,
      departure_time: null,
      direction_id: 0,
      status: null,
      schedule_relationship: null,
      ...overrides,
    },
    relationships: {
      route: { data: { id: routeId, type: 'route' } },
      stop: { data: { id: 'place-pktrm', type: 'stop' } },
    },
  };
}

function makeAlert(
  overrides: Partial<MbtaAlertResource['attributes']> = {},
): MbtaAlertResource {
  return {
    id: `alert-${Math.random().toString(36).slice(2, 8)}`,
    type: 'alert',
    attributes: {
      header: 'Test alert',
      description: null,
      severity: 3,
      effect: 'DELAY',
      lifecycle: 'NEW',
      active_period: [{ start: new Date().toISOString(), end: null }],
      informed_entity: [{ route: 'Red' }],
      ...overrides,
    },
  };
}

function makeVehicle(
  overrides: Partial<MbtaVehicleResource['attributes']> = {},
  routeId = 'Red',
): MbtaVehicleResource {
  return {
    id: `vehicle-${Math.random().toString(36).slice(2, 8)}`,
    type: 'vehicle',
    attributes: {
      current_status: 'IN_TRANSIT_TO',
      speed: 15,
      latitude: 42.35,
      longitude: -71.06,
      direction_id: 0,
      updated_at: new Date().toISOString(),
      ...overrides,
    },
    relationships: {
      route: { data: { id: routeId, type: 'route' } },
      stop: { data: { id: 'place-pktrm', type: 'stop' } },
    },
  };
}

/** Returns an ISO string `minutesFromNow` minutes in the future. */
function futureIso(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

/* ================================================================== */
/*  TESTS                                                              */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  estimateBaseTravelTime                                             */
/* ------------------------------------------------------------------ */

describe('estimateBaseTravelTime', () => {
  it('returns default 15 when there are no predictions', () => {
    expect(estimateBaseTravelTime([])).toBe(15);
  });

  it('returns default 15 when predictions have no arrival_time', () => {
    const preds = [makePrediction(), makePrediction()];
    expect(estimateBaseTravelTime(preds)).toBe(15);
  });

  it('picks the soonest future arrival', () => {
    const preds = [
      makePrediction({ arrival_time: futureIso(10) }),
      makePrediction({ arrival_time: futureIso(5) }),
      makePrediction({ arrival_time: futureIso(20) }),
    ];
    expect(estimateBaseTravelTime(preds)).toBe(5);
  });

  it('ignores past arrival times', () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    const preds = [
      makePrediction({ arrival_time: past }),
      makePrediction({ arrival_time: futureIso(8) }),
    ];
    expect(estimateBaseTravelTime(preds)).toBe(8);
  });

  it('returns at least 1 minute even for imminent arrivals', () => {
    const preds = [makePrediction({ arrival_time: futureIso(0.3) })];
    expect(estimateBaseTravelTime(preds)).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  computeDelayMinutes                                                */
/* ------------------------------------------------------------------ */

describe('computeDelayMinutes', () => {
  it('returns 2 (unknown penalty) when no data exists', () => {
    expect(computeDelayMinutes([], [])).toBe(2);
  });

  it('returns 0 when vehicles are moving and gaps are small', () => {
    const vehicles = [
      makeVehicle({ current_status: 'IN_TRANSIT_TO' }),
      makeVehicle({ current_status: 'IN_TRANSIT_TO' }),
    ];
    const preds = [
      makePrediction({ arrival_time: futureIso(3) }),
      makePrediction({ arrival_time: futureIso(6) }),
    ];
    expect(computeDelayMinutes(preds, vehicles)).toBe(0);
  });

  it('penalises when >50% vehicles are stopped', () => {
    const vehicles = [
      makeVehicle({ current_status: 'STOPPED_AT' }),
      makeVehicle({ current_status: 'STOPPED_AT' }),
      makeVehicle({ current_status: 'IN_TRANSIT_TO' }),
    ];
    const delay = computeDelayMinutes([], vehicles);
    expect(delay).toBeGreaterThanOrEqual(3);
  });

  it('penalises large gaps between predicted arrivals', () => {
    const preds = [
      makePrediction({ arrival_time: futureIso(2) }),
      makePrediction({ arrival_time: futureIso(20) }),
    ];
    const delay = computeDelayMinutes(preds, []);
    // 18-minute gap > 15 → +4
    expect(delay).toBeGreaterThanOrEqual(4);
  });

  it('applies moderate penalty for 10-15 min gap', () => {
    const preds = [
      makePrediction({ arrival_time: futureIso(2) }),
      makePrediction({ arrival_time: futureIso(14) }),
    ];
    const delay = computeDelayMinutes(preds, []);
    expect(delay).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/*  computeAlertSeverityWeight                                         */
/* ------------------------------------------------------------------ */

describe('computeAlertSeverityWeight', () => {
  it('returns 0 when no alerts', () => {
    expect(computeAlertSeverityWeight([])).toBe(0);
  });

  it('sums severity for multiple alerts', () => {
    const alerts = [
      makeAlert({ severity: 3 }),
      makeAlert({ severity: 7 }),
      makeAlert({ severity: 1 }),
    ];
    expect(computeAlertSeverityWeight(alerts)).toBe(11);
  });

  it('handles a single high-severity alert', () => {
    const alerts = [makeAlert({ severity: 10 })];
    expect(computeAlertSeverityWeight(alerts)).toBe(10);
  });

  it('handles zero-severity alerts', () => {
    const alerts = [makeAlert({ severity: 0 }), makeAlert({ severity: 0 })];
    expect(computeAlertSeverityWeight(alerts)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  summariseAlerts                                                    */
/* ------------------------------------------------------------------ */

describe('summariseAlerts', () => {
  it('returns empty array when no alerts', () => {
    expect(summariseAlerts([])).toEqual([]);
  });

  it('returns headers of all alerts', () => {
    const alerts = [
      makeAlert({ header: 'Shuttle bus replacing service' }),
      makeAlert({ header: 'Delays of 10 minutes' }),
    ];
    expect(summariseAlerts(alerts)).toEqual([
      'Shuttle bus replacing service',
      'Delays of 10 minutes',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  scoreRoute                                                         */
/* ------------------------------------------------------------------ */

describe('scoreRoute', () => {
  it('computes totalEstimatedTime = baseTravelTime + delayMinutes', () => {
    // No delay scenario: vehicles in transit, tight prediction gaps
    const preds = [
      makePrediction({ arrival_time: futureIso(7) }),
      makePrediction({ arrival_time: futureIso(10) }),
    ];
    const vehicles = [makeVehicle({ current_status: 'IN_TRANSIT_TO' })];
    const score = scoreRoute('Red Line', preds, [], vehicles);
    expect(score.totalEstimatedTime).toBe(
      score.baseTravelTime + score.delayMinutes,
    );
  });

  it('clamps reliabilityScore at 0 (never negative)', () => {
    // Huge delays + many severe alerts → should clamp
    const preds = [
      makePrediction({ arrival_time: futureIso(2) }),
      makePrediction({ arrival_time: futureIso(30) }),
    ];
    const alerts = [
      makeAlert({ severity: 10 }),
      makeAlert({ severity: 10 }),
      makeAlert({ severity: 10 }),
    ];
    const vehicles = [
      makeVehicle({ current_status: 'STOPPED_AT' }),
      makeVehicle({ current_status: 'STOPPED_AT' }),
    ];
    const score = scoreRoute('Disaster Line', preds, alerts, vehicles);
    expect(score.reliabilityScore).toBe(0);
  });

  it('produces reliabilityScore = 100 when no delays and no alerts', () => {
    const preds = [
      makePrediction({ arrival_time: futureIso(5) }),
      makePrediction({ arrival_time: futureIso(8) }),
    ];
    const vehicles = [
      makeVehicle({ current_status: 'IN_TRANSIT_TO' }),
      makeVehicle({ current_status: 'IN_TRANSIT_TO' }),
    ];
    const score = scoreRoute('Perfect Line', preds, [], vehicles);
    expect(score.reliabilityScore).toBe(100);
    expect(score.delayMinutes).toBe(0);
    expect(score.alertSeverityWeight).toBe(0);
  });

  it('includes alert summaries', () => {
    const alerts = [
      makeAlert({ header: 'Minor delay' }),
      makeAlert({ header: 'Station closure' }),
    ];
    const score = scoreRoute('Test Line', [], alerts, []);
    expect(score.alertSummary).toEqual(['Minor delay', 'Station closure']);
  });

  it('formula: reliability = 100 - delay*2 - alertWeight*5', () => {
    // Manually controlled scenario
    // 2 stopped out of 3 vs. 1 → >50% stopped → +3 delay
    // Gap: none (single prediction) → no gap penalty
    // But also empty vehicles + empty predictions → will get unknown penalty
    // Let's use direct checks
    const preds = [
      makePrediction({ arrival_time: futureIso(5) }),
      makePrediction({ arrival_time: futureIso(8) }),
    ];
    const vehicles = [makeVehicle({ current_status: 'IN_TRANSIT_TO' })];
    const alerts = [makeAlert({ severity: 4 })];
    const score = scoreRoute('Test', preds, alerts, vehicles);
    // delayMinutes should be 0 (no stopped vehicles, gap < 6)
    // alertSeverityWeight = 4
    expect(score.delayMinutes).toBe(0);
    expect(score.alertSeverityWeight).toBe(4);
    expect(score.reliabilityScore).toBe(100 - 0 * 2 - 4 * 5); // 80
  });
});

/* ------------------------------------------------------------------ */
/*  Deterministic sorting                                              */
/* ------------------------------------------------------------------ */

describe('Deterministic sorting', () => {
  /**
   * We test the compare logic by creating RouteScore objects
   * and sorting them with the same comparator used in optimizeRoute.
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

  function makeScore(overrides: Partial<RouteScore>): RouteScore {
    return {
      routeName: 'Line',
      baseTravelTime: 10,
      delayMinutes: 0,
      totalEstimatedTime: 10,
      activeAlertsCount: 0,
      alertSeverityWeight: 0,
      reliabilityScore: 100,
      alertSummary: [],
      ...overrides,
    };
  }

  it('sorts by totalEstimatedTime ascending (primary)', () => {
    const scores = [
      makeScore({ routeName: 'Slow', totalEstimatedTime: 20 }),
      makeScore({ routeName: 'Fast', totalEstimatedTime: 5 }),
      makeScore({ routeName: 'Mid', totalEstimatedTime: 12 }),
    ];
    scores.sort(compareRoutes);
    expect(scores.map((s) => s.routeName)).toEqual(['Fast', 'Mid', 'Slow']);
  });

  it('breaks time ties with reliabilityScore descending', () => {
    const scores = [
      makeScore({
        routeName: 'Low',
        totalEstimatedTime: 10,
        reliabilityScore: 60,
      }),
      makeScore({
        routeName: 'High',
        totalEstimatedTime: 10,
        reliabilityScore: 95,
      }),
    ];
    scores.sort(compareRoutes);
    expect(scores.map((s) => s.routeName)).toEqual(['High', 'Low']);
  });

  it('breaks full ties with routeName alphabetically', () => {
    const scores = [
      makeScore({
        routeName: 'Orange Line',
        totalEstimatedTime: 10,
        reliabilityScore: 80,
      }),
      makeScore({
        routeName: 'Blue Line',
        totalEstimatedTime: 10,
        reliabilityScore: 80,
      }),
      makeScore({
        routeName: 'Green Line',
        totalEstimatedTime: 10,
        reliabilityScore: 80,
      }),
    ];
    scores.sort(compareRoutes);
    expect(scores.map((s) => s.routeName)).toEqual([
      'Blue Line',
      'Green Line',
      'Orange Line',
    ]);
  });

  it('combined: time > reliability > name', () => {
    const scores = [
      makeScore({
        routeName: 'D',
        totalEstimatedTime: 15,
        reliabilityScore: 90,
      }),
      makeScore({
        routeName: 'A',
        totalEstimatedTime: 10,
        reliabilityScore: 80,
      }),
      makeScore({
        routeName: 'B',
        totalEstimatedTime: 10,
        reliabilityScore: 80,
      }),
      makeScore({
        routeName: 'C',
        totalEstimatedTime: 10,
        reliabilityScore: 90,
      }),
    ];
    scores.sort(compareRoutes);
    expect(scores.map((s) => s.routeName)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('produces identical results across multiple invocations (determinism)', () => {
    const scores = [
      makeScore({
        routeName: 'Z',
        totalEstimatedTime: 10,
        reliabilityScore: 50,
      }),
      makeScore({
        routeName: 'A',
        totalEstimatedTime: 10,
        reliabilityScore: 50,
      }),
      makeScore({
        routeName: 'M',
        totalEstimatedTime: 10,
        reliabilityScore: 50,
      }),
      makeScore({
        routeName: 'A',
        totalEstimatedTime: 5,
        reliabilityScore: 50,
      }),
    ];

    const run1 = [...scores].sort(compareRoutes).map((s) => s.routeName);
    const run2 = [...scores].sort(compareRoutes).map((s) => s.routeName);
    const run3 = [...scores].sort(compareRoutes).map((s) => s.routeName);
    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe('Edge cases', () => {
  it('handles empty predictions, alerts, and vehicles gracefully', () => {
    const score = scoreRoute('Empty Line', [], [], []);
    expect(score.baseTravelTime).toBe(15); // default
    expect(score.delayMinutes).toBe(2); // unknown penalty
    expect(score.totalEstimatedTime).toBe(17);
    expect(score.reliabilityScore).toBe(96); // 100 - 2*2 - 0*5
    expect(score.alertSummary).toEqual([]);
  });

  it('handles a single prediction correctly', () => {
    const preds = [makePrediction({ arrival_time: futureIso(12) })];
    const score = scoreRoute('Single Pred', preds, [], []);
    expect(score.baseTravelTime).toBe(12);
  });

  it('handles very large number of alerts', () => {
    const alerts = Array.from({ length: 50 }, (_, i) =>
      makeAlert({ severity: 2, header: `Alert ${i}` }),
    );
    const score = scoreRoute('Overloaded', [], alerts, []);
    expect(score.alertSeverityWeight).toBe(100);
    expect(score.reliabilityScore).toBe(0); // 100 - 2*2 - 100*5 → clamped to 0
    expect(score.alertSummary).toHaveLength(50);
  });
});
