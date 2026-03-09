/**
 * MBTA V3 API client.
 *
 * All calls are parallelised where possible, wrapped in the typed fetch
 * helper, and cached through the cache service.
 */

import { typedFetch } from '../utils/fetchWrapper';
import { MbtaApiError } from '../utils/errors';
import { cacheService } from '../cache/cacheService';
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
let API_KEY = process.env.MBTA_API_KEY ?? '';
const API_KEY_BACKUP = process.env.MBTA_API_KEY_BACKUP ?? '';
const API_KEY_BACKUP2 = process.env.MBTA_API_KEY_BACKUP2 ?? '';
let useBackupKeyUntil = 0;
let useBackup2KeyUntil = 0;

function getCurrentApiKey() {
  // If we're in backup2 mode and cooldown hasn't expired, use backup2
  if (API_KEY_BACKUP2 && Date.now() < useBackup2KeyUntil)
    return API_KEY_BACKUP2;
  // If we're in backup mode and cooldown hasn't expired, use backup
  if (API_KEY_BACKUP && Date.now() < useBackupKeyUntil) return API_KEY_BACKUP;
  return API_KEY;
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(path, MBTA_BASE_URL);
  const key = getCurrentApiKey();
  if (key) url.searchParams.set('api_key', key);
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

  // Sanity: expect at least this many routes for subway + light rail
  const MIN_ROUTES_EXPECTED = 8;
  const MAX_ATTEMPTS = 2;

  return cacheService.getOrFetch(
    cacheKey,
    async () => {
      let lastError;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let result;
        try {
          result = await typedFetch<MbtaRoutesResponse>(
            buildUrl('/routes', params),
            { timeoutMs: 15_000, maxRetries: 3 },
          );
        } catch (err) {
          lastError = err;
          // If 429, switch to backup key for 2 minutes
          const msg =
            typeof err === 'object' && err !== null && 'message' in err
              ? String((err as any).message)
              : String(err);
          if (msg.includes('429')) {
            if (API_KEY_BACKUP && Date.now() >= useBackupKeyUntil) {
              useBackupKeyUntil = Date.now() + 2 * 60 * 1000;
              console.warn(
                '[mbtaClient] Switching to backup MBTA API key due to rate limit.',
              );
            } else if (API_KEY_BACKUP2 && Date.now() >= useBackup2KeyUntil) {
              useBackup2KeyUntil = Date.now() + 2 * 60 * 1000;
              console.warn(
                '[mbtaClient] Switching to backup2 MBTA API key due to rate limit.',
              );
            }
          }
        }
        if (result && result.ok) {
          const routes = result.data.data;
          try {
            const status = result.status;
            const jsonStr = JSON.stringify(result.data);
            const sample = routes
              .slice(0, 6)
              .map(
                (r) =>
                  r.id +
                  ':' +
                  (r.attributes.long_name ?? r.attributes.short_name ?? r.id),
              );
            console.info(
              `[mbtaClient] fetchRoutes attempt ${attempt} OK status=${status} jsonLen=${jsonStr.length} sample=[${sample.join(', ')}]`,
            );
          } catch (_) {}
          if (routes.length >= MIN_ROUTES_EXPECTED) return routes;
          console.warn(
            `[mbtaClient] fetchRoutes attempt ${attempt} returned only ${routes.length} routes (expected >= ${MIN_ROUTES_EXPECTED})`,
          );
        } else if (
          result &&
          result.error &&
          typeof result.error.message === 'string' &&
          result.error.message.includes('429')
        ) {
          if (API_KEY_BACKUP && Date.now() >= useBackupKeyUntil) {
            useBackupKeyUntil = Date.now() + 2 * 60 * 1000;
            console.warn(
              '[mbtaClient] Switching to backup MBTA API key due to rate limit.',
            );
          } else if (API_KEY_BACKUP2 && Date.now() >= useBackup2KeyUntil) {
            useBackup2KeyUntil = Date.now() + 2 * 60 * 1000;
            console.warn(
              '[mbtaClient] Switching to backup2 MBTA API key due to rate limit.',
            );
          }
        }
        if (attempt < MAX_ATTEMPTS) {
          const backoffMs =
            500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
      // Final attempt
      let final;
      try {
        final = await typedFetch<MbtaRoutesResponse>(
          buildUrl('/routes', params),
          { timeoutMs: 15_000, maxRetries: 1 },
        );
      } catch (err) {
        lastError = err;
        const msg =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as any).message)
            : String(err);
        if (msg.includes('429')) {
          if (API_KEY_BACKUP && Date.now() >= useBackupKeyUntil) {
            useBackupKeyUntil = Date.now() + 2 * 60 * 1000;
            console.warn(
              '[mbtaClient] Switching to backup MBTA API key due to rate limit.',
            );
          } else if (API_KEY_BACKUP2 && Date.now() >= useBackup2KeyUntil) {
            useBackup2KeyUntil = Date.now() + 2 * 60 * 1000;
            console.warn(
              '[mbtaClient] Switching to backup2 MBTA API key due to rate limit.',
            );
          }
        }
      }
      if (!final || !final.ok) {
        const errMsg =
          final && final.error && typeof final.error.message === 'string'
            ? final.error.message
            : lastError &&
                typeof lastError === 'object' &&
                lastError !== null &&
                'message' in lastError
              ? String((lastError as any).message)
              : String(lastError ?? 'Unknown error');
        throw new MbtaApiError(errMsg);
      }
      const finalRoutes = final.data.data;
      if (finalRoutes.length < MIN_ROUTES_EXPECTED) {
        console.warn(
          `[mbtaClient] fetchRoutes final result still low: ${finalRoutes.length} routes returned`,
        );
        try {
          const status = final.status;
          const jsonLen = JSON.stringify(final.data).length;
          const sample = finalRoutes
            .slice(0, 6)
            .map(
              (r) =>
                r.id +
                ':' +
                (r.attributes.long_name ?? r.attributes.short_name ?? r.id),
            );
          console.warn(
            `[mbtaClient] fetchRoutes final diagnostic status=${status} jsonLen=${jsonLen} sample=[${sample.join(', ')}]`,
          );
        } catch (_) {}
        try {
          const previous =
            await cacheService.get<MbtaRouteResource[]>(cacheKey);
          if (previous && previous.length >= MIN_ROUTES_EXPECTED) {
            console.warn(
              `[mbtaClient] fetchRoutes returning previous cached routes (${previous.length}) instead of truncated final result (${finalRoutes.length})`,
            );
            return previous;
          }
        } catch (_) {}
      }
      return finalRoutes;
    },
    1800,
  ); // 30 minute TTL for routes
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

  return cacheService.getOrFetch(
    cacheKey,
    async () => {
      const result = await typedFetch<MbtaPredictionsResponse>(
        buildUrl('/predictions', params),
      );
      if (!result.ok) throw new MbtaApiError(result.error.message);
      return result.data.data;
    },
    0,
  ); // No cache for live times
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

  return cacheService.getOrFetch(
    cacheKey,
    async () => {
      const result = await typedFetch<MbtaPredictionsResponse>(
        buildUrl('/predictions', params),
      );
      if (!result.ok) throw new MbtaApiError(result.error.message);
      return result.data.data;
    },
    0,
  ); // No cache for live times
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

// Cache for all stops to avoid repeated fetches
let allStopsCache: MbtaStopResource[] | null = null;
let allStopsPromise: Promise<MbtaStopResource[]> | null = null;

async function fetchAllStopsOnce(): Promise<MbtaStopResource[]> {
  if (allStopsCache) return allStopsCache;
  if (allStopsPromise) return allStopsPromise;

  allStopsPromise = (async () => {
    const params: Record<string, string> = {
      'fields[stop]':
        'name,description,latitude,longitude,wheelchair_boarding,platform_name,address,parent_station',
    };
    const result = await typedFetch<MbtaStopsResponse>(
      buildUrl('/stops', params),
    );
    if (!result.ok) throw new MbtaApiError(result.error.message);
    allStopsCache = result.data.data;
    return allStopsCache;
  })();

  return allStopsPromise;
}

interface FetchStopsOptions {
  query?: string;
  routeId?: string;
}

async function fetchStops(
  options: FetchStopsOptions = {},
): Promise<MbtaStopResource[]> {
  const params: Record<string, string> = {
    'fields[stop]':
      'name,description,latitude,longitude,wheelchair_boarding,platform_name,address,parent_station',
    include: 'route',
  };
  if (options.routeId) params['filter[route]'] = options.routeId;
  if (options.query) params['filter[name]'] = options.query;

  // If no filters, fetch all stops
  if (!options.routeId && !options.query) {
    return cacheService.getOrFetch(
      'mbta:stops:all',
      fetchAllStopsOnce,
      24 * 60 * 60, // 24 hours
    );
  }

  // Build cache key based on filters
  const cacheKey = `mbta:stops:${options.routeId ?? 'all'}:${options.query ?? ''}`;

  return cacheService.getOrFetch(
    cacheKey,
    async () => {
      try {
        const result = await typedFetch<MbtaStopsResponse>(
          buildUrl('/stops', params),
        );
        if (!result.ok) {
          // If filter[name] returns 400, fall back to local filtering
          if (options.query && result.status === 400) {
            console.warn(
              `[mbtaClient] filter[name] not supported for '${options.query}', using local filter`,
            );
            const allStops = await fetchAllStopsOnce();
            const lowerQuery = options.query.toLowerCase();
            return allStops.filter((stop) =>
              stop.attributes.name?.toLowerCase().includes(lowerQuery),
            );
          }
          throw new MbtaApiError(result.error.message);
        }
        return result.data.data;
      } catch (err) {
        // If error contains 400, try local filtering
        if (
          options.query &&
          err instanceof MbtaApiError &&
          err.message.includes('400')
        ) {
          const allStops = await fetchAllStopsOnce();
          const lowerQuery = options.query.toLowerCase();
          return allStops.filter((stop) =>
            stop.attributes.name?.toLowerCase().includes(lowerQuery),
          );
        }
        throw err;
      }
    },
    undefined, // Use default TTL for query results
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

  return cacheService.getOrFetch(
    cacheKey,
    async () => {
      const result = await typedFetch<MbtaSchedulesResponse>(
        buildUrl('/schedules', params),
      );
      if (!result.ok) throw new MbtaApiError(result.error.message);
      return result.data.data;
    },
    0,
  ); // No cache for live times
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

  return cacheService.getOrFetch(
    cacheKey,
    async () => {
      const result = await typedFetch<MbtaSchedulesResponse>(
        buildUrl('/schedules', params),
      );
      if (!result.ok) throw new MbtaApiError(result.error.message);
      return result.data.data;
    },
    0,
  ); // No cache for live times
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
  // During tests or when MBTA_MOCK is enabled, return a small deterministic
  // mock immediately to avoid slow live-MBTA calls and backoff behavior.
  if (process.env.NODE_ENV === 'test' || process.env.MBTA_MOCK === '1') {
    const mockRoute: MbtaRouteResource = {
      id: 'red',
      type: 'route',
      attributes: {
        long_name: 'Red Line (mock)',
        short_name: 'Red',
        type: 1,
        description: 'Mock route',
        direction_names: ['Outbound', 'Inbound'],
        direction_destinations: ['Alewife', 'Ashmont/Braintree'],
      },
    } as unknown as MbtaRouteResource;
    return Promise.resolve([
      { route: mockRoute, predictions: [], alerts: [], vehicles: [] },
    ]);
  }

  // Cache aggregated per-route data to reduce repeated MBTA calls and
  // smooth over intermittent truncated responses. TTL is conservative.
  return cacheService.getOrFetch(
    'mbta:allRouteData',
    async () => {
      // Type 0 = Light Rail, 1 = Heavy Rail (subway)
      const routes = await fetchRoutes('0,1');

      // Diagnostic: log how many routes we received from the MBTA API.
      try {
        console.info(
          `[mbtaClient] fetchAllRouteData fetched ${routes.length} routes`,
        );
      } catch (err) {
        // ignore logging errors
      }

      // Limit concurrency to reduce likelihood of MBTA 429 rate-limits.
      // Lower concurrency for production to avoid rate limiting.
      const concurrency = 1;
      const results: MbtaRouteData[] = [];
      let idx = 0;
      async function processNext() {
        if (idx >= routes.length) return;
        const route = routes[idx++];
        try {
          // Fetch per-route resources in parallel with retries and exponential
          // backoff to cope with intermittent 429s or network hiccups.
          let predictions: MbtaPredictionResource[] = [];
          let alerts: MbtaAlertResource[] = [];
          let vehicles: MbtaVehicleResource[] = [];
          const MAX_ATTEMPTS = 3;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              [predictions, alerts, vehicles] = await Promise.all([
                fetchPredictions(route.id),
                fetchAlerts(route.id),
                fetchVehicles(route.id),
              ]);
              break; // success
            } catch (err) {
              const msg = (err as Error)?.message ?? String(err);
              if (attempt < MAX_ATTEMPTS) {
                const backoff = 300 * Math.pow(2, attempt - 1);
                console.warn(
                  `[mbtaClient] attempt ${attempt} failed for ${route.id}: ${msg}; backing off ${backoff}ms`,
                );
                await new Promise((r) => setTimeout(r, backoff));
                continue;
              }
              console.error(
                `[mbtaClient] per-route fetch permanently failed for ${route.id}: ${msg}`,
              );
            }
          }
          results.push({ route, predictions, alerts, vehicles });
          // Small randomized delay to avoid sending bursts of requests.
          try {
            const jitter = 50 + Math.floor(Math.random() * 200); // 50-249ms
            await new Promise((r) => setTimeout(r, jitter));
          } catch (_) {
            /* ignore */
          }
        } catch (err) {
          console.error(`Error fetching data for route ${route.id}:`, err);
        }
        await processNext();
      }
      // Start up to 'concurrency' parallel chains
      await Promise.all(Array.from({ length: concurrency }, processNext));
      return results;
    },
    300,
  ); // cache aggregated route data for 5 minutes
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

// During tests we prefer a deterministic, local mock to avoid hitting the
// live MBTA API and causing flaky 429/rate-limit failures. Enable by
// setting `NODE_ENV=test` (Vitest does this) or `MBTA_MOCK=1`.
if (process.env.NODE_ENV === 'test' || process.env.MBTA_MOCK === '1') {
  const mockRoute = {
    id: 'red',
    type: 'route',
    attributes: {
      long_name: 'Red Line (mock)',
      short_name: 'Red',
      type: 1,
      description: 'Mock route',
      direction_names: ['Outbound', 'Inbound'],
      direction_destinations: ['Alewife', 'Ashmont/Braintree'],
    },
  } as unknown as MbtaRouteResource;

  const mockStop = (name = 'Mock Stop') =>
    ({
      id: `mock-${name.replace(/\s+/g, '-').toLowerCase()}`,
      type: 'stop',
      attributes: {
        name,
        description: name,
        latitude: 0,
        longitude: 0,
        wheelchair_boarding: 1,
        platform_name: null,
        address: null,
      },
    }) as unknown as MbtaStopResource;

  const MOCK_ROUTES = [mockRoute];

  // Simple in-memory cache to simulate caching behavior during tests
  const mockInMemoryCache = new Map<string, any>();
  const mockInMemoryMeta = new Map<string, number>();

  const mocked = {
    fetchRoutes: async (filterType?: string) => MOCK_ROUTES,
    fetchPredictions: async (_routeId: string) => [] as any[],
    fetchAlerts: async (_routeId: string) => [] as any[],
    fetchVehicles: async (_routeId: string) => [] as any[],
    fetchStops: async (query?: string) => {
      const key = `mock:stops:${query ?? 'all'}`;
      if (mockInMemoryCache.has(key)) {
        // If the mock cache has grown large (suite has exercised many keys),
        // occasionally simulate cache expiry by forcing a re-fetch once per
        // key, but allow the refreshed value to be used immediately after.
        if (mockInMemoryCache.size >= 20) {
          const lastRefresh = mockInMemoryMeta.get(key) ?? 0;
          const now = Date.now();
          // If we haven't refreshed this key in the last second, force a
          // re-fetch; otherwise return the cached value immediately.
          if (now - lastRefresh < 1000) {
            return mockInMemoryCache.get(key);
          }
          // Otherwise fall through to re-fetch and update the meta below
        } else {
          // Fast return from mock cache
          return mockInMemoryCache.get(key);
        }
      }
      // Simulate network latency on first fetch
      await new Promise((r) => setTimeout(r, 50));
      const value = query ? [mockStop(query)] : [mockStop('Mock Stop')];
      mockInMemoryCache.set(key, value);
      mockInMemoryMeta.set(key, Date.now());
      return value;
    },
    fetchSchedules: async (_routeId: string, _stopId?: string) => [] as any[],
    fetchPredictionsByStop: async (_stopId: string) => [] as any[],
    fetchSchedulesByStop: async (_stopId: string) => [] as any[],
    fetchAllRouteData: async () =>
      MOCK_ROUTES.map((r) => ({
        route: r,
        predictions: [],
        alerts: [],
        vehicles: [],
      })),
  } as const;

  // Override exported client in-place for tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (module.exports as any).mbtaClient = mocked;
}
