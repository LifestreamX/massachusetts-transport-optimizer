import { describe, it, expect, vi } from 'vitest';

// Create a mock MBTA client that returns varying synthetic datasets per call
let callCounter = 0;
vi.mock('@/lib/mbta/mbtaClient', () => ({
  mbtaClient: {
    fetchAllRouteData: async () => {
      callCounter += 1;
      const n = (callCounter % 5) + 1; // 1..5 routes
      const routes = [] as any[];
      for (let i = 0; i < n; i++) {
        routes.push({
          route: {
            id: `mock-${callCounter}-${i}`,
            attributes: {
              long_name: `Mock Route ${callCounter}-${i}`,
              short_name: `M${i}`,
            },
          },
          predictions: [],
          alerts: [],
          vehicles: [],
        });
      }
      return routes;
    },
    fetchStops: async (_query?: string) => [],
  },
}));

import { optimizeRoute } from '@/lib/decisionEngine/optimizeRoute';

describe('Stress integration: optimizeRoute', () => {
  it(
    'handles 1000 sequential mocked requests without crashing',
    { timeout: 120_000 },
    async () => {
      const ITER = 1000;
      for (let i = 0; i < ITER; i++) {
        const res = await optimizeRoute(undefined, undefined, 'fastest');
        expect(res).toBeDefined();
        expect(Array.isArray(res.routes)).toBe(true);
        // basic invariants
        for (const r of res.routes) {
          expect(typeof r.routeName).toBe('string');
          expect(typeof r.totalEstimatedTime).toBe('number');
          expect(typeof r.reliabilityScore).toBe('number');
        }
      }
    },
  );
});
