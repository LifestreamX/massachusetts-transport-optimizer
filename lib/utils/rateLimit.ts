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

// Configure based on whether we have an API key
// MBTA API actual limits: 20/min unauthenticated, 1000/min authenticated
// We set conservative limits with buffer for safety
const MAX_REQUESTS_PER_MINUTE = process.env.MBTA_API_KEY ? 850 : 18; // 15% buffer
const MINUTE_IN_MS = 60 * 1000;

/**
 * Check if a request can proceed. If not, wait until the rate limit resets.
 */
export async function checkRateLimit(key: string = 'default'): Promise<void> {
  const now = Date.now();
  const info = requestCounts.get(key);

  if (!info || now > info.resetTime) {
    // Reset or initialize
    requestCounts.set(key, {
      count: 1,
      resetTime: now + MINUTE_IN_MS,
    });
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
    requestCounts.set(key, {
      count: 1,
      resetTime: Date.now() + MINUTE_IN_MS,
    });
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
    const waitTime = Math.max(0, resetTime - Date.now());
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
  const now = Date.now();
  const entries = Array.from(requestCounts.entries());
  for (const [key, info] of entries) {
    if (now > info.resetTime + MINUTE_IN_MS) {
      requestCounts.delete(key);
    }
  }
}

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitCache, 5 * 60 * 1000);
}
