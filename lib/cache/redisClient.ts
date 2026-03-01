/**
 * Lightweight Redis client wrapper.
 *
 * In this MVP we use an **in-memory** cache that mirrors the Redis
 * get/set/del interface so the application code stays the same when a
 * real Redis instance is swapped in later.
 *
 * Drop-in replacement: swap this file for `ioredis` or `@upstash/redis`.
 */

interface CacheEntry {
  value: string;
  expiresAt: number;
}

class InMemoryRedis {
  private store = new Map<string, CacheEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
  ): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1_000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Flush all keys – useful for tests. */
  async flushall(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Singleton redis client.
 * In production, replace with `new Redis(process.env.REDIS_URL)` from ioredis.
 */
export const redisClient = new InMemoryRedis();
