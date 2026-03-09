/**
 * POST /api/optimize-route
 *
 * Accepts { origin, destination } and returns ranked transit options.
 * All business logic lives in the decision engine – this handler only
 * validates input, delegates, and maps errors to HTTP status codes.
 */

import { NextResponse } from 'next/server';
import { optimizeRoute } from '@/lib/decisionEngine/optimizeRoute';
import { AppError, BadRequestError, toError } from '@/lib/utils/errors';
import type {
  OptimizeRouteRequest,
  ApiErrorResponse,
} from '@/types/routeTypes';

function jsonError(
  message: string,
  statusCode: number,
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error: message, statusCode },
    { status: statusCode },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // --- Input validation ---------------------------------------------------
    let body: OptimizeRouteRequest;
    try {
      body = (await request.json()) as OptimizeRouteRequest;
    } catch {
      throw new BadRequestError('Request body must be valid JSON');
    }

    const { origin, destination } = body;

    const MAX_INPUT_LENGTH = 512; // defensive cap to avoid extremely large payloads

    if (!origin || typeof origin !== 'string' || origin.trim().length === 0) {
      throw new BadRequestError(
        'origin is required and must be a non-empty string',
      );
    }
    if (
      !destination ||
      typeof destination !== 'string' ||
      destination.trim().length === 0
    ) {
      throw new BadRequestError(
        'destination is required and must be a non-empty string',
      );
    }

    // --- Delegate to decision engine ----------------------------------------
    // Accept optional preference from the client and validate it
    const rawPref = (body as any).preference as string | undefined;
    const ALLOWED = [
      'fastest',
      'least-transfers',
      'most-reliable',
      'accessible',
    ] as const;
    let preference: (typeof ALLOWED)[number] | undefined = undefined;
    if (rawPref !== undefined) {
      if (typeof rawPref !== 'string' || !ALLOWED.includes(rawPref as any)) {
        throw new BadRequestError(
          'preference, if provided, must be one of: ' + ALLOWED.join(', '),
        );
      }
      preference = rawPref as (typeof ALLOWED)[number];
    }

    // Trim and defensively cap input sizes to keep processing deterministic
    const originClean = origin.trim().slice(0, MAX_INPUT_LENGTH);
    const destinationClean = destination.trim().slice(0, MAX_INPUT_LENGTH);

    const transitMode = (body as any).transitMode as string | undefined;
    const result = await optimizeRoute(
      originClean,
      destinationClean,
      preference,
      transitMode,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (caught: unknown) {
    const err = toError(caught);

    if (err instanceof AppError) {
      return jsonError(err.message, err.statusCode);
    }

    // Unexpected error → 500
    console.error('[optimize-route] Unhandled error:', err);
    return jsonError('Internal server error', 500);
  }
}

/**
 * GET handler returns 405 Method Not Allowed with a helpful message.
 */
export async function GET(): Promise<NextResponse> {
  return jsonError('Use POST with { origin, destination } body', 405);
}
