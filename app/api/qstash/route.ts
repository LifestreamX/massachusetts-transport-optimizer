/**
 * POST /api/qstash
 *
 * Receiver endpoint for QStash scheduled webhooks.
 * - If `QSTASH_SIGNING_KEY` is set, this will verify an HMAC-SHA256 signature
 *   sent in the `qstash-signature` (or common variants) header.
 * - If `QSTASH_SIGNING_KEY` is not set but `CRON_SECRET` is set, it will accept
 *   `Authorization: Bearer <CRON_SECRET>` (this allows reusing the existing
 *   cron secret flow).
 * - If neither is set the endpoint will accept requests but log a warning.
 */

import { NextResponse } from 'next/server';
import { prefetchPriorityStations } from '@/lib/cache/prefetchService';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // seconds

function badAuth(msg = 'Unauthorized') {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rawBody = await request.text();

    const signingKey = process.env.QSTASH_SIGNING_KEY;
    const cronSecret = process.env.CRON_SECRET;

    // Check QStash HMAC signature (if provided)
    if (signingKey) {
      const sigHeader =
        request.headers.get('qstash-signature') ||
        request.headers.get('x-qstash-signature') ||
        request.headers.get('qstash-signature-256') ||
        request.headers.get('x-upstash-signature');

      if (!sigHeader) return badAuth('Missing QStash signature header');

      const expected = crypto
        .createHmac('sha256', signingKey)
        .update(rawBody)
        .digest('hex');

      // timingSafeEqual requires equal length buffers
      const sigBuf = Buffer.from(sigHeader.replace(/^0x/, ''), 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length) return badAuth('Invalid signature');
      if (!crypto.timingSafeEqual(sigBuf, expBuf)) return badAuth('Invalid signature');

      // passed signature check
    } else if (cronSecret) {
      // fallback to existing CRON_SECRET auth using Authorization header
      const auth = request.headers.get('authorization');
      if (auth !== `Bearer ${cronSecret}`) return badAuth('Invalid CRON secret');
    } else {
      console.warn('[qstash] No QSTASH_SIGNING_KEY or CRON_SECRET set - endpoint unprotected');
    }

    console.log('[qstash] Received scheduled trigger - running prefetch...');
    const start = Date.now();
    const summary = await prefetchPriorityStations();
    const duration = Date.now() - start;

    return NextResponse.json({
      success: true,
      summary,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[qstash] Error handling request', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
