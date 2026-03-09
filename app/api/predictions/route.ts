import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';
import type { ApiErrorResponse } from '@/types/routeTypes';

// POST /api/predictions
// Accepts { routeId, stopId, directionId? } and returns up to 5 upcoming predictions
export async function POST(request: Request) {
  try {
    const { routeId, stopId, directionId } = await request.json();
    if (!routeId || !stopId) {
      return NextResponse.json(
        { error: 'routeId and stopId are required', statusCode: 400 },
        { status: 400 },
      );
    }
    // Fetch predictions for this stop
    const predictions = await mbtaClient.fetchPredictionsByStop(stopId);
    // Filter by route and (optionally) direction
    let filtered = predictions.filter(
      (p) =>
        p.relationships.route?.data?.id === routeId &&
        (!directionId || p.attributes.direction_id === directionId),
    );
    // Sort by arrival_time or departure_time
    filtered = filtered
      .filter((p) => p.attributes.arrival_time || p.attributes.departure_time)
      .sort((a, b) => {
        const aTime = new Date(
          a.attributes.arrival_time || a.attributes.departure_time || '',
        ).getTime();
        const bTime = new Date(
          b.attributes.arrival_time || b.attributes.departure_time || '',
        ).getTime();
        return aTime - bTime;
      });
    // Limit to 5
    filtered = filtered.slice(0, 5);
    return NextResponse.json({ predictions: filtered });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, statusCode: 500 } as ApiErrorResponse,
      { status: 500 },
    );
  }
}
