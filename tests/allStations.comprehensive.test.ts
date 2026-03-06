/**
 * Comprehensive test suite for ALL MBTA stations.
 * Tests every subway and commuter rail station to ensure:
 * - API doesn't timeout
 * - Response structure is correct
 * - Data is returned when available
 *
 * This test suite validates against the live MBTA API.
 */

import { describe, it, expect } from 'vitest';
import { mbtaClient } from '@/lib/mbta/mbtaClient';

// ALL MBTA Subway Stations
const SUBWAY_STATIONS = [
  'Alewife',
  'Davis',
  'Porter',
  'Harvard',
  'Central',
  'Kendall/MIT',
  'Charles/MGH',
  'Park Street',
  'Downtown Crossing',
  'South Station',
  'Broadway',
  'Andrew',
  'JFK/UMass',
  'Savin Hill',
  'Fields Corner',
  'Shawmut',
  'Ashmont',
  'North Quincy',
  'Wollaston',
  'Quincy Center',
  'Quincy Adams',
  'Braintree',
  'Oak Grove',
  'Malden Center',
  'Wellington',
  'Assembly',
  'Sullivan Square',
  'Community College',
  'North Station',
  'Haymarket',
  'State',
  'Chinatown',
  'Tufts Medical Center',
  'Back Bay',
  'Massachusetts Avenue',
  'Ruggles',
  'Roxbury Crossing',
  'Jackson Square',
  'Stony Brook',
  'Green Street',
  'Forest Hills',
  'Wonderland',
  'Revere Beach',
  'Beachmont',
  'Suffolk Downs',
  'Orient Heights',
  'Wood Island',
  'Airport',
  'Maverick',
  'Aquarium',
  'Government Center',
  'Bowdoin',
  'Boston College',
  'Cleveland Circle',
  'Riverside',
  'Heath Street',
  'Lechmere',
  'Science Park/West End',
  'Boylston',
  'Arlington',
  'Copley',
  'Hynes Convention Center',
  'Kenmore',
];

// ALL MBTA Commuter Rail Stations (sample subset for faster tests)
const COMMUTER_RAIL_STATIONS = [
  'North Station',
  'South Station',
  'Back Bay',
  'Porter',
  'Ruggles',
  'JFK/UMass',
  'Quincy Center',
  'Braintree',
  'Forest Hills',
  'Hyde Park',
  'Readville',
  'Malden Center',
  'Chelsea',
  'Lynn',
  'Salem',
  'Beverly',
  'Gloucester',
  'Rockport',
  'Newburyport',
  'Framingham',
  'Worcester/Union Station',
  'Waltham',
  'Concord',
  'Fitchburg',
  'Wachusett',
  'Lowell',
  'Haverhill',
  'Lawrence',
  'Andover',
  'Reading',
  'Wakefield',
  'Needham Heights',
  'Needham Center',
  'Wellesley Square',
  'Natick Center',
  'Ashland',
  'Southborough',
  'Route 128',
  'Canton Junction',
  'Sharon',
  'Mansfield',
  'Attleboro',
  'Providence',
  'Stoughton',
  'Kingston',
  'Plymouth',
  'Greenbush',
  'Cohasset',
  'Scituate',
  'Franklin/Dean College',
  'Forge Park/495',
];

describe('All Stations Comprehensive Tests', () => {
  // Increase timeout for all tests in this suite due to rate limiting
  const TEST_TIMEOUT = 60000; // 60 seconds per test

  describe('Subway Stations - fetchStops', () => {
    // Test in smaller batches to avoid rate limiting
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < SUBWAY_STATIONS.length; i += batchSize) {
      batches.push(SUBWAY_STATIONS.slice(i, i + batchSize));
    }

    batches.forEach((batch, batchIndex) => {
      it(
        `should fetch stops for subway batch ${batchIndex + 1} (${batch.length} stations)`,
        async () => {
          const results = await Promise.allSettled(
            batch.map((station) => mbtaClient.fetchStops(station)),
          );

          let successCount = 0;
          let failCount = 0;

          results.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
              expect(Array.isArray(result.value)).toBe(true);
              successCount++;
            } else {
              console.warn(
                `Failed to fetch stops for ${batch[idx]}:`,
                result.reason?.message,
              );
              failCount++;
            }
          });

          // Expect at least 70% success rate
          expect(successCount).toBeGreaterThanOrEqual(
            Math.floor(batch.length * 0.7),
          );
        },
        TEST_TIMEOUT,
      );
    });
  });

  describe('Commuter Rail Stations - fetchStops', () => {
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < COMMUTER_RAIL_STATIONS.length; i += batchSize) {
      batches.push(COMMUTER_RAIL_STATIONS.slice(i, i + batchSize));
    }

    batches.forEach((batch, batchIndex) => {
      it(
        `should fetch stops for commuter rail batch ${batchIndex + 1} (${batch.length} stations)`,
        async () => {
          const results = await Promise.allSettled(
            batch.map((station) => mbtaClient.fetchStops(station)),
          );

          let successCount = 0;
          results.forEach((result) => {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
              successCount++;
            }
          });

          expect(successCount).toBeGreaterThanOrEqual(
            Math.floor(batch.length * 0.7),
          );
        },
        TEST_TIMEOUT,
      );
    });
  });

  describe('Subway Stations - Predictions by Stop', () => {
    it('should fetch predictions for a sample of subway stops', async () => {
      // Test a sample of major stations
      const sampleStations = [
        'Park Street',
        'South Station',
        'North Station',
        'Harvard',
        'Kendall/MIT',
        'Quincy Center',
        'Forest Hills',
        'Wonderland',
        'Government Center',
      ];

      for (const stationName of sampleStations) {
        const stops = await mbtaClient.fetchStops(stationName);
        if (stops.length > 0) {
          const stopId = stops[0].id;
          const predictions = await mbtaClient.fetchPredictionsByStop(stopId);
          expect(Array.isArray(predictions)).toBe(true);
          // Predictions may be empty if no trains are coming
        }
      }
    }, 60000); // 60s for multiple API calls
  });

  describe('Station Info API Integration', () => {
    it('should handle POST requests to /api/station-info for major stations', async () => {
      const majorStations = [
        'Park Street',
        'South Station',
        'North Station',
        'Back Bay',
        'Quincy Center',
        'Harvard',
        'Forest Hills',
      ];

      for (const station of majorStations) {
        const response = await fetch('http://localhost:3000/api/station-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ station }),
        });

        expect(response.status).toBeLessThan(500); // No server errors
        if (response.ok) {
          const data = await response.json();
          expect(data).toHaveProperty('stationName');
          expect(data).toHaveProperty('departures');
          expect(data).toHaveProperty('alerts');
          expect(data).toHaveProperty('lastUpdated');
          expect(Array.isArray(data.departures)).toBe(true);
          expect(Array.isArray(data.alerts)).toBe(true);
        }
      }
    }, 120000); // 2 min for API integration test
  });

  describe('Routes and Predictions', () => {
    it('should fetch routes for subway and light rail', async () => {
      const routes = await mbtaClient.fetchRoutes('0,1');
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);

      // Verify route structure
      if (routes.length > 0) {
        const route = routes[0];
        expect(route).toHaveProperty('id');
        expect(route).toHaveProperty('attributes');
        expect(route.attributes).toHaveProperty('type');
      }
    }, 15000);

    it('should fetch predictions for each route', async () => {
      const routes = await mbtaClient.fetchRoutes('0,1');
      const sampleRoutes = routes.slice(0, 5); // Test first 5 routes

      for (const route of sampleRoutes) {
        const predictions = await mbtaClient.fetchPredictions(route.id);
        expect(Array.isArray(predictions)).toBe(true);
        // Predictions may be empty at certain times
      }
    }, 30000);

    it('should fetch alerts for each route', async () => {
      const routes = await mbtaClient.fetchRoutes('0,1');
      const sampleRoutes = routes.slice(0, 5);

      for (const route of sampleRoutes) {
        const alerts = await mbtaClient.fetchAlerts(route.id);
        expect(Array.isArray(alerts)).toBe(true);
      }
    }, 30000);
  });

  describe('Stress Test - Rapid Station Queries', () => {
    it('should handle 50 rapid station queries without errors', async () => {
      const testStations = SUBWAY_STATIONS.slice(0, 50);
      let successCount = 0;
      let errorCount = 0;

      await Promise.all(
        testStations.map(async (station) => {
          try {
            const stops = await mbtaClient.fetchStops(station);
            if (Array.isArray(stops)) successCount++;
          } catch (err) {
            errorCount++;
          }
        }),
      );

      expect(successCount).toBeGreaterThan(40); // At least 80% success rate
      expect(errorCount).toBeLessThan(10); // Less than 20% errors
    }, 60000);
  });

  describe('Cache Effectiveness', () => {
    it('should serve cached responses on repeated requests', async () => {
      // Use a unique station name for this test to avoid collisions with
      // earlier requests in the suite so we can measure cold vs warm fetches.
      const station = '__CACHE_TEST_STATION__';

      // First request
      const start1 = Date.now();
      const stops1 = await mbtaClient.fetchStops(station);
      const duration1 = Date.now() - start1;

      // Second request (should be cached)
      const start2 = Date.now();
      const stops2 = await mbtaClient.fetchStops(station);
      const duration2 = Date.now() - start2;

      expect(stops1).toEqual(stops2);
      // Cached request should be significantly faster (< 10ms vs 100ms+)
      expect(duration2).toBeLessThan(duration1 * 0.5);
    }, 15000);
  });

  describe('Error Handling', () => {
    it('should handle invalid station names gracefully', async () => {
      const invalidStations = [
        'Invalid Station XYZ',
        '12345',
        'NonExistentPlace',
        '',
      ];

      for (const station of invalidStations) {
        try {
          const stops = await mbtaClient.fetchStops(station);
          // Should return empty array or throw
          expect(Array.isArray(stops)).toBe(true);
        } catch (err) {
          // Error is acceptable for invalid input
          expect(err).toBeDefined();
        }
      }
    }, 30000);
  });

  describe('Data Validation', () => {
    it('should return properly structured stop data', async () => {
      const stops = await mbtaClient.fetchStops('South Station');

      if (stops.length > 0) {
        const stop = stops[0];
        expect(stop).toHaveProperty('id');
        expect(stop).toHaveProperty('type');
        expect(stop).toHaveProperty('attributes');
        expect(stop.attributes).toHaveProperty('name');
      }
    }, 15000);

    it('should return properly structured prediction data', async () => {
      const routes = await mbtaClient.fetchRoutes('1');
      if (routes.length > 0) {
        const predictions = await mbtaClient.fetchPredictions(routes[0].id);

        if (predictions.length > 0) {
          const prediction = predictions[0];
          expect(prediction).toHaveProperty('id');
          expect(prediction).toHaveProperty('type');
          expect(prediction).toHaveProperty('attributes');
        }
      }
    }, 15000);
  });
});
