/**
 * Cache service – thin layer over the Redis client.
 *
 * Provides a generic `getOrFetch` helper that:
 *  1. Checks cache
 *  2. Falls back to a fetcher function
 *  3. Writes the result back to cache
 *  4. Gracefully degrades if the cache is unavailable
 */

import { redisClient } from './redisClient';

// Increased to 5 minutes to significantly reduce API load and prevent rate limiting
// MBTA data doesn't change that frequently, 5 min is acceptable for real-time apps
const DEFAULT_TTL_SECONDS = 300; // 5 minutes

// Request deduplication: prevent multiple simultaneous fetches of the same key
// Using unknown instead of any for better type safety
const pendingRequests = new Map<string, Promise<unknown>>();

async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL_SECONDS,
): Promise<T> {
  // 1. Try cache
  try {
    const cached = await redisClient.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Cache read failed – proceed without cache
  }

  // 2. Check if there's already a pending request for this key
  const pending = pendingRequests.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  // 3. Fetch fresh data
  const fetchPromise = (async () => {
    try {
      const freshData = await fetcher();

      // Write back to cache (fire-and-forget, don't block response)
      try {
        await redisClient.set(key, JSON.stringify(freshData), 'EX', ttl);
      } catch {
        // Cache write failed – non-critical
      }

      return freshData;
    } finally {
      // Clean up pending request
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, fetchPromise);
  return fetchPromise;
}

async function invalidate(key: string): Promise<void> {
  try {
    await redisClient.del(key);
  } catch {
    // Ignore cache errors
  }
}

/**
 * Direct cache get - returns cached value or null
 */
async function get<T>(key: string): Promise<T | null> {
  try {
    const cached = await redisClient.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Cache read failed
  }
  return null;
}

/**
 * Direct cache set - stores value with TTL
 */
async function set<T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  try {
    await redisClient.set(key, JSON.stringify(value), 'EX', ttl);
  } catch {
    // Cache write failed - non-critical
  }
}

export const cacheService = {
  getOrFetch,
  invalidate,
  get,
  set,
} as const;
