/**
 * Typed fetch wrapper for all external HTTP calls.
 * Returns discriminated-union results so callers never swallow errors.
 * Includes rate limiting and automatic retry with exponential backoff.
 */

import { MbtaApiError, TimeoutError, toError } from './errors';
import {
  checkRateLimit,
  handleRateLimitResponse,
  calculateBackoff,
} from './rateLimit';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FetchSuccess<T> {
  ok: true;
  data: T;
  status: number;
}

export interface FetchFailure {
  ok: false;
  error: Error;
  status: number | null;
}

export type FetchResult<T> = FetchSuccess<T> | FetchFailure;

export interface FetchOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in milliseconds (default 8 000) */
  timeoutMs?: number;
  /** Maximum number of retry attempts (default 3) */
  maxRetries?: number;
  /** Whether to use rate limiting (default true) */
  useRateLimit?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Implementation                                                     */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 8_000;
// Reduce retries during tests to avoid long backoff delays that can time out tests.
const DEFAULT_MAX_RETRIES = process.env.NODE_ENV === 'test' ? 0 : 3;

/**
 * Perform a typed fetch request with automatic timeout, rate limiting,
 * and retry with exponential backoff.
 *
 * @param url    Absolute URL to fetch
 * @param opts   Standard RequestInit + `timeoutMs`, `maxRetries`, `useRateLimit`
 * @returns      Discriminated union – check `result.ok` before accessing data
 */
export async function typedFetch<T>(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult<T>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    useRateLimit = true, // Enabled rate limiting to respect MBTA API limits
    ...init
  } = opts;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Check rate limit before making request
      if (useRateLimit) {
        await checkRateLimit('mbta-api');
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            Accept: 'application/vnd.api+json',
            ...init.headers,
          },
        });

        // Handle rate limit responses
        if (response.status === 429) {
          const waitTime = handleRateLimitResponse(response.headers);
          if (waitTime && attempt < maxRetries) {
            console.warn(
              `[Fetch] Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            continue;
          }
        }

        if (!response.ok) {
          // Retry on 5xx errors
          if (response.status >= 500 && attempt < maxRetries) {
            const backoff = calculateBackoff(attempt);
            console.warn(
              `[Fetch] HTTP ${response.status}. Retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }

          return {
            ok: false,
            error: new MbtaApiError(
              `HTTP ${response.status}: ${response.statusText}`,
            ),
            status: response.status,
          };
        }

        const data = (await response.json()) as T;
        return { ok: true, data, status: response.status };
      } finally {
        clearTimeout(timer);
      }
    } catch (caught: unknown) {
      const err = toError(caught);
      lastError = err;

      if (err.name === 'AbortError') {
        if (attempt < maxRetries) {
          const backoff = calculateBackoff(attempt);
          console.warn(
            `[Fetch] Timeout. Retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        return {
          ok: false,
          error: new TimeoutError(
            `Request to ${url} timed out after ${timeoutMs}ms`,
          ),
          status: null,
        };
      }

      // Retry on network errors
      if (attempt < maxRetries) {
        const backoff = calculateBackoff(attempt);
        console.warn(
          `[Fetch] Network error: ${err.message}. Retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
    }
  }

  // All retries exhausted
  return {
    ok: false,
    error: new MbtaApiError(
      lastError?.message ?? 'Request failed after all retries',
    ),
    status: null,
  };
}
