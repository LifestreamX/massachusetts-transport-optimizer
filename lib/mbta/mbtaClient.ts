/**
 * MBTA V3 API client.
 *
 * All calls are parallelised where possible, wrapped in the typed fetch
 * helper, and cached through the cache service.
 */

import { typedFetch } from '@/lib/utils/fetchWrapper';
import { MbtaApiError } from '@/lib/utils/errors';
import { cacheService } from '@/lib/cache/cacheService';
import type {
  MbtaRoutesResponse,
  MbtaPredictionsResponse,
  MbtaAlertsResponse,
  MbtaVehiclesResponse,
  MbtaStopsResponse,
  MbtaSchedulesResponse,
  MbtaRouteResource,
  MbtaPredictionResource,
  MbtaAlertResource,
  MbtaVehicleResource,
  MbtaStopResource,
  MbtaScheduleResource,
} from './mbtaTypes';

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const MBTA_BASE_URL = 'https://api-v3.mbta.com';
const API_KEY = process.env.MBTA_API_KEY ?? '';

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(path, MBTA_BASE_URL);
  if (API_KEY) url.searchParams.set('api_key', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/* ------------------------------------------------------------------ */
/*  Low-level fetchers (cached)                                        */
/* ------------------------------------------------------------------ */

async function fetchRoutes(filterType?: string): Promise<MbtaRouteResource[]> {
  const params: Record<string, string> = {
    'fields[route]':
      'long_name,short_name,type,description,direction_names,direction_destinations',
  };
  if (filterType) params['filter[type]'] = filterType;

  const cacheKey = `mbta:routes:${filterType ?? 'all'}`;

  return cacheService.getOrFetch(cacheKey, async () => {
    const result = await typedFetch<MbtaRoutesResponse>(
      buildUrl('/routes', params),
    );
    if (!result.ok) throw new MbtaApiError(result.error.message);
    return result.data.data;
  });
}

async function fetchPredictions(
  routeId: string,
): Promise<MbtaPredictionResource[]> {
  const params: Record<string, string> = {
    'filter[route]': routeId,
    'fields[prediction]':
      'arrival_time,departure_time,direction_id,status,schedule_relationship',
    sort: 'arrival_time',
  };

  const cacheKey = `mbta:predictions:${routeId}`;

  return cacheService.getOrFetch(cacheKey, async () => {
    const result = await typedFetch<MbtaPredictionsResponse>(
      buildUrl('/predictions', params),
    );
    if (!result.ok) throw new MbtaApiError(result.error.message);
    return result.data.data;
  });
}

async function fetchPredictionsByStop(
  stopId: string,
): Promise<MbtaPredictionResource[]> {
  const params: Record<string, string> = {
    'filter[stop]': stopId,
    'fields[prediction]':
      'arrival_time,departure_time,direction_id,status,schedule_relationship',
    sort: 'arrival_time',
  };

  const cacheKey = `mbta:predictions:stop:${stopId}`;

  return cacheService.getOrFetch(cacheKey, async () => {
    const result = await typedFetch<MbtaPredictionsResponse>(
      buildUrl('/predictions', params),
    );
    if (!result.ok) throw new MbtaApiError(result.error.message);
    return result.data.data;
  });
}

async function fetchAlerts(routeId: string): Promise<MbtaAlertResource[]> {
  const params: Record<string, string> = {
    'filter[route]': routeId,
    'fields[alert]':
      'header,description,severity,effect,lifecycle,active_period,informed_entity',
  };

  const cacheKey = `mbta:alerts:${routeId}`;

  return cacheService.getOrFetch(cacheKey, async () => {
    const result = await typedFetch<MbtaAlertsResponse>(
      buildUrl('/alerts', params),
    );
    if (!result.ok) throw new MbtaApiError(result.error.message);
    return result.data.data;
  });
}

async function fetchVehicles(routeId: string): Promise<MbtaVehicleResource[]> {
  const params: Record<string, string> = {
    'filter[route]': routeId,
    'fields[vehicle]':
      'current_status,speed,latitude,longitude,direction_id,updated_at',
  };

  const cacheKey = `mbta:vehicles:${routeId}`;

  return cacheService.getOrFetch(cacheKey, async () => {
    const result = await typedFetch<MbtaVehiclesResponse>(
      buildUrl('/vehicles', params),
    );
    if (!result.ok) throw new MbtaApiError(result.error.message);
    return result.data.data;
  });
}

async function fetchStops(query?: string): Promise<MbtaStopResource[]> {
  const params: Record<string, string> = {
    'fields[stop]':
      'name,description,latitude,longitude,wheelchair_boarding,platform_name,address',
  };
  if (query) params['filter[name]'] = query;
  const cacheKey = `mbta:stops:${query ?? 'all'}`;

  // If querying for all stops (no query param), cache longer since stop list changes rarely
  const ttl = query ? undefined : 24 * 60 * 60; // 24 hours for full stop list

  return cacheService.getOrFetch(
    cacheKey,
    async () => {
      const result = await typedFetch<MbtaStopsResponse>(
        buildUrl('/stops', params),
      );
      if (!result.ok) throw new MbtaApiError(result.error.message);
      return result.data.data;
    },
    ttl,
  );
}

async function fetchSchedules(
  routeId: string,
  stopId?: string,
): Promise<MbtaScheduleResource[]> {
  const params: Record<string, string> = {
    'filter[route]': routeId,
    'fields[schedule]':
      'arrival_time,departure_time,direction_id,stop_sequence,timepoint',
    sort: 'departure_time',
  };
  if (stopId) params['filter[stop]'] = stopId;

  const cacheKey = `mbta:schedules:${routeId}:${stopId ?? 'all'}`;

  return cacheService.getOrFetch(cacheKey, async () => {
    const result = await typedFetch<MbtaSchedulesResponse>(
      buildUrl('/schedules', params),
    );
    if (!result.ok) throw new MbtaApiError(result.error.message);
    return result.data.data;
  });
}

async function fetchSchedulesByStop(
  stopId: string,
): Promise<MbtaScheduleResource[]> {
  const params: Record<string, string> = {
    'filter[stop]': stopId,
    'fields[schedule]':
      'arrival_time,departure_time,direction_id,stop_sequence,timepoint',
    sort: 'departure_time',
  };

  const cacheKey = `mbta:schedules:stop:${stopId}`;

  return cacheService.getOrFetch(cacheKey, async () => {
    const result = await typedFetch<MbtaSchedulesResponse>(
      buildUrl('/schedules', params),
    );
    if (!result.ok) throw new MbtaApiError(result.error.message);
    return result.data.data;
  });
}

/* ------------------------------------------------------------------ */
/*  High-level aggregated fetch (parallel)                             */
/* ------------------------------------------------------------------ */

export interface MbtaRouteData {
  route: MbtaRouteResource;
  predictions: MbtaPredictionResource[];
  alerts: MbtaAlertResource[];
  vehicles: MbtaVehicleResource[];
}

/**
 * Fetch all transit routes (subway + light rail) and, for each route,
 * fetch predictions, alerts, and vehicles **in parallel**.
 */
async function fetchAllRouteData(): Promise<MbtaRouteData[]> {
  // Type 0 = Light Rail, 1 = Heavy Rail (subway)
  const routes = await fetchRoutes('0,1');

  // Limit concurrency to 3 at a time
  const concurrency = 3;
  const results: MbtaRouteData[] = [];
  let idx = 0;
  async function processNext() {
    if (idx >= routes.length) return;
    const route = routes[idx++];
    try {
      const [predictions, alerts, vehicles] = await Promise.all([
        fetchPredictions(route.id),
        fetchAlerts(route.id),
        fetchVehicles(route.id),
      ]);
      results.push({ route, predictions, alerts, vehicles });
    } catch (err) {
      console.error(`Error fetching data for route ${route.id}:`, err);
    }
    await processNext();
  }
  // Start up to 'concurrency' parallel chains
  await Promise.all(Array.from({ length: concurrency }, processNext));
  return results;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export const mbtaClient = {
  fetchRoutes,
  fetchPredictions,
  fetchAlerts,
  fetchVehicles,
  fetchStops,
  fetchSchedules,
  fetchPredictionsByStop,
  fetchSchedulesByStop,
  fetchAllRouteData,
} as const;
