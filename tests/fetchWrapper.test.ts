/**
 * Tests for the typed fetch wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { typedFetch } from '@/lib/utils/fetchWrapper';
import { MbtaApiError, TimeoutError } from '@/lib/utils/errors';

// Store original fetch
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    ...response,
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('typedFetch', () => {
  it('returns success for a 200 response', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ data: [1, 2, 3] }),
    });
    const result = await typedFetch<{ data: number[] }>('https://example.com/api');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ data: [1, 2, 3] });
      expect(result.status).toBe(200);
    }
  });

  it('returns failure for non-ok response', async () => {
    mockFetch({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({}),
    });
    const result = await typedFetch('https://example.com/fail');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toBeInstanceOf(MbtaApiError);
    }
  });

  it('returns failure on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;
    const result = await typedFetch('https://example.com/down');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(MbtaApiError);
      expect(result.status).toBeNull();
    }
  });

  it('returns failure on abort (timeout)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error('Aborted'), { name: 'AbortError' }),
    ) as unknown as typeof fetch;
    const result = await typedFetch('https://example.com/slow', { timeoutMs: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TimeoutError);
    }
  });

  it('sets Accept header', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: async () => ({}) });
    await typedFetch('https://example.com/headers');
    expect(fn).toHaveBeenCalledTimes(1);
    const callArgs = fn.mock.calls[0][1];
    expect(callArgs.headers).toHaveProperty('Accept', 'application/vnd.api+json');
  });

  it('handles 404 responses', async () => {
    mockFetch({ ok: false, status: 404, statusText: 'Not Found' });
    const result = await typedFetch('https://example.com/404');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it('handles 500 responses', async () => {
    mockFetch({ ok: false, status: 500, statusText: 'Internal Server Error' });
    const result = await typedFetch('https://example.com/500');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });

  it('handles 503 responses', async () => {
    mockFetch({ ok: false, status: 503, statusText: 'Service Unavailable' });
    const result = await typedFetch('https://example.com/503');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it('typed data is accessible when ok', async () => {
    interface TestData {
      routes: { id: string }[];
    }
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ routes: [{ id: 'Red' }] }),
    });
    const result = await typedFetch<TestData>('https://example.com/typed');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.routes[0].id).toBe('Red');
    }
  });
});
