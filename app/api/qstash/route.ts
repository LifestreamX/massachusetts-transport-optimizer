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

    // Prefer Upstash/QStash signing keys. Support rotation using
    // QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.
    const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

    const sigHeader =
      request.headers.get('upstash-signature') ||
      request.headers.get('qstash-signature') ||
      request.headers.get('x-qstash-signature') ||
      request.headers.get('x-upstash-signature');

    if (currentKey || nextKey) {
      if (!sigHeader) return badAuth('Missing QStash signature header');

      // Normalize signature: strip common prefixes
      const rawSig = sigHeader.replace(/^sha256=/i, '').replace(/^0x/, '');

      // Helper to compute expected hex signature for a key
      const expectedHex = (key: string) =>
        crypto.createHmac('sha256', key).update(rawBody).digest('hex');

      const expectedCurrent = currentKey ? expectedHex(currentKey) : null;
      const expectedNext = nextKey ? expectedHex(nextKey) : null;

      // Try compare against current and next expected signatures
      const tryCompare = (expectedHexStr: string | null) => {
        if (!expectedHexStr) return false;
        try {
          const sigBuf = Buffer.from(rawSig, 'hex');
          const expBuf = Buffer.from(expectedHexStr, 'hex');
          if (sigBuf.length !== expBuf.length) return false;
          return crypto.timingSafeEqual(sigBuf, expBuf);
        } catch {
          // not a hex string or comparison failed
          return false;
        }
      };

      const ok = tryCompare(expectedCurrent) || tryCompare(expectedNext);
      if (!ok) return badAuth('Invalid QStash signature');
    } else {
      console.warn(
        '[qstash] No QSTASH_CURRENT_SIGNING_KEY set - endpoint unprotected',
      );
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
