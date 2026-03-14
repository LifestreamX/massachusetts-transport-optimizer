#!/usr/bin/env ts-node
import { mbtaClient } from '../lib/mbta/mbtaClient';

async function main() {
  console.log('Fetching all routes...');
  try {
    const routes = await mbtaClient.fetchRoutes();
    const commuter = routes.filter(
      (r: any) =>
        r.attributes?.type === 2 ||
        String(r.id).toLowerCase().startsWith('cr-'),
    );
    console.log(`Total routes: ${routes.length}, commuter: ${commuter.length}`);
    commuter.slice(0, 50).forEach((r: any) => {
      console.log(
        r.id,
        '|',
        r.attributes?.long_name || r.attributes?.short_name,
      );
    });
  } catch (err) {
    console.error('Error fetching routes:', err);
  }
}

main();
