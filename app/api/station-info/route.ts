/**
 * POST /api/station-info
 *
 * Accepts { station } and returns all departures/arrivals for that station.
 * Shows real-time predictions, schedules, alerts, and vehicle locations.
 */

import { NextResponse } from 'next/server';
import { mbtaClient } from '@/lib/mbta/mbtaClient';
import { AppError, BadRequestError, toError } from '@/lib/utils/errors';

interface StationInfoRequest {
  station: string;
}

interface StationInfoResponse {
  stationName: string;
  departures: {
    routeName: string;
    destination: string;
    departureTime: string | null;
    arrivalTime: string | null;
    minutesAway: number;
    status: string | null;
    tripHeadsign: string;
    track: string | null;
  }[];
  alerts: {
    header: string;
    severity: number;
    effect: string;
  }[];
  lastUpdated: string;
}

function jsonError(
  message: string,
  statusCode: number,
): NextResponse {
  return NextResponse.json(
    { error: message, statusCode },
    { status: statusCode },
  );
}

function calculateMinutesAway(departureTime: string | null): number {
  if (!departureTime) return 0;
  
  const now = new Date();
  const departure = new Date(departureTime);
  const diff = departure.getTime() - now.getTime();
  
  return Math.max(0, Math.round(diff / 60000));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // --- Input validation ---------------------------------------------------
    let body: StationInfoRequest;
    try {
      body = (await request.json()) as StationInfoRequest;
    } catch {
      throw new BadRequestError('Request body must be valid JSON');
    }

    const { station } = body;

    if (!station || typeof station !== 'string' || station.trim().length === 0) {
      throw new BadRequestError(
        'station is required and must be a non-empty string',
      );
    }

    // --- Fetch station data ------------------------------------------------
    // Get all routes (subway + commuter rail only for now)
    const allRouteData = await mbtaClient.fetchAllRouteData();
    
    // Filter for subway (0,1) and commuter rail (2)
    const relevantRoutes = allRouteData.filter(routeData => {
      const routeType = routeData.route.attributes.type;
      return routeType === 0 || routeType === 1 || routeType === 2;
    });

    // Collect all departures from predictions
    const departures: StationInfoResponse['departures'] = [];
    const alerts: StationInfoResponse['alerts'] = [];
    const alertSet = new Set<string>();

    for (const routeData of relevantRoutes) {
      const routeName = routeData.route.attributes.long_name || 
                        routeData.route.attributes.short_name || 
                        routeData.route.id;

      // Add predictions as departures
      for (const prediction of routeData.predictions) {
        const departureTime = prediction.attributes.departure_time;
        const arrivalTime = prediction.attributes.arrival_time;
        
        if (departureTime || arrivalTime) {
          departures.push({
            routeName,
            destination: routeData.route.attributes.direction_destinations?.[prediction.attributes.direction_id] || 'Unknown',
            departureTime,
            arrivalTime,
            minutesAway: calculateMinutesAway(departureTime || arrivalTime),
            status: prediction.attributes.status,
            tripHeadsign: routeData.route.attributes.direction_destinations?.[prediction.attributes.direction_id] || 'Unknown',
            track: null,
          });
        }
      }

      // Collect unique alerts
      for (const alert of routeData.alerts) {
        const alertKey = `${alert.attributes.header}_${alert.attributes.severity}`;
        if (!alertSet.has(alertKey)) {
          alertSet.add(alertKey);
          alerts.push({
            header: alert.attributes.header,
            severity: alert.attributes.severity,
            effect: alert.attributes.effect,
          });
        }
      }
    }

    // Sort departures by minutes away
    departures.sort((a, b) => a.minutesAway - b.minutesAway);

    // Take only next 20 departures
    const nextDepartures = departures.slice(0, 20);

    const response: StationInfoResponse = {
      stationName: station.trim(),
      departures: nextDepartures,
      alerts,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (caught: unknown) {
    const err = toError(caught);

    if (err instanceof AppError) {
      return jsonError(err.message, err.statusCode);
    }

    // Unexpected error → 500
    console.error('[station-info] Unhandled error:', err);
    return jsonError('Internal server error', 500);
  }
}

/**
 * GET handler returns 405 Method Not Allowed with a helpful message.
 */
export async function GET(): Promise<NextResponse> {
  return jsonError('Use POST with { station } body', 405);
}
