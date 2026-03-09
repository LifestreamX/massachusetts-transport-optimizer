import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';

// Helper: Build a stopId -> [routeId, ...] map
async function buildStopToLinesMap() {
  // Get all subway and commuter rail routes
  const subwayAndCommuterRoutes = await mbtaClient.fetchRoutes('0,1,2');
  const routeIds = subwayAndCommuterRoutes.map((r: any) => r.id);
  // For each route, fetch only the stops served by that route
  const stopToLines: Record<string, string[]> = {};
  await Promise.all(
    routeIds.map(async (routeId) => {
      try {
        const stops = await mbtaClient.fetchStops({ routeId });
        for (const stop of stops) {
           // Use parent_station from relationships if present, otherwise use stop.id
           const stationId = stop.relationships?.parent_station?.data?.id || stop.id;
          if (!stationId) continue; // skip if neither present
          if (!stopToLines[stationId]) stopToLines[stationId] = [];
          if (!stopToLines[stationId].includes(routeId)) {
            stopToLines[stationId].push(routeId);
          }
        }
      } catch {}
    }),
  );
  return stopToLines;
}

export async function GET() {
  try {
    // Fetch all stops from MBTA API
    const stops = await mbtaClient.fetchStops();
    // Build stopId -> [routeId, ...] map
    const stopToLines = await buildStopToLinesMap();
    // Map parent_station or stop.id to a single station object
    const stationMap: Record<string, any> = {};
    for (const stop of stops) {
      const stationId = stop.relationships?.parent_station?.data?.id || stop.id;
      if (!stationId) continue;
      // Only keep the first occurrence (parent_station is always the same for all platforms)
      if (!stationMap[stationId]) {
        stationMap[stationId] = {
          id: stationId,
          name: stop.attributes.name,
          description: stop.attributes.description,
          latitude: stop.attributes.latitude,
          longitude: stop.attributes.longitude,
          wheelchair_boarding: stop.attributes.wheelchair_boarding,
          platform_name: stop.attributes.platform_name,
          address: stop.attributes.address,
          lines: stopToLines[stationId] || [],
        };
      }
    }
    const stations = Object.values(stationMap);
    return NextResponse.json({ stations });
  } catch (err) {
    return NextResponse.json({ stations: [] }, { status: 500 });
  }
}
