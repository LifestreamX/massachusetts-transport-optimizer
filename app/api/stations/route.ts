import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';

export async function GET() {
  try {
    // Fetch all stops from MBTA API
    const stops = await mbtaClient.fetchStops();
    // Map stops to simplified station objects
    const stations = stops.map((stop: any) => ({
      id: stop.id,
      name: stop.attributes.name,
      description: stop.attributes.description,
      latitude: stop.attributes.latitude,
      longitude: stop.attributes.longitude,
      wheelchair_boarding: stop.attributes.wheelchair_boarding,
      platform_name: stop.attributes.platform_name,
      address: stop.attributes.address,
    }));
    return NextResponse.json({ stations });
  } catch (err) {
    return NextResponse.json({ stations: [] }, { status: 500 });
  }
}
