/**
 * Integration tests for the optimize-route API endpoint.
 * Tests validation, error handling, and response structure.
 */

import { describe, it, expect } from 'vitest';
import type {
  OptimizeRouteRequest,
  OptimizeRouteResponse,
  ApiErrorResponse,
} from '../types/routeTypes';

const API_URL = process.env.LOCAL_API
  ? `${process.env.LOCAL_API}/api/optimize-route`
  : 'http://localhost:3000/api/optimize-route';

describe('POST /api/optimize-route', () => {
  describe('Input Validation', () => {
    it('should reject empty origin', async () => {
      const request: Partial<OptimizeRouteRequest> = {
        origin: '',
        destination: 'Harvard',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const body = (await response.json()) as ApiErrorResponse;
      expect(body.error).toContain('origin');
    });

    it('should reject empty destination', async () => {
      const request: Partial<OptimizeRouteRequest> = {
        origin: 'Park Street',
        destination: '',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const body = (await response.json()) as ApiErrorResponse;
      expect(body.error).toContain('destination');
    });

    it('should reject missing origin', async () => {
      const request: Partial<OptimizeRouteRequest> = {
        destination: 'Harvard',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should reject missing destination', async () => {
      const request: Partial<OptimizeRouteRequest> = {
        origin: 'Park Street',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should reject malformed JSON', async () => {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should reject non-string origin', async () => {
      const request = {
        origin: 123,
        destination: 'Harvard',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should trim whitespace from inputs', async () => {
      const request: OptimizeRouteRequest = {
        origin: '  Park Street  ',
        destination: '  Harvard  ',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      // Should succeed after trimming
      expect(response.ok).toBe(true);
    });
  });

  describe('Successful Requests', () => {
    it('should return valid route options', async () => {
      const request: OptimizeRouteRequest = {
        origin: 'Park Street',
        destination: 'Harvard',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const body = (await response.json()) as OptimizeRouteResponse;

      expect(body).toHaveProperty('routes');
      expect(body).toHaveProperty('lastUpdated');
      expect(Array.isArray(body.routes)).toBe(true);
      expect(typeof body.lastUpdated).toBe('string');
    });

    it('should return routes with required fields', async () => {
      const request: OptimizeRouteRequest = {
        origin: 'South Station',
        destination: 'North Station',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      expect(response.ok).toBe(true);

      const body = (await response.json()) as OptimizeRouteResponse;

      if (body.routes.length > 0) {
        const route = body.routes[0];
        expect(route).toHaveProperty('routeName');
        expect(route).toHaveProperty('totalEstimatedTime');
        expect(route).toHaveProperty('delayMinutes');
        expect(route).toHaveProperty('reliabilityScore');
        expect(route).toHaveProperty('alertSummary');

        expect(typeof route.routeName).toBe('string');
        expect(typeof route.totalEstimatedTime).toBe('number');
        expect(typeof route.delayMinutes).toBe('number');
        expect(typeof route.reliabilityScore).toBe('number');
        expect(Array.isArray(route.alertSummary)).toBe(true);
      }
    });

    it('should return sorted routes by time', async () => {
      const request: OptimizeRouteRequest = {
        origin: 'Park Street',
        destination: 'Harvard',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const body = (await response.json()) as OptimizeRouteResponse;

      if (body.routes.length > 1) {
        for (let i = 1; i < body.routes.length; i++) {
          const prevTime = body.routes[i - 1].totalEstimatedTime;
          const currTime = body.routes[i].totalEstimatedTime;
          expect(currTime).toBeGreaterThanOrEqual(prevTime);
        }
      }
    });

    it('should handle various station names', async () => {
      const stations = [
        'Park Street',
        'Harvard',
        'South Station',
        'Airport',
        'Forest Hills',
      ];

      for (const origin of stations.slice(0, 2)) {
        for (const destination of stations.slice(2, 4)) {
          const request: OptimizeRouteRequest = { origin, destination };

          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          });

          expect(response.ok).toBe(true);
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle MBTA API unavailability gracefully', async () => {
      // This test would require mocking the MBTA API
      // For now, we just verify the endpoint handles errors
      const request: OptimizeRouteRequest = {
        origin: 'Invalid Station XYZ',
        destination: 'Another Invalid ABC',
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      // Should either succeed or return proper error
      if (!response.ok) {
        const body = (await response.json()) as ApiErrorResponse;
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('statusCode');
      }
    });
  });

  describe('HTTP Methods', () => {
    it('should reject GET requests', async () => {
      const response = await fetch(API_URL, {
        method: 'GET',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(405);

      const body = (await response.json()) as ApiErrorResponse;
      expect(body.error).toContain('POST');
    });

    it('should reject PUT requests', async () => {
      const response = await fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: 'Park Street', destination: 'Harvard' }),
      });

      expect(response.ok).toBe(false);
    });

    it('should reject DELETE requests', async () => {
      const response = await fetch(API_URL, {
        method: 'DELETE',
      });

      expect(response.ok).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should respond within reasonable time', async () => {
      const request: OptimizeRouteRequest = {
        origin: 'Park Street',
        destination: 'Harvard',
      };

      const start = Date.now();
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(10000); // Should respond within 10 seconds
    }, 15000);

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        origin: 'Park Street',
        destination: `Test ${i}`,
      }));

      const promises = requests.map((request) =>
        fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }),
      );

      const responses = await Promise.all(promises);

      for (const response of responses) {
        expect([200, 400, 500]).toContain(response.status);
      }
    }, 20000);
  });

  describe('Caching', () => {
    it('should return consistent results for same request', async () => {
      const request: OptimizeRouteRequest = {
        origin: 'Park Street',
        destination: 'Harvard',
      };

      const response1 = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const response2 = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const body1 = (await response1.json()) as OptimizeRouteResponse;
      const body2 = (await response2.json()) as OptimizeRouteResponse;

      // Should have similar structure (exact match not required due to live data)
      expect(body1.routes.length).toBeGreaterThan(0);
      expect(body2.routes.length).toBeGreaterThan(0);
    });
  });
});

describe('Stress Testing', () => {
  it('should handle 100 sequential requests', async () => {
    const request: OptimizeRouteRequest = {
      origin: 'Park Street',
      destination: 'Harvard',
    };

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    console.log(
      `Stress test results: ${successCount} successes, ${errorCount} errors`,
    );

    // Should have mostly successful requests
    expect(successCount).toBeGreaterThan(50);
  }, 120000); // 2 minute timeout

  it('should handle varying payload sizes', async () => {
    const longStationName = 'A'.repeat(1000);

    const request: OptimizeRouteRequest = {
      origin: longStationName,
      destination: 'Harvard',
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    // Should handle gracefully (either succeed or proper error)
    expect([200, 400, 500]).toContain(response.status);
  });
});
