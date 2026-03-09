import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';

export async function GET() {
  try {
    // Fetch subway (0,1) and commuter rail (2) routes
    const routes = await mbtaClient.fetchRoutes('0,1,2');

    // Subway lines (collapse Green branches)
    const colorLines = [
      { id: 'Red', name: 'Red Line', color: '#DA291C', type: 'subway' },
      { id: 'Orange', name: 'Orange Line', color: '#ED8B00', type: 'subway' },
      { id: 'Blue', name: 'Blue Line', color: '#003DA5', type: 'subway' },
      {
        id: 'Green',
        name: 'Green Line',
        color: '#00843D',
        type: 'subway',
        branches: ['Green-B', 'Green-C', 'Green-D', 'Green-E'],
      },
    ];

    const subwayLines = colorLines.map((line) => {
      if (line.id === 'Green') {
        const greenBranches = routes.filter((r: any) =>
          line.branches.includes(r.id),
        );
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

    // Commuter rail lines
    const commuterRailLines = routes
      .filter((r: any) => r.attributes.type === 2)
      .map((r: any) => ({
        id: r.id,
        name: r.attributes.long_name,
        shortName: r.attributes.short_name || r.id,
        type: 'commuter' as const,
        description: r.attributes.description,
        directionNames: r.attributes.direction_names,
        directionDestinations: r.attributes.direction_destinations,
        color: '#80276C', // MBTA purple for commuter rail
      }));

    const lines = [...subwayLines, ...commuterRailLines];
    return NextResponse.json({ lines });
  } catch (err) {
    console.error('[lines API] Failed to fetch lines:', err);
    return NextResponse.json({ lines: [] }, { status: 500 });
  }
}
