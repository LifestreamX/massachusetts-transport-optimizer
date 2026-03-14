#!/usr/bin/env ts-node
import { optimizeRoute } from '../lib/decisionEngine/optimizeRoute';

async function main() {
  // Test Framingham/Worcester Line at Ashland
  const origin = 'Ashland';
  const destination = 'South Station';
  console.log(`Running optimizeRoute(${origin} -> ${destination})`);
  try {
    const res = await optimizeRoute(origin, destination, 'commuter');
    console.log('\n=== RESULTS ===');
    res.routes.forEach((r, i) => {
      console.log(`\n${i+1}. ${r.routeName}`);
      console.log(`   hasPrediction: ${r.hasPrediction}`);
      console.log(`   hasSchedule: ${r.hasSchedule}`);
      console.log(`   nextArrivalMinutes: ${r.nextArrivalMinutes}`);
      console.log(`   nextArrivalISO: ${r.nextArrivalISO}`);
      console.log(`   stopId: ${r.stopId}`);
    });
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
