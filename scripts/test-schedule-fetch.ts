#!/usr/bin/env ts-node
import { mbtaClient } from '../lib/mbta/mbtaClient';

async function main() {
  // Test Greenbush at Quincy Center  const routeId = 'CR-Greenbush';
  const stopId = '70102'; // Quincy Center
  
  console.log(`Fetching schedules for route=${routeId}, stop=${stopId}`);
  
  try {
    const schedules = await mbtaClient.fetchSchedules(routeId, stopId);
    console.log(`\nGot ${schedules.length} schedule entries`);
    
    if (schedules.length > 0) {
      console.log('\nFirst 10 schedules:');
      schedules.slice(0, 10).forEach((sch: any, idx: number) => {
        const arrival = sch.attributes?.arrival_time;
        const departure = sch.attributes?.departure_time;
        const directionId = sch.attributes?.direction_id;
        console.log(`  ${idx+1}. arrival=${arrival}, departure=${departure}, direction=${directionId}`);
      });

      // Check for future schedules
      const now = Date.now();
      const futureSchedules = schedules.filter((sch: any) => {
        const t = sch.attributes?.arrival_time || sch.attributes?.departure_time;
        if (!t) return false;
        return new Date(String(t)).getTime() > now;
      });
      console.log(`\nFuture schedules: ${futureSchedules.length}`);
      if (futureSchedules.length > 0) {
        const nextSched = futureSchedules[0];
        const t = nextSched.attributes?.arrival_time || nextSched.attributes?.departure_time;
        console.log(`Next scheduled time: ${t}`);        console.log(`Direction: ${nextSched.attributes?.direction_id}`);
      }
    } else {
      console.log('\nNo schedules returned. Testing without stop filter...');
      const allSchedules = await mbtaClient.fetchSchedules(routeId);
      console.log(`Got ${allSchedules.length} schedules total for route`);
      if (allSchedules.length > 0) {
        console.log('\nSample schedule entry:');
        console.log(JSON.stringify(allSchedules[0], null, 2));
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
