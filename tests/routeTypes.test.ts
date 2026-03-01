/**
 * Tests for types/routeTypes.ts – structural type validation.
 * Ensures the types compile correctly and match expected shapes.
 */

import { describe, it, expect } from 'vitest';
import type {
  RouteOption,
  OptimizeRouteResponse,
  ApiErrorResponse,
  OptimizeRouteRequest,
} from '@/types/routeTypes';

describe('RouteOption type', () => {
  it('satisfies the type shape', () => {
    const option: RouteOption = {
      routeName: 'Red Line',
      totalEstimatedTime: 12,
      delayMinutes: 2,
      reliabilityScore: 90,
      alertSummary: ['Minor delay'],
    };
    expect(option.routeName).toBe('Red Line');
    expect(option.totalEstimatedTime).toBe(12);
    expect(option.delayMinutes).toBe(2);
    expect(option.reliabilityScore).toBe(90);
    expect(option.alertSummary).toEqual(['Minor delay']);
  });

  it('handles empty alertSummary', () => {
    const option: RouteOption = {
      routeName: 'Blue Line',
      totalEstimatedTime: 8,
      delayMinutes: 0,
      reliabilityScore: 100,
      alertSummary: [],
    };
    expect(option.alertSummary).toHaveLength(0);
  });
});

describe('OptimizeRouteResponse type', () => {
  it('satisfies the type shape', () => {
    const response: OptimizeRouteResponse = {
      routes: [],
      lastUpdated: new Date().toISOString(),
    };
    expect(response.routes).toEqual([]);
    expect(new Date(response.lastUpdated).getTime()).toBeGreaterThan(0);
  });

  it('contains multiple routes', () => {
    const response: OptimizeRouteResponse = {
      routes: [
        {
          routeName: 'A',
          totalEstimatedTime: 5,
          delayMinutes: 0,
          reliabilityScore: 100,
          alertSummary: [],
        },
        {
          routeName: 'B',
          totalEstimatedTime: 10,
          delayMinutes: 2,
          reliabilityScore: 80,
          alertSummary: ['Alert'],
        },
      ],
      lastUpdated: '2026-02-28T12:00:00.000Z',
    };
    expect(response.routes).toHaveLength(2);
  });
});

describe('ApiErrorResponse type', () => {
  it('satisfies the type shape', () => {
    const err: ApiErrorResponse = { error: 'Bad request', statusCode: 400 };
    expect(err.error).toBe('Bad request');
    expect(err.statusCode).toBe(400);
  });

  const errorCases: [string, number][] = [
    ['Bad request', 400],
    ['MBTA API request failed', 502],
    ['Internal server error', 500],
    ['Not found', 404],
    ['Method not allowed', 405],
  ];

  it.each(errorCases)('error "%s" with code %i', (msg, code) => {
    const err: ApiErrorResponse = { error: msg, statusCode: code };
    expect(err.error).toBe(msg);
    expect(err.statusCode).toBe(code);
  });
});

describe('OptimizeRouteRequest type', () => {
  it('satisfies the type shape', () => {
    const req: OptimizeRouteRequest = {
      origin: 'Park Street',
      destination: 'Harvard',
    };
    expect(req.origin).toBe('Park Street');
    expect(req.destination).toBe('Harvard');
  });

  const stationPairs: [string, string][] = [
    ['Park Street', 'Harvard'],
    ['Downtown Crossing', 'JFK/UMass'],
    ['South Station', 'Alewife'],
    ['Kenmore', 'Government Center'],
    ['North Station', 'Back Bay'],
    ['Airport', 'Wonderland'],
    ['Ashmont', 'Braintree'],
    ['Bowdoin', 'Oak Grove'],
    ['Forest Hills', 'Wellington'],
    ['Lechmere', 'Union Square'],
  ];

  it.each(stationPairs)('origin=%s destination=%s', (origin, destination) => {
    const req: OptimizeRouteRequest = { origin, destination };
    expect(req.origin).toBeTruthy();
    expect(req.destination).toBeTruthy();
    expect(typeof req.origin).toBe('string');
    expect(typeof req.destination).toBe('string');
  });
});
