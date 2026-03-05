/**
 * GET /api/cron/prefetch-stations
 *
 * Background job endpoint to prefetch and cache all MBTA station data.
 * This endpoint is triggered by Vercel Cron every 5 minutes.
 *
 * Security: Uses Vercel Cron Secret or Authorization header for authentication.
 */

import { NextResponse } from 'next/server';
import { prefetchPriorityStations } from '@/lib/cache/prefetchService';

export const maxDuration = 300; // 5 minutes max execution time
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    // Verify authorization (Vercel Cron sends a secret header)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is set, verify it matches
    if (cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        console.error('[cron] Unauthorized prefetch attempt');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      // In development, allow without auth but log warning
      console.warn(
        '[cron] CRON_SECRET not set - prefetch endpoint is unprotected',
      );
    }

    console.log('[cron] Starting scheduled prefetch job...');
    const startTime = Date.now();

    // Prefetch priority stations (most-used stations)
    const summary = await prefetchPriorityStations();

    const duration = Date.now() - startTime;

    console.log(
      `[cron] Prefetch job completed in ${duration}ms: ${summary.successCount}/${summary.totalStations} stations cached`,
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalStations: summary.totalStations,
        successCount: summary.successCount,
        failureCount: summary.failureCount,
        cachedCount: summary.cachedCount,
        duration,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron] Prefetch job failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// Allow manual trigger via POST for testing
export async function POST(request: Request): Promise<NextResponse> {
  return GET(request);
}
