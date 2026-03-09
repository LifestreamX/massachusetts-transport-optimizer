#!/usr/bin/env ts-node
import { mbtaClient } from '../lib/mbta/mbtaClient';

(async () => {
  try {
    console.log('Calling mbtaClient.fetchRoutes("0,1")...');
    const routes = await mbtaClient.fetchRoutes('0,1');
    console.log('fetchRoutes returned', routes.length, 'routes');
    console.log(
      'Sample:',
      routes
        .slice(0, 12)
        .map((r) => ({
          id: r.id,
          name: r.attributes?.long_name ?? r.attributes?.short_name,
        })),
    );
  } catch (err: any) {
    console.error('fetchRoutes error:', err?.message ?? err);
  }
})();
