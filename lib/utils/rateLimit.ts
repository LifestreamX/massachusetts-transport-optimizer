/**
 * Rate limiter to prevent API abuse and handle MBTA API rate limits.
 *
 * The MBTA API has rate limits:
 * - Unauthenticated: 20 requests per minute
 * - Authenticated (with API key): 1000 requests per minute
 *
 * This rate limiter:
 * 1. Tracks requests per API key/IP
 * 2. Implements exponential backoff on rate limit errors
 * 3. Queues requests when approaching limits
 */

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

const requestCounts = new Map<string, RateLimitInfo>();
// Track reset timers so tests using fake timers (vi.useFakeTimers) can advance
// time and trigger the expiry logic deterministically.
const resetTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Configure based on whether we have an API key
// MBTA API actual limits: 20/min unauthenticated, 1000/min authenticated
// We set conservative limits with buffer for safety. During tests we relax
// these to avoid long waits caused by simulated rate limiting.
let MAX_REQUESTS_PER_MINUTE = process.env.MBTA_API_KEY ? 850 : 18; // 15% buffer

// Make the window configurable for tests. Default to 60s in production.
let rateLimitWindowMs = process.env.RATE_LIMIT_WINDOW_MS
  ? Number(process.env.RATE_LIMIT_WINDOW_MS)
  : 60 * 1000;

// Make tests fast: shorten window and raise allowance when running under
// the test runner to avoid long sleep periods during integration tests.
if (process.env.NODE_ENV === 'test') {
  // Short window (1s) so any wait is small
  rateLimitWindowMs = process.env.RATE_LIMIT_WINDOW_MS
    ? Number(process.env.RATE_LIMIT_WINDOW_MS)
    : 1000;
  // Use a much smaller allowance in tests so queueing behavior is exercised
  // deterministically (CI/dev machines may have MBTA_API_KEY set which
  // would otherwise allow many requests and make the queue test no-op).
  MAX_REQUESTS_PER_MINUTE = process.env.MBTA_API_KEY ? 5 : 3;
}

// Allow tests to override how "now" is calculated (helps when using fake timers)
let nowFn: () => number = () => Date.now();

/**
 * Test helpers / hooks
 */
export function _test_setRateLimitWindowMs(ms: number) {
  rateLimitWindowMs = ms;
  // Clear any existing state so tests start from a clean slate when they
  // change the window. This avoids cross-test contamination when using
  // fake timers and keeps behavior deterministic.
  for (const t of resetTimers.values()) {
    clearTimeout(t);
  }
  resetTimers.clear();
  requestCounts.clear();
}

export function _test_setNowFunction(fn: () => number) {
  nowFn = fn;
}

export function _test_clearNowFunction() {
  nowFn = () => Date.now();
}

export function _test_getRequestCounts() {
  // Return a shallow copy for inspection
  return Array.from(requestCounts.entries()).map(([k, v]) => ({
    key: k,
    ...v,
  }));
}

/**
 * Check if a request can proceed. If not, wait until the rate limit resets.
 */
export async function checkRateLimit(key: string = 'default'): Promise<void> {
  const now = nowFn();
  const info = requestCounts.get(key);

  if (!info || now > info.resetTime) {
    // Reset or initialize
    // Clear any existing timer
    const existing = resetTimers.get(key);
    if (existing) clearTimeout(existing);

    const resetTime = now + rateLimitWindowMs;
    requestCounts.set(key, {
      count: 1,
      resetTime,
    });

    // Schedule an automatic deletion when the window expires. This allows
    // tests to use fake timers and advance time to trigger reset behavior.
    const timer = setTimeout(() => {
      requestCounts.delete(key);
      resetTimers.delete(key);
    }, rateLimitWindowMs);
    resetTimers.set(key, timer);
    return;
  }

  if (info.count >= MAX_REQUESTS_PER_MINUTE) {
    // Rate limit exceeded - wait until reset
    const waitTime = info.resetTime - now;
    console.warn(
      `[RateLimit] Limit reached for ${key}. Waiting ${waitTime}ms...`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    // Reset after waiting
    // Clear any existing timer
    const existing = resetTimers.get(key);
    if (existing) clearTimeout(existing);

    const resetTime = nowFn() + rateLimitWindowMs;
    requestCounts.set(key, {
      count: 1,
      resetTime,
    });

    const timer = setTimeout(() => {
      requestCounts.delete(key);
      resetTimers.delete(key);
    }, rateLimitWindowMs);
    resetTimers.set(key, timer);
    return;
  }

  // Increment count
  info.count += 1;
}

/**
 * Handle rate limit responses from the MBTA API.
 * Returns the number of milliseconds to wait before retrying.
 */
export function handleRateLimitResponse(headers: Headers): number | null {
  const rateLimitRemaining = headers.get('x-ratelimit-remaining');
  const rateLimitReset = headers.get('x-ratelimit-reset');

  if (rateLimitRemaining === '0' && rateLimitReset) {
    // Parse reset time and calculate wait duration
    const resetTime = parseInt(rateLimitReset, 10) * 1000; // Convert to ms
    const waitTime = Math.max(0, resetTime - nowFn());
    return waitTime;
  }

  // Default backoff for 429 responses without headers
  return 60000; // 1 minute
}

/**
 * Exponential backoff with jitter for retrying failed requests.
 */
export function calculateBackoff(attempt: number): number {
  const baseDelay = 1000; // 1 second
  const maxDelay = 60000; // 60 seconds
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 1000; // Add up to 1 second of jitter
  return exponentialDelay + jitter;
}

/**
 * Clean up old rate limit entries periodically.
 */
export function cleanupRateLimitCache(): void {
  const now = nowFn();
  const entries = Array.from(requestCounts.entries());
  for (const [key, info] of entries) {
    if (now > info.resetTime + rateLimitWindowMs) {
      requestCounts.delete(key);
      const t = resetTimers.get(key);
      if (t) {
        clearTimeout(t);
        resetTimers.delete(key);
      }
    }
  }
}

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitCache, 5 * 60 * 1000);
}
