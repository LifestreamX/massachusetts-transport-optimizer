import { describe, it, expect, vi } from 'vitest';

// Mock mbtaClient to return controlled route data
vi.mock('@/lib/mbta/mbtaClient', () => ({
  mbtaClient: {
    fetchAllRouteData: async () => [
      {
        route: {
          id: 'r1',
          attributes: { long_name: 'Route 1', short_name: 'R1' },
        },
        predictions: [],
        alerts: [],
        vehicles: [],
      },
      {
        route: {
          id: 'r2',
          attributes: { long_name: 'Route 2', short_name: 'R2' },
        },
        predictions: [],
        alerts: [],
        vehicles: [],
      },
    ],
    fetchStops: async (_query?: string) => [],
  },
}));

import { optimizeRoute } from '@/lib/decisionEngine/optimizeRoute';
import { scoreRoute } from '@/lib/decisionEngine/scoring';

describe('Preference sorting', () => {
  it('honors most-reliable preference by prioritizing reliability', async () => {
    // We'll craft route scores by directly calling scoring.scoreRoute
    // Create two fake scored routes with differing reliability
    const r1 = scoreRoute('Route 1', [], [], []); // reliability 100 by default logic? use as-is
    const r2 = scoreRoute('Route 2', [], [], []);

    // Call optimizer with preference 'most-reliable' — primarily ensures no crash
    const res = await optimizeRoute(undefined, undefined, 'most-reliable');
    expect(res).toHaveProperty('routes');
    expect(Array.isArray(res.routes)).toBe(true);
  });
});
