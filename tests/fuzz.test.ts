/**
 * Property-based / fuzz-style tests for the decision engine.
 *
 * These tests generate many random inputs and verify invariants hold
 * for every combination, providing very high confidence in correctness.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateBaseTravelTime,
  computeDelayMinutes,
  computeAlertSeverityWeight,
  scoreRoute,
  type RouteScore,
} from '@/lib/decisionEngine/scoring';
import type {
  MbtaPredictionResource,
  MbtaAlertResource,
  MbtaVehicleResource,
} from '@/lib/mbta/mbtaTypes';

/* ------------------------------------------------------------------ */
/*  Factories                                                          */
/* ------------------------------------------------------------------ */

let ctr = 0;
function uid(): string {
  return `fuzz-${++ctr}`;
}

function makePred(arrivalMinutes: number | null): MbtaPredictionResource {
  return {
    id: uid(),
    type: 'prediction',
    attributes: {
      arrival_time:
        arrivalMinutes !== null
          ? new Date(Date.now() + arrivalMinutes * 60_000).toISOString()
          : null,
      departure_time: null,
      direction_id: 0,
      status: null,
      schedule_relationship: null,
    },
    relationships: {
      route: { data: { id: 'R', type: 'route' } },
      stop: { data: { id: 'S', type: 'stop' } },
    },
  };
}

function makeAl(severity: number): MbtaAlertResource {
  return {
    id: uid(),
    type: 'alert',
    attributes: {
      header: `Alert sev=${severity}`,
      description: null,
      severity,
      effect: 'DELAY',
      lifecycle: 'NEW',
      active_period: [{ start: new Date().toISOString(), end: null }],
      informed_entity: [{ route: 'R' }],
    },
  };
}

function makeVeh(stopped: boolean): MbtaVehicleResource {
  return {
    id: uid(),
    type: 'vehicle',
    attributes: {
      current_status: stopped ? 'STOPPED_AT' : 'IN_TRANSIT_TO',
      speed: stopped ? 0 : 20,
      latitude: 42.35,
      longitude: -71.06,
      direction_id: 0,
      updated_at: new Date().toISOString(),
    },
    relationships: {
      route: { data: { id: 'R', type: 'route' } },
      stop: { data: { id: 'S', type: 'stop' } },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Pseudo-random number generator (deterministic)                     */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================================================================== */
/*  Fuzz: scoreRoute invariants                                        */
/* ================================================================== */

describe('scoreRoute – fuzz invariants (100 random inputs)', () => {
  const rng = mulberry32(42);

  const cases = Array.from({ length: 100 }, (_, i) => {
    const predCount = Math.floor(rng() * 10);
    const alertCount = Math.floor(rng() * 8);
    const stoppedCount = Math.floor(rng() * 6);
    const movingCount = Math.floor(rng() * 6);
    return { i, predCount, alertCount, stoppedCount, movingCount };
  });

  it.each(cases)(
    'seed=42 case $i (preds=$predCount alerts=$alertCount stopped=$stoppedCount moving=$movingCount)',
    ({ predCount, alertCount, stoppedCount, movingCount }) => {
      const rng2 = mulberry32(
        predCount * 1000 + alertCount * 100 + stoppedCount * 10 + movingCount,
      );

      const preds = Array.from({ length: predCount }, () => {
        const min = rng2() > 0.3 ? Math.floor(rng2() * 60) + 1 : null;
        return makePred(min);
      });
      const alerts = Array.from({ length: alertCount }, () =>
        makeAl(Math.floor(rng2() * 11)),
      );
      const vehicles = [
        ...Array.from({ length: stoppedCount }, () => makeVeh(true)),
        ...Array.from({ length: movingCount }, () => makeVeh(false)),
      ];

      const score = scoreRoute(
        `Route-${predCount}-${alertCount}`,
        preds,
        alerts,
        vehicles,
      );

      // Invariant 1: totalEstimatedTime = base + delay
      expect(score.totalEstimatedTime).toBe(
        score.baseTravelTime + score.delayMinutes,
      );

      // Invariant 2: reliability ∈ [0, 100]
      expect(score.reliabilityScore).toBeGreaterThanOrEqual(0);
      expect(score.reliabilityScore).toBeLessThanOrEqual(100);

      // Invariant 3: baseTravelTime ≥ 1
      expect(score.baseTravelTime).toBeGreaterThanOrEqual(1);

      // Invariant 4: delayMinutes ≥ 0
      expect(score.delayMinutes).toBeGreaterThanOrEqual(0);

      // Invariant 5: alertSummary length matches alert count
      expect(score.alertSummary).toHaveLength(alertCount);

      // Invariant 6: activeAlertsCount matches
      expect(score.activeAlertsCount).toBe(alertCount);

      // Invariant 7: alertSeverityWeight = sum of severities
      const expectedWeight = alerts.reduce(
        (s, a) => s + a.attributes.severity,
        0,
      );
      expect(score.alertSeverityWeight).toBe(expectedWeight);

      // Invariant 8: reliability formula check
      const expectedReliability = Math.max(
        0,
        100 - score.delayMinutes * 2 - score.alertSeverityWeight * 5,
      );
      expect(score.reliabilityScore).toBe(expectedReliability);
    },
  );
});

/* ================================================================== */
/*  Fuzz: estimateBaseTravelTime always ≥ 1                            */
/* ================================================================== */

describe('estimateBaseTravelTime – fuzz (50 random)', () => {
  const rng = mulberry32(99);

  const cases = Array.from({ length: 50 }, (_, i) => {
    const count = Math.floor(rng() * 15);
    return { i, count };
  });

  it.each(cases)('case $i with $count predictions', ({ count }) => {
    const rng2 = mulberry32(count * 7 + 13);
    const preds = Array.from({ length: count }, () => {
      const val = rng2() > 0.2 ? Math.floor(rng2() * 120) - 30 : null;
      return makePred(val);
    });
    const result = estimateBaseTravelTime(preds);
    expect(result).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================== */
/*  Fuzz: computeDelayMinutes always ≥ 0                               */
/* ================================================================== */

describe('computeDelayMinutes – fuzz (50 random)', () => {
  const rng = mulberry32(77);

  const cases = Array.from({ length: 50 }, (_, i) => {
    const predCount = Math.floor(rng() * 10);
    const vehicleCount = Math.floor(rng() * 10);
    return { i, predCount, vehicleCount };
  });

  it.each(cases)(
    'case $i (preds=$predCount vehicles=$vehicleCount)',
    ({ predCount, vehicleCount }) => {
      const rng2 = mulberry32(predCount * 100 + vehicleCount);
      const preds = Array.from({ length: predCount }, () => {
        const min = rng2() > 0.3 ? Math.floor(rng2() * 60) + 1 : null;
        return makePred(min);
      });
      const vehicles = Array.from({ length: vehicleCount }, () =>
        makeVeh(rng2() > 0.5),
      );
      const result = computeDelayMinutes(preds, vehicles);
      expect(result).toBeGreaterThanOrEqual(0);
    },
  );
});

/* ================================================================== */
/*  Fuzz: computeAlertSeverityWeight always ≥ 0                        */
/* ================================================================== */

describe('computeAlertSeverityWeight – fuzz (30 random)', () => {
  const rng = mulberry32(55);

  const cases = Array.from({ length: 30 }, (_, i) => {
    const count = Math.floor(rng() * 20);
    return { i, count };
  });

  it.each(cases)('case $i with $count alerts', ({ count }) => {
    const rng2 = mulberry32(count * 3 + 7);
    const alerts = Array.from({ length: count }, () =>
      makeAl(Math.floor(rng2() * 11)),
    );
    const result = computeAlertSeverityWeight(alerts);
    expect(result).toBeGreaterThanOrEqual(0);
    // Should equal sum
    const expected = alerts.reduce((s, a) => s + a.attributes.severity, 0);
    expect(result).toBe(expected);
  });
});

/* ================================================================== */
/*  Sorting: transitive property (fuzz)                                */
/* ================================================================== */

describe('Sorting transitivity – fuzz (30 random sets)', () => {
  const rng = mulberry32(123);

  function compareRoutes(a: RouteScore, b: RouteScore): number {
    if (a.totalEstimatedTime !== b.totalEstimatedTime)
      return a.totalEstimatedTime - b.totalEstimatedTime;
    if (a.reliabilityScore !== b.reliabilityScore)
      return b.reliabilityScore - a.reliabilityScore;
    return a.routeName.localeCompare(b.routeName);
  }

  function makeRS(seed: number): RouteScore {
    const r = mulberry32(seed);
    return {
      routeName: `Route-${Math.floor(r() * 1000)}`,
      baseTravelTime: Math.floor(r() * 30) + 1,
      delayMinutes: Math.floor(r() * 20),
      totalEstimatedTime: Math.floor(r() * 50) + 1,
      activeAlertsCount: Math.floor(r() * 10),
      alertSeverityWeight: Math.floor(r() * 30),
      reliabilityScore: Math.floor(r() * 101),
      alertSummary: [],
    };
  }

  const cases = Array.from({ length: 30 }, (_, i) => i);

  it.each(cases)('set %i – sort is consistent forward and reverse', (seed) => {
    const items = Array.from({ length: 8 }, (_, j) => makeRS(seed * 100 + j));
    const forward = [...items].sort(compareRoutes);
    const reversed = [...items].reverse().sort(compareRoutes);
    expect(forward.map((s) => s.routeName)).toEqual(
      reversed.map((s) => s.routeName),
    );
  });
});
