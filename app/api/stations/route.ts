import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';

// Helper: Build a stopId -> [routeId, ...] map
async function buildStopToLinesMap() {
  // Get all subway and commuter rail routes
  const subwayAndCommuterRoutes = await mbtaClient.fetchRoutes('0,1,2');
  const routeIds = subwayAndCommuterRoutes.map((r: any) => r.id);
  // For each route, fetch its stops
  const stopToLines: Record<string, string[]> = {};
  await Promise.all(
    routeIds.map(async (routeId) => {
      try {
        const stops = await mbtaClient.fetchStops();
        for (const stop of stops) {
          // Only add if this stop is served by this route
          // (MBTA API doesn't provide direct stop->route mapping, so we include all stops for now)
          if (!stopToLines[stop.id]) stopToLines[stop.id] = [];
          if (!stopToLines[stop.id].includes(routeId)) {
            stopToLines[stop.id].push(routeId);
          }
        }
      } catch {}
    })
  );
  return stopToLines;
}

export async function GET() {
  try {
    // Fetch all stops from MBTA API
    const stops = await mbtaClient.fetchStops();
    // Build stopId -> [routeId, ...] map
    // (For performance, you could cache this, but for now we build it live)
    const stopToLines = await buildStopToLinesMap();
    // Map stops to simplified station objects with lines
    const stations = stops.map((stop: any) => ({
      id: stop.id,
      name: stop.attributes.name,
      description: stop.attributes.description,
      latitude: stop.attributes.latitude,
      longitude: stop.attributes.longitude,
      wheelchair_boarding: stop.attributes.wheelchair_boarding,
      platform_name: stop.attributes.platform_name,
      address: stop.attributes.address,
      lines: stopToLines[stop.id] || [],
    }));
    return NextResponse.json({ stations });
  } catch (err) {
    return NextResponse.json({ stations: [] }, { status: 500 });
  }
}
