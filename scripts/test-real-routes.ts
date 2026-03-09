/**
 * Quick real-world test of route optimization with live MBTA API
 * Run with: npx tsx scripts/test-real-routes.ts
 */

// Force real MBTA API (not mocks)
process.env.MBTA_MOCK = '0';
process.env.NODE_ENV = 'production';

import { optimizeRoute } from '../lib/decisionEngine/optimizeRoute';

const testRoutes = [
  {
    origin: 'Quincy Center',
    destination: 'South Station',
    line: 'Red Line',
  },
  { origin: 'South Station', destination: 'Quincy Center', line: 'Red Line' },
  { origin: 'Alewife', destination: 'Ashmont', line: 'Red Line' },
  { origin: 'Park Street', destination: 'Harvard', line: 'Red Line' },
  { origin: 'Oak Grove', destination: 'Forest Hills', line: 'Orange Line' },
];

async function testRoute(
  origin: string,
  destination: string,
  line: string,
): Promise<void> {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Testing: ${line}: ${origin} → ${destination}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  try {
    const result = await optimizeRoute(origin, destination, 'subway');

    console.log(`✅ Results: ${result.routes.length} route options found`);

    if (result.routes.length === 0) {
      console.log(`⚠️  No route options available (may be off-peak hours)`);
      return;
    }

    // Check for duplicates
    const routeKeys = result.routes.map(
      (r) => `${r.routeId}|${r.nextArrivalISO}`,
    );
    const uniqueKeys = new Set(routeKeys);

    if (routeKeys.length !== uniqueKeys.size) {
      console.error(
        `❌ DUPLICATE FOUND: ${routeKeys.length} routes, ${uniqueKeys.size} unique`,
      );
      console.log('\nAll route keys:');
      routeKeys.forEach((key, idx) => console.log(`  ${idx + 1}. ${key}`));
    } else {
      console.log(`✅ No duplicates (${uniqueKeys.size} unique routes)`);
    }

    // Group by route to verify we have up to 5 per route
    const byRoute = new Map<string, number>();
    for (const route of result.routes) {
      const count = byRoute.get(route.routeId) || 0;
      byRoute.set(route.routeId, count + 1);
    }

    console.log(`\n📊 Routes found:`);
    for (const [routeId, count] of byRoute.entries()) {
      console.log(`   ${routeId}: ${count} upcoming train(s)`);
      if (count > 5) {
        console.error(
          `   ❌ ERROR: More than 5 trains for ${routeId} (found ${count})`,
        );
      }
    }

    console.log(`\n🚆 First 3 upcoming trains:`);
    for (let i = 0; i < Math.min(3, result.routes.length); i++) {
      const r = result.routes[i];
      console.log(
        `   ${i + 1}. ${r.routeName} - ${r.nextArrivalMinutes}min (Direction: ${r.directionId}, Reliability: ${r.reliabilityScore}/100)`,
      );
    }
  } catch (error: any) {
    console.error(`❌ FAILED: ${error.message}`);
    console.error(error.stack);
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`     REAL MBTA API ROUTE TESTING`);
  console.log(`${'='.repeat(60)}\n`);

  let passed = 0;
  let failed = 0;

  for (const { origin, destination, line } of testRoutes) {
    try {
      await testRoute(origin, destination, line);
      passed++;
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      failed++;
      console.error(`\n❌ Test failed for ${line}: ${origin} → ${destination}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`     TEST SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   Total: ${testRoutes.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`${'='.repeat(60)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
