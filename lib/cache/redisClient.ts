/**
 * Lightweight Redis client wrapper.
 *
 * In this MVP we use an **in-memory** cache that mirrors the Redis
 * get/set/del interface so the application code stays the same when a
 * real Redis instance is swapped in later.
 *
 * Drop-in replacement: swap this file for `ioredis` or `@upstash/redis`.
 */

import NodeCache from 'node-cache';

/**
 * Wrapper around `node-cache` to provide the same minimal API used by
 * `cacheService` (get/set/del/flushall). This keeps the file name
 * `redisClient.ts` unchanged so switching to a real Redis later is easy.
 */

const DEFAULT_TTL_SECONDS = 300; // matches cacheService default

class NodeCacheClient {
  private cache: NodeCache;

  constructor() {
    // checkperiod set to 60s to periodically prune expired keys
    this.cache = new NodeCache({
      stdTTL: DEFAULT_TTL_SECONDS,
      checkperiod: 60,
    });
  }

  async get(key: string): Promise<string | null> {
    const val = this.cache.get<string>(key);
    return val ?? null;
  }

  async set(
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
  ): Promise<void> {
    // node-cache expects TTL in seconds
    // Tests treat ttlSeconds === 0 as immediate expiry; don't store in that case.
    if (ttlSeconds <= 0) return;
    this.cache.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    this.cache.del(key);
  }

  async flushall(): Promise<void> {
    this.cache.flushAll();
  }
}

export const redisClient = new NodeCacheClient();
