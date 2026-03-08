import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/mbta/mbtaClient', () => ({
  mbtaClient: {
    fetchAllRouteData: async () => [
      {
        route: {
          id: 'r-serve-both',
          attributes: { long_name: 'Blue Express', short_name: 'BX' },
        },
        predictions: [],
        alerts: [],
        vehicles: [],
      },
      {
        route: {
          id: 'r-serve-origin-only',
          attributes: { long_name: 'Green Local', short_name: 'GL' },
        },
        predictions: [],
        alerts: [],
        vehicles: [],
      },
    ],
    // return two stops for origin/destination with ids and wheelchair flags
    fetchStops: async (query?: string) => {
      if (!query) return [];
      if (query.toLowerCase().includes('origin')) {
        return [
          {
            id: 's-origin',
            type: 'stop',
            attributes: { name: 'Origin Station', wheelchair_boarding: 1 },
          },
        ];
      }
      return [
        {
          id: 's-dest',
          type: 'stop',
          attributes: { name: 'Destination Station', wheelchair_boarding: 1 },
        },
      ];
    },
    // schedules link routes to stop ids
    fetchSchedules: async (routeId: string) => {
      if (routeId === 'r-serve-both') {
        return [
          { relationships: { stop: { data: { id: 's-origin' } } } },
          { relationships: { stop: { data: { id: 's-dest' } } } },
        ];
      }
      // other route only serves origin
      return [{ relationships: { stop: { data: { id: 's-origin' } } } }];
    },
  },
}));

import { optimizeRoute } from '@/lib/decisionEngine/optimizeRoute';

describe('Preference heuristics (unit)', () => {
  it('orders routes by fewest transfers for least-transfers', async () => {
    const res = await optimizeRoute('Origin', 'Destination', 'least-transfers');
    expect(res.routes.length).toBeGreaterThanOrEqual(2);
    // first route should serve both stops => transfersEstimate === 0
    expect(res.routes[0].transfersEstimate).toBe(0);
  });

  it('prefers accessible routes for accessible preference', async () => {
    const res = await optimizeRoute('Origin', 'Destination', 'accessible');
    expect(res.routes.length).toBeGreaterThanOrEqual(2);
    // first route should be accessible (both stops wheelchair accessible)
    expect(res.routes[0].accessible).toBe(true);
  });
});
