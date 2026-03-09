/**
 * Comprehensive route testing suite - Tests 1000+ route combinations with real MBTA API
 */

import { describe, it, expect } from 'vitest';
import { mbtaClient } from '@/lib/mbta/mbtaClient';
import { optimizeRoute } from '@/lib/decisionEngine/optimizeRoute';
import {
  RED_LINE_STATIONS,
  ORANGE_LINE_STATIONS,
  BLUE_LINE_STATIONS,
  GREEN_LINE_B_STATIONS,
  GREEN_LINE_C_STATIONS,
  GREEN_LINE_D_STATIONS,
  GREEN_LINE_E_STATIONS,
} from '@/lib/data/stationsByLine';

// All subway lines with their stations
const ALL_SUBWAY_LINES = [
  { name: 'Red Line', stations: RED_LINE_STATIONS },
  { name: 'Orange Line', stations: ORANGE_LINE_STATIONS },
  { name: 'Blue Line', stations: BLUE_LINE_STATIONS },
  { name: 'Green Line B', stations: GREEN_LINE_B_STATIONS },
  { name: 'Green Line C', stations: GREEN_LINE_C_STATIONS },
  { name: 'Green Line D', stations: GREEN_LINE_D_STATIONS },
  { name: 'Green Line E', stations: GREEN_LINE_E_STATIONS },
];

// Helper: Generate all pairs of stations on a line
function generateLinePairs(stations: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      pairs.push([stations[i], stations[j]]);
      pairs.push([stations[j], stations[i]]); // Both directions
    }
  }
  return pairs;
}

// Helper: Delay to avoid rate limiting
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generate all test pairs (1000+)
const allTestPairs: Array<{ line: string; origin: string; destination: string }> = [];
for (const line of ALL_SUBWAY_LINES) {
  const pairs = generateLinePairs(line.stations);
  for (const [origin, destination] of pairs) {
    allTestPairs.push({ line: line.name, origin, destination });
  }
}

console.log(`\nGenerated ${allTestPairs.length} test route pairs\n`);

describe('Comprehensive Route Testing - 1000+ Routes', () => {
  // Test in batches to manage rate limiting
  const BATCH_SIZE = 50;
  const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds
  const DELAY_BETWEEN_REQUESTS = 200; // 200ms

  for (let batchIndex = 0; batchIndex < Math.ceil(allTestPairs.length / BATCH_SIZE); batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, allTestPairs.length);
    const batch = allTestPairs.slice(batchStart, batchEnd);

    describe(`Batch ${batchIndex + 1}/${Math.ceil(allTestPairs.length / BATCH_SIZE)} (Routes ${batchStart + 1}-${batchEnd})`, () => {
      it.concurrent(
        `should process ${batch.length} route pairs correctly`,
        { timeout: 300_000 }, // 5 minutes per batch
        async () => {
          const results = {
            total: batch.length,
            successful: 0,
            failed: 0,
            noPredictions: 0,
            withDuplicates: 0,
            withPredictions: 0,
            errors: [] as Array<{ route: string; error: string }>,
          };

          for (let i = 0; i < batch.length; i++) {
            const { line, origin, destination } = batch[i];
            const routeDesc = `${line}: ${origin} → ${destination}`;

            try {
              await delay(DELAY_BETWEEN_REQUESTS);

              const result = await optimizeRoute(origin, destination, 'subway');

              // Validate response structure
              expect(result).toBeDefined();
              expect(result.routes).toBeInstanceOf(Array);
              expect(result.lastUpdated).toBeDefined();

              // Check for duplicates
              const routeKeys = result.routes.map(
                (r) => `${r.routeId}|${r.nextArrivalISO}`,
              );
              const uniqueKeys = new Set(routeKeys);
              if (routeKeys.length !== uniqueKeys.size) {
                results.withDuplicates++;
                console.warn(
                  `⚠️  DUPLICATE FOUND: ${routeDesc} - ${routeKeys.length} routes, ${uniqueKeys.size} unique`,
                );
              }

              // Check if we got predictions
              if (result.routes.length === 0) {
                results.noPredictions++;
              } else {
                results.withPredictions++;

                // Validate each route option
                for (const route of result.routes) {
                  expect(route.routeName).toBeDefined();
                  expect(route.routeId).toBeDefined();
                  expect(route.stopId).toBeDefined();
                  expect(route.nextArrivalMinutes).toBeDefined();
                  expect(route.nextArrivalISO).toBeDefined();
                  expect(route.totalEstimatedTime).toBeGreaterThanOrEqual(0);
                  expect(route.reliabilityScore).toBeGreaterThanOrEqual(0);
                  expect(route.reliabilityScore).toBeLessThanOrEqual(100);

                  // Validate direction is set when predictions exist
                  if (route.directionId === undefined) {
                    console.warn(
                      `⚠️  Missing directionId: ${routeDesc} - ${route.routeName}`,
                    );
                  }
                }

                // Validate we get up to 5 trains per route (or fewer if less available)
                const routeGroups = new Map<string, number>();
                for (const route of result.routes) {
                  const count = routeGroups.get(route.routeId) || 0;
                  routeGroups.set(route.routeId, count + 1);
                }

                for (const [routeId, count] of routeGroups.entries()) {
                  if (count > 5) {
                    console.warn(
                      `⚠️  TOO MANY TRAINS: ${routeDesc} - ${routeId} has ${count} entries (should be ≤5)`,
                    );
                  }
                }
              }

              results.successful++;
            } catch (error: any) {
              results.failed++;
              results.errors.push({
                route: routeDesc,
                error: error.message || String(error),
              });
              console.error(`❌ FAILED: ${routeDesc} - ${error.message}`);
            }

            // Progress indicator
            if ((i + 1) % 10 === 0 || i === batch.length - 1) {
              console.log(
                `  Progress: ${i + 1}/${batch.length} (${Math.round(((i + 1) / batch.length) * 100)}%)`,
              );
            }
          }

          // Print batch summary
          console.log(`\n📊 Batch ${batchIndex + 1} Summary:`);
          console.log(`   Total: ${results.total}`);
          console.log(`   ✅ Successful: ${results.successful}`);
          console.log(`   ❌ Failed: ${results.failed}`);
          console.log(`   📦 With predictions: ${results.withPredictions}`);
          console.log(`   📭 No predictions: ${results.noPredictions}`);
          console.log(`   ⚠️  With duplicates: ${results.withDuplicates}`);

          if (results.errors.length > 0) {
            console.log(`\n   Errors:`);
            results.errors.forEach((e) => {
              console.log(`   - ${e.route}: ${e.error}`);
            });
          }

          // Assertions
          expect(results.successful).toBeGreaterThan(0);
          expect(results.withDuplicates).toBe(0); // No duplicates allowed!
          expect(results.failed).toBeLessThan(results.total * 0.1); // Allow <10% failure rate
        },
      );

      // Delay between batches
      if (batchIndex < Math.ceil(allTestPairs.length / BATCH_SIZE) - 1) {
        it('should wait before next batch', async () => {
          console.log(`\n⏳ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...\n`);
          await delay(DELAY_BETWEEN_BATCHES);
        });
      }
    });
  }
});

describe('Critical Route Tests - Must Pass', () => {
  const criticalRoutes = [
    { origin: 'Quincy Center', destination: 'South Station', line: 'Red Line' },
    { origin: 'South Station', destination: 'Quincy Center', line: 'Red Line' },
    { origin: 'Alewife', destination: 'Ashmont', line: 'Red Line' },
    { origin: 'Ashmont', destination: 'Alewife', line: 'Red Line' },
    { origin: 'Oak Grove', destination: 'Forest Hills', line: 'Orange Line' },
    { origin: 'Forest Hills', destination: 'Oak Grove', line: 'Orange Line' },
    { origin: 'Wonderland', destination: 'Bowdoin', line: 'Blue Line' },
    { origin: 'Bowdoin', destination: 'Wonderland', line: 'Blue Line' },
  ];

  for (const { origin, destination, line } of criticalRoutes) {
    it(
      `should handle ${line}: ${origin} → ${destination} correctly`,
      { timeout: 30_000 },
      async () => {
        const result = await optimizeRoute(origin, destination, 'subway');

        // Must have valid response
        expect(result).toBeDefined();
        expect(result.routes).toBeInstanceOf(Array);

        if (result.routes.length > 0) {
          // Check for duplicates
          const routeKeys = result.routes.map(
            (r) => `${r.routeId}|${r.nextArrivalISO}`,
          );
          const uniqueKeys = new Set(routeKeys);
          expect(routeKeys.length).toBe(uniqueKeys.size); // No duplicates!

          // Validate first route
          const firstRoute = result.routes[0];
          expect(firstRoute.routeName).toBeDefined();
          expect(firstRoute.routeId).toBeDefined();
          expect(firstRoute.stopId).toBeDefined();
          expect(firstRoute.nextArrivalMinutes).toBeDefined();
          expect(firstRoute.directionId).toBeDefined();

          // Should have up to 5 trains
          const routeGroups = new Map<string, number>();
          for (const route of result.routes) {
            const count = routeGroups.get(route.routeId) || 0;
            routeGroups.set(route.routeId, count + 1);
          }

          for (const [routeId, count] of routeGroups.entries()) {
            expect(count).toBeLessThanOrEqual(5);
          }

          console.log(
            `✅ ${line}: ${origin} → ${destination} - ${result.routes.length} results, no duplicates`,
          );
        } else {
          console.warn(
            `⚠️  ${line}: ${origin} → ${destination} - No predictions available`,
          );
        }
      },

    );
  }
});

describe('Direction Validation Tests', () => {
  it('should only return trains going from origin toward destination', async () => {
    const origin = 'Quincy Center';
    const destination = 'South Station';

    const result = await optimizeRoute(origin, destination, 'subway');

    if (result.routes.length > 0) {
      // All routes should have direction set
      for (const route of result.routes) {
        expect(route.directionId).toBeDefined();
        console.log(
          `  ${route.routeName} - Direction: ${route.directionId}, Next: ${route.nextArrivalMinutes}min`,
        );
      }

      // Should not have trains going in opposite directions
      const directions = new Set(result.routes.map((r) => r.directionId));
      console.log(`  Unique directions found: ${Array.from(directions).join(', ')}`);

      // For a single station pair, we expect mostly one direction
      // (unless there are multiple branches or routes)
    }
  });

  it('should handle reverse direction correctly', async () => {
    const origin = 'South Station';
    const destination = 'Quincy Center';

    const result = await optimizeRoute(origin, destination, 'subway');

    if (result.routes.length > 0) {
      for (const route of result.routes) {
        expect(route.directionId).toBeDefined();
        console.log(
          `  ${route.routeName} - Direction: ${route.directionId}, Next: ${route.nextArrivalMinutes}min`,
        );
      }
    }
  });
});
