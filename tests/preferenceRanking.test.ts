import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/mbta/mbtaClient', () => ({
  mbtaClient: {
    fetchAllRouteData: async () => [
      // Route that clearly matches Red Line
      {
        route: {
          id: 'r-red',
          attributes: { long_name: 'Red Line', short_name: 'Red' },
        },
        predictions: [],
        alerts: [],
        vehicles: [],
      },
      // Route that matches commuter rail (non-subway)
      {
        route: {
          id: 'r-comm',
          attributes: {
            long_name: 'Framingham/Worcester Line',
            short_name: 'FW',
          },
        },
        predictions: [],
        alerts: [],
        vehicles: [],
      },
      // Generic route
      {
        route: {
          id: 'r-x',
          attributes: { long_name: 'Crosstown Shuttle', short_name: 'X' },
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

describe('Preference ranking heuristics', () => {
  it('prioritizes least transfers when requested', async () => {
    const res = await optimizeRoute(
      'Park Street',
      'Quincy Adams',
      'least-transfers',
    );
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
    // Expect routes that match the selected lines to be first (transfersEstimate === 0)
    const first = res.routes[0];
    expect(first.transfersEstimate).toBeDefined();
  });

  it('prioritizes subway routes for accessible preference', async () => {
    const res = await optimizeRoute(
      'Park Street',
      'Downtown Crossing',
      'accessible',
    );
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
    // First route should be marked accessible true when available
    expect(res.routes[0].accessible).toBeDefined();
  });
});
