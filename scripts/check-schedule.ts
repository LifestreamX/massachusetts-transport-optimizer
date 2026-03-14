#!/usr/bin/env ts-node
import { mbtaClient } from '../lib/mbta/mbtaClient';

async function main() {
  const routeId = 'CR-Greenbush';
  const stopId = '70102';
  console.log(`Checking schedules for route=${routeId} stop=${stopId}`);
  try {
    const schedules = await mbtaClient.fetchSchedules(routeId, stopId);
    console.log(`Got ${schedules.length} schedules`);
    if (schedules.length > 0)
      console.log(JSON.stringify(schedules.slice(0, 5), null, 2));
  } catch (err) {
    console.error('Error fetching schedules:', err);
  }
}

main();
