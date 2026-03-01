/**
 * Tests for the cache service and Redis client.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { redisClient } from '@/lib/cache/redisClient';
import { cacheService } from '@/lib/cache/cacheService';

beforeEach(async () => {
  await redisClient.flushall();
});

/* ------------------------------------------------------------------ */
/*  redisClient                                                        */
/* ------------------------------------------------------------------ */

describe('redisClient', () => {
  it('returns null for a missing key', async () => {
    expect(await redisClient.get('nonexistent')).toBeNull();
  });

  it('sets and gets a value', async () => {
    await redisClient.set('key1', 'value1', 'EX', 60);
    expect(await redisClient.get('key1')).toBe('value1');
  });

  it('respects TTL expiry', async () => {
    // Set with 1-second TTL
    await redisClient.set('expire', 'data', 'EX', 0);
    // With 0 seconds, it should expire immediately
    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 10));
    expect(await redisClient.get('expire')).toBeNull();
  });

  it('deletes a key', async () => {
    await redisClient.set('del-me', 'val', 'EX', 60);
    await redisClient.del('del-me');
    expect(await redisClient.get('del-me')).toBeNull();
  });

  it('flushall clears everything', async () => {
    await redisClient.set('a', '1', 'EX', 60);
    await redisClient.set('b', '2', 'EX', 60);
    await redisClient.flushall();
    expect(await redisClient.get('a')).toBeNull();
    expect(await redisClient.get('b')).toBeNull();
  });

  it('overwrites existing key', async () => {
    await redisClient.set('k', 'old', 'EX', 60);
    await redisClient.set('k', 'new', 'EX', 60);
    expect(await redisClient.get('k')).toBe('new');
  });

  it('handles JSON strings', async () => {
    const obj = { foo: 'bar', num: 42 };
    await redisClient.set('json', JSON.stringify(obj), 'EX', 60);
    const raw = await redisClient.get('json');
    expect(JSON.parse(raw!)).toEqual(obj);
  });

  it('handles empty string values', async () => {
    await redisClient.set('empty', '', 'EX', 60);
    expect(await redisClient.get('empty')).toBe('');
  });

  it('handles very long values', async () => {
    const long = 'x'.repeat(100_000);
    await redisClient.set('long', long, 'EX', 60);
    expect(await redisClient.get('long')).toBe(long);
  });

  it('handles special characters in keys', async () => {
    await redisClient.set('key:with:colons', 'v', 'EX', 60);
    expect(await redisClient.get('key:with:colons')).toBe('v');
  });
});

/* ------------------------------------------------------------------ */
/*  cacheService                                                       */
/* ------------------------------------------------------------------ */

describe('cacheService', () => {
  it('calls fetcher on cache miss', async () => {
    let called = false;
    const result = await cacheService.getOrFetch('miss', async () => {
      called = true;
      return { data: 42 };
    });
    expect(called).toBe(true);
    expect(result).toEqual({ data: 42 });
  });

  it('returns cached value on cache hit', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return 'fresh';
    };
    await cacheService.getOrFetch('hit-test', fetcher);
    const result = await cacheService.getOrFetch('hit-test', fetcher);
    expect(callCount).toBe(1);
    expect(result).toBe('fresh');
  });

  it('caches complex objects', async () => {
    const complex = { routes: [{ name: 'Red' }], timestamp: Date.now() };
    await cacheService.getOrFetch('complex', async () => complex);
    const cached = await cacheService.getOrFetch('complex', async () => ({
      routes: [],
      timestamp: 0,
    }));
    expect(cached).toEqual(complex);
  });

  it('invalidate removes cached entry', async () => {
    let callCount = 0;
    await cacheService.getOrFetch('inv', async () => {
      callCount++;
      return 'first';
    });
    await cacheService.invalidate('inv');
    const result = await cacheService.getOrFetch('inv', async () => {
      callCount++;
      return 'second';
    });
    expect(callCount).toBe(2);
    expect(result).toBe('second');
  });

  it('different keys do not interfere', async () => {
    await cacheService.getOrFetch('a', async () => 'alpha');
    await cacheService.getOrFetch('b', async () => 'beta');
    const a = await cacheService.getOrFetch('a', async () => 'should-not');
    const b = await cacheService.getOrFetch('b', async () => 'should-not');
    expect(a).toBe('alpha');
    expect(b).toBe('beta');
  });

  it('handles arrays', async () => {
    const arr = [1, 2, 3];
    await cacheService.getOrFetch('arr', async () => arr);
    const result = await cacheService.getOrFetch('arr', async () => []);
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles null values from fetcher', async () => {
    await cacheService.getOrFetch('null-val', async () => null);
    let called = false;
    const result = await cacheService.getOrFetch('null-val', async () => {
      called = true;
      return 'fallback';
    });
    // null is valid JSON, should be cached
    expect(called).toBe(false);
    expect(result).toBeNull();
  });

  it('handles boolean values', async () => {
    await cacheService.getOrFetch('bool', async () => false);
    const result = await cacheService.getOrFetch('bool', async () => true);
    expect(result).toBe(false);
  });

  it('handles number values', async () => {
    await cacheService.getOrFetch('num', async () => 0);
    const result = await cacheService.getOrFetch('num', async () => 999);
    expect(result).toBe(0);
  });
});
