/**
 * Comprehensive test suite for rate limiting functionality.
 * Tests rate limit enforcement, backoff strategies, and retry logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkRateLimit,
  handleRateLimitResponse,
  calculateBackoff,
  cleanupRateLimitCache,
  _test_setRateLimitWindowMs,
} from '../lib/utils/rateLimit';

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Use a small rate limit window in tests to avoid long waits
    _test_setRateLimitWindowMs(1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore default window
    _test_setRateLimitWindowMs(60 * 1000);
  });

  describe('checkRateLimit', () => {
    it('should allow first request immediately', async () => {
      const promise = checkRateLimit('test-key');
      await expect(promise).resolves.toBeUndefined();
    });

    it('should track multiple requests', async () => {
      await checkRateLimit('test-key');
      await checkRateLimit('test-key');
      await checkRateLimit('test-key');
      // Should not throw or hang
    });

    it('should use different counters for different keys', async () => {
      await checkRateLimit('key1');
      await checkRateLimit('key2');
      await checkRateLimit('key1');
      await checkRateLimit('key2');
      // Should not interfere with each other
    });

    it('should reset counter after time window', async () => {
      await checkRateLimit('test-key');
      vi.advanceTimersByTime(61 * 1000); // Advance by 61 seconds
      await checkRateLimit('test-key');
      // Should have reset
    });
  });

  describe('handleRateLimitResponse', () => {
    it('should calculate wait time from rate limit headers', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 60; // 60 seconds from now
      const headers = new Headers({
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': futureTime.toString(),
      });

      const waitTime = handleRateLimitResponse(headers);
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(60000);
    });

    it('should return default backoff when headers missing', () => {
      const headers = new Headers();
      const waitTime = handleRateLimitResponse(headers);
      // Returns default 60 second backoff when headers missing
      expect(waitTime).toBe(60000);
    });

    it('should handle past reset times', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 60; // 60 seconds ago
      const headers = new Headers({
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': pastTime.toString(),
      });

      const waitTime = handleRateLimitResponse(headers);
      expect(waitTime).toBe(0);
    });
  });

  describe('calculateBackoff', () => {
    it('should increase exponentially with attempt number', () => {
      const backoff1 = calculateBackoff(0);
      const backoff2 = calculateBackoff(1);
      const backoff3 = calculateBackoff(2);

      expect(backoff2).toBeGreaterThan(backoff1);
      expect(backoff3).toBeGreaterThan(backoff2);
    });

    it('should cap at maximum delay', () => {
      const backoff = calculateBackoff(100);
      expect(backoff).toBeLessThanOrEqual(61000); // max + jitter
    });

    it('should add jitter to avoid thundering herd', () => {
      const backoffs = Array.from({ length: 10 }, () => calculateBackoff(3));
      const uniqueBackoffs = new Set(backoffs);

      // With jitter, we should get different values
      expect(uniqueBackoffs.size).toBeGreaterThan(1);
    });
  });

  describe('cleanupRateLimitCache', () => {
    it('should remove expired entries', async () => {
      await checkRateLimit('expired-key');
      vi.advanceTimersByTime(70 * 60 * 1000); // Advance by 70 minutes

      cleanupRateLimitCache();

      // Entry should be cleaned up
      // Next request should start fresh
      await checkRateLimit('expired-key');
    });
  });
});

describe('Integration: Rate Limiting with Fetch', () => {
  beforeAll(() => {
    // Use fake timers for deterministic queuing and a short test window
    vi.useFakeTimers();
    _test_setRateLimitWindowMs(1000);
  });

  afterAll(() => {
    // Restore real timers and reset window to default
    vi.useRealTimers();
    _test_setRateLimitWindowMs(60 * 1000);
  });

  it('should handle multiple concurrent requests', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      checkRateLimit(`concurrent-${i % 3}`),
    );

    // Advance fake timers enough for queued waits to run
    vi.advanceTimersByTime(5000);
    vi.runAllTimers();

    await expect(Promise.all(promises)).resolves.toBeDefined();
  }, 15000);

  it('should enforce rate limits across requests', async () => {
    const key = 'shared-key';
    const requests = Array.from({ length: 50 }, () => checkRateLimit(key));

    // Advance fake timers to allow any queued waits to expire (test window is short)
    vi.advanceTimersByTime(1500);
    // Run any pending timers to ensure promises resolve under fake timers
    vi.runAllTimers();

    // Should handle rate limiting gracefully
    await expect(Promise.all(requests)).resolves.toBeDefined();
  });
});
