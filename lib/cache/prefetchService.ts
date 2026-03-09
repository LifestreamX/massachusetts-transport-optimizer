/**
 * Background prefetch service for station data.
 * Fetches and caches station departure data for all MBTA stations
 * to ensure instant responses and avoid rate limiting issues.
 */

import { mbtaClient } from '@/lib/mbta/mbtaClient';
import { cacheService } from './cacheService';
import { PRIORITY_STATIONS, UNIQUE_STATIONS } from './stationList';
import type { MbtaStopResource } from '@/lib/mbta/mbtaTypes';

interface PrefetchResult {
  station: string;
  success: boolean;
  cached: boolean;
  error?: string;
  departureCount?: number;
  duration?: number;
}

interface PrefetchSummary {
  totalStations: number;
  successCount: number;
  failureCount: number;
  cachedCount: number;
  totalDuration: number;
  results: PrefetchResult[];
}

/**
 * Fetch station data and cache it (duplicates logic from station-info route)
 */
async function fetchAndCacheStation(station: string): Promise<PrefetchResult> {
  const startTime = Date.now();
  const result: PrefetchResult = {
    station,
    success: false,
    cached: false,
  };

  try {
    // Check if already cached (within last 4 minutes)
    const cacheKey = `station:${station
      .toLowerCase()
      .replace(/\s+/g, '-')}:prefetch`;
    const cachedData = await cacheService.get(cacheKey);

    if (cachedData) {
      result.success = true;
      result.cached = true;
      result.duration = Date.now() - startTime;
      return result;
    }

    // Fetch station data
    let allStops: MbtaStopResource[] = [];

    try {
      allStops = await mbtaClient.fetchStops(station);
    } catch (err) {
      // If filter[name] fails, fallback to local matching
      if (err instanceof Error && err.message.includes('400')) {
        allStops = await mbtaClient.fetchStops();

        // Simple fuzzy matching
        const normalizedStation = station.toLowerCase().replace(/[^\w\s]/g, '');
        allStops = allStops.filter((stop) => {
          const stopName = (stop.attributes.name || '').toLowerCase();
          return stopName.includes(normalizedStation);
        });
      } else {
        throw err;
      }
    }

    if (allStops.length === 0) {
      result.error = 'No stops found';
      result.duration = Date.now() - startTime;
      return result;
    }

    // Filter to actual platform stops
    let platformStops = allStops.filter(
      (stop) =>
        stop.attributes.location_type === 0 ||
        stop.attributes.location_type === 1,
    );
    // import { PRIORITY_STATIONS, UNIQUE_STATIONS } from './stationList';
    if (platformStops.length === 0) {
      platformStops = allStops.filter(
      // Prefetch all stations dynamically from MBTA API
      let stations: string[] = [];
          !stop.id.includes('-lobby') &&
          !stop.id.includes('-under') &&
          !stop.id.includes('-stair') &&
          !stop.id.includes('-exit') &&
          !stop.id.includes('-entrance') &&
          !stop.id.includes('unpaid') &&
          !stop.id.includes('fare') &&
          !/^\d+$/.test(stop.id),
      );
    }

    // Limit to 3 platforms max
    if (platformStops.length > 3) {
      platformStops = platformStops.slice(0, 3);
    }

      try {
        const stops = await mbtaClient.fetchStops(); // fetch all stops
        stations = stops.map((stop: any) => stop.attributes.name).filter(Boolean);
        // Remove duplicates and sort
        stations = Array.from(new Set(stations)).sort();
      } catch (err) {
        // If MBTA API fails, fallback to static UNIQUE_STATIONS
        console.warn('[prefetch] MBTA API failed, using static fallback');
        stations = typeof UNIQUE_STATIONS !== 'undefined' ? UNIQUE_STATIONS : [];
      }
    // Fetch predictions for each stop (with concurrency limit)
    const concurrency = 2; // Lower than normal to be gentle on API during prefetch
    let stopIndex = 0;
    const stopIdArray = platformStops.map((s) => s.id);
    const allPredictions: any[] = [];

    async function processNextStop() {
      if (stopIndex >= stopIdArray.length) return;
      const stopId = stopIdArray[stopIndex++];

      // 5s timeout per stop during prefetch
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Stop fetch timeout')), 5000),
      );

      try {
        const predictions = await Promise.race([
          mbtaClient.fetchPredictionsByStop(stopId),
          timeoutPromise,
        ]);

        // Ensure predictions is an array before spreading
        if (Array.isArray(predictions)) {
          allPredictions.push(...predictions);
        }
      } catch (err) {
        // Ignore individual stop failures during prefetch
        console.warn(
          `[prefetch] Failed to fetch predictions for stop ${stopId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }

      await processNextStop();
    }

    // Process stops in parallel with controlled concurrency
    await Promise.all(
      Array.from({ length: Math.min(concurrency, stopIdArray.length) }, () =>
        processNextStop(),
      ),
    );

    // Cache the result for 5 minutes
    const cacheData = {
      station,
      departureCount: allPredictions.length,
      timestamp: new Date().toISOString(),
    };

    await cacheService.set(cacheKey, cacheData, 300); // 5 min TTL

    result.success = true;
    result.cached = true;
    result.departureCount = allPredictions.length;
    result.duration = Date.now() - startTime;

    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.duration = Date.now() - startTime;
    return result;
  }
}

/**
 * Prefetch all priority stations (high-traffic stations first)
 */
export async function prefetchPriorityStations(): Promise<PrefetchSummary> {
  console.log(
    `[prefetch] Starting priority station prefetch (${PRIORITY_STATIONS.length} stations)...`,
  );

  const startTime = Date.now();
  const results: PrefetchResult[] = [];

  // Process stations sequentially to respect rate limits
  for (const station of PRIORITY_STATIONS) {
    const result = await fetchAndCacheStation(station);
    results.push(result);

    // Delay between stations to avoid rate limiting (3 seconds)
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const summary: PrefetchSummary = {
    totalStations: PRIORITY_STATIONS.length,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
    cachedCount: results.filter((r) => r.cached).length,
    totalDuration: Date.now() - startTime,
    results,
  };

  console.log(
    `[prefetch] Priority station prefetch complete: ${summary.successCount}/${summary.totalStations} succeeded in ${summary.totalDuration}ms`,
  );

  return summary;
}

/**
 * Prefetch all stations (can take 5-10 minutes due to rate limits)
 */
export async function prefetchAllStations(): Promise<PrefetchSummary> {
  console.log(
    `[prefetch] Starting full station prefetch (${UNIQUE_STATIONS.length} stations)...`,
  );

  const startTime = Date.now();
  const results: PrefetchResult[] = [];

  // Process stations sequentially to respect rate limits
  for (const station of UNIQUE_STATIONS) {
    const result = await fetchAndCacheStation(station);
    results.push(result);

    // Small delay between stations
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const summary: PrefetchSummary = {
    totalStations: UNIQUE_STATIONS.length,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
    cachedCount: results.filter((r) => r.cached).length,
    totalDuration: Date.now() - startTime,
    results,
  };

  console.log(
    `[prefetch] Full station prefetch complete: ${summary.successCount}/${summary.totalStations} succeeded in ${summary.totalDuration}ms`,
  );

  return summary;
}
