import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';

export async function GET() {
  try {
    // Fetch only subway and light rail routes (types 0 and 1)
    // This excludes buses, ferries, and commuter rail from the line filter
    const routes = await mbtaClient.fetchRoutes('0,1');

    // Collapse all Green branches into a single Green Line, exclude Mattapan
    const colorLines = [
      { id: 'Red', name: 'Red Line', color: '#DA291C' },
      { id: 'Orange', name: 'Orange Line', color: '#ED8B00' },
      { id: 'Blue', name: 'Blue Line', color: '#003DA5' },
      {
        id: 'Green',
        name: 'Green Line',
        color: '#00843D',
        branches: ['Green-B', 'Green-C', 'Green-D', 'Green-E'],
      },
    ];

    const lines = colorLines.map((line) => {
      if (line.id === 'Green') {
        // Find all Green branches in the MBTA data
        const greenBranches = routes.filter((r: any) =>
          line.branches.includes(r.id),
        );
        // Use the first available branch for details, or fallback
        const branch = greenBranches[0] || {};
        return {
          id: 'Green',
          name: 'Green Line',
          shortName: 'Green',
          type: 'subway' as const,
          description: branch.attributes?.description || 'Green Line',
          directionNames: branch.attributes?.direction_names || [],
          directionDestinations:
            branch.attributes?.direction_destinations || [],
          color: line.color,
        };
      } else {
        const route = routes.find((r: any) => r.id === line.id);
        return {
          id: line.id,
          name: line.name,
          shortName: line.id,
          type: 'subway' as const,
          description: route?.attributes?.description || line.name,
          directionNames: route?.attributes?.direction_names || [],
          directionDestinations:
            route?.attributes?.direction_destinations || [],
          color: line.color,
        };
      }
    });
    return NextResponse.json({ lines });
  } catch (err) {
    console.error('[lines API] Failed to fetch lines:', err);
    return NextResponse.json({ lines: [] }, { status: 500 });
  }
}
