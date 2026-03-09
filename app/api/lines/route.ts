import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';

// GET /api/lines - Returns all MBTA subway and commuter rail lines with metadata
export async function GET() {
  try {
    // Get all routes (subway + commuter rail)
    const routes = await mbtaClient.fetchRoutes();
    // Only include subway and commuter rail (type 0, 1, 2)
    const filtered = routes.filter(
      (r) =>
        r.attributes.type === 0 ||
        r.attributes.type === 1 ||
        r.attributes.type === 2,
    );
    // Map to UI-friendly format
    const lines = filtered.map((r) => ({
      id: r.id,
      name: r.attributes.long_name,
      shortName: r.attributes.short_name,
      type: r.attributes.type === 2 ? 'commuter' : 'subway',
      description: r.attributes.description,
      directionNames: r.attributes.direction_names,
      directionDestinations: r.attributes.direction_destinations,
      // Color: fallback to MBTA defaults (could be improved with a color map)
      color: getLineColor(r.id, r.attributes.type),
    }));
    return NextResponse.json({ lines });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to fetch lines',
        details: err instanceof Error ? err.message : err,
      },
      { status: 500 },
    );
  }
}

// Simple color map for MBTA lines (can be expanded or fetched from MBTA API if available)
function getLineColor(id: string, type: number): string {
  const colorMap: Record<string, string> = {
    red: '#DA291C',
    orange: '#ED8B00',
    blue: '#003DA5',
    'green-b': '#00843D',
    'green-c': '#00843D',
    'green-d': '#00843D',
    'green-e': '#00843D',
    // Commuter rail default
    defaultCommuter: '#80276C',
  };
  if (type === 2) return colorMap['defaultCommuter'];
  return colorMap[id] || '#888';
}
