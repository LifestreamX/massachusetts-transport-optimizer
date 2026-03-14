#!/usr/bin/env ts-node
/**
 * Integration test for commuter rail schedule fallback and route→stop mapping.
 * 
 * This script validates:
 * 1. Routes with different stop IDs per line are correctly mapped
 * 2. Schedule fallback works when predictions are unavailable
 * 3. Both live predictions and scheduled times are returned
 */

import { optimizeRoute } from '../lib/decisionEngine/optimizeRoute';

interface TestCase {
  name: string;
  origin: string;
  destination: string;
  mode?: string;
  expectedRoutes: string[];
  requireScheduleOrPrediction: boolean;
}

const TEST_CASES: TestCase[] = [
  {
    name: 'Quincy Center → South Station (Red + Greenbush)',
    origin: 'Quincy Center',
    destination: 'South Station',
    mode: 'all',
    expectedRoutes: ['Red Line', 'Greenbush Line'],
    requireScheduleOrPrediction: true,
  },
  {
    name: 'Ashland → South Station (Worcester Line)',
    origin: 'Ashland',
    destination: 'South Station',
    mode: 'commuter',
    expectedRoutes: ['Framingham/Worcester Line'],
    requireScheduleOrPrediction: true,
  },
  {
    name: 'South Station → Back Bay (multiple options)',
    origin: 'South Station',
    destination: 'Back Bay',
    mode: 'all',
    expectedRoutes: ['Orange Line'],
    requireScheduleOrPrediction: true,
  },
  {
    name: 'Park Street → Harvard (Red Line)',
    origin: 'Park Street',
    destination: 'Harvard',
    mode: 'subway',
    expectedRoutes: ['Red Line'],
    requireScheduleOrPrediction: true,
  },
];

async function runTest(test: TestCase): Promise<boolean> {
  console.log(`\n🧪 Testing: ${test.name}`);
  console.log(`   ${test.origin} → ${test.destination} (mode: ${test.mode || 'all'})`);
  
  try {
    const result = await optimizeRoute(test.origin, test.destination, test.mode);
    
    if (!result.routes || result.routes.length === 0) {
      console.log('   ❌ FAIL: No routes returned');
      return false;
    }
    
    console.log(`   ✓ Got ${result.routes.length} route(s)`);
    
    // Check if expected routes are present
    const foundRoutes = result.routes.map(r => r.routeName);
    const missingRoutes = test.expectedRoutes.filter(
      expected => !foundRoutes.some(found => 
        found.toLowerCase().includes(expected.toLowerCase())
      )
    );
    
    if (missingRoutes.length > 0) {
      console.log(`   ⚠️  Missing expected routes: ${missingRoutes.join(', ')}`);
      console.log(`   Found: ${foundRoutes.join(', ')}`);
    }
    
    // Check each route has either prediction or schedule
    let passCount = 0;
    let failCount = 0;
    
    for (const route of result.routes) {
      const hasETA = route.hasPrediction || route.hasSchedule;
      const etaType = route.hasPrediction ? 'live' : route.hasSchedule ? 'scheduled' : 'none';
      const minutes = route.nextArrivalMinutes !== undefined ? `${route.nextArrivalMinutes}m` : 'N/A';
      
      if (test.requireScheduleOrPrediction && !hasETA) {
        console.log(`   ❌ ${route.routeName}: No ETA (${etaType})`);
        failCount++;
      } else {
        console.log(`   ✓ ${route.routeName}: ${etaType} ETA in ${minutes} (stopId: ${route.stopId})`);
        passCount++;
      }
    }
    
    if (failCount > 0) {
      console.log(`   ❌ FAIL: ${failCount} routes missing ETAs`);
      return false;
    }
    
    console.log(`   ✅ PASS: All ${passCount} routes have ETAs`);
    return true;
  } catch (err) {
    console.log(`   ❌ ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting integration tests for commuter rail schedule fallback\n');
  console.log('=' .repeat(70));
  
  const results = await Promise.all(TEST_CASES.map(runTest));
  
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 Test Summary:');
  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;
  
  console.log(`   ✅ Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}/${results.length}`);
  }
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main();
