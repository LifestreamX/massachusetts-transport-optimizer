import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';

// GET /api/stations - Returns all MBTA stops (subway + commuter rail)
export async function GET() {
  try {
    const stops = await mbtaClient.fetchStops();
    // For each stop, fetch schedules to determine which routes/lines serve it
    // This can be slow, so we use Promise.all with concurrency limit
    const CONCURRENCY = 8;
    const stations: any[] = [];
    let idx = 0;
    async function processNext() {
      if (idx >= stops.length) return;
      const stop = stops[idx++];
      try {
        const schedules = await mbtaClient.fetchSchedulesByStop(stop.id);
        // Extract unique route IDs from schedules
        const lines = Array.from(
          new Set(
            schedules
              .map((s: any) => s.relationships?.route?.data?.id)
              .filter(Boolean),
          ),
        );
        stations.push({
          id: stop.id,
          name: stop.attributes.name,
          description: stop.attributes.description,
          latitude: stop.attributes.latitude,
          longitude: stop.attributes.longitude,
          wheelchair_boarding: stop.attributes.wheelchair_boarding,
          platform_name: stop.attributes.platform_name,
          address: stop.attributes.address,
          lines,
        });
      } catch (err) {
        // If schedules fail, still include the stop without lines
        stations.push({
          id: stop.id,
          name: stop.attributes.name,
          description: stop.attributes.description,
          latitude: stop.attributes.latitude,
          longitude: stop.attributes.longitude,
          wheelchair_boarding: stop.attributes.wheelchair_boarding,
          platform_name: stop.attributes.platform_name,
          address: stop.attributes.address,
          lines: [],
        });
      }
      await processNext();
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, processNext));
    return NextResponse.json({ stations });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to fetch stations',
        details: err instanceof Error ? err.message : err,
      },
      { status: 500 },
    );
  }
}
