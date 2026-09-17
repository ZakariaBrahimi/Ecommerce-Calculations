import { NextRequest, NextResponse } from 'next/server';
import { elogistiaGet } from '@/lib/serverless/elogistiaClient';
import { normalizeManyTracking, NormalizedStatus } from '@/lib/serverless/elogistiaNormalize';
import { ProviderApiError, toErrorResponse } from '@/lib/serverless/providerError';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const BATCH_SIZE = 50; // Elogistia's own recommended batching unit for getManyTracking - see docs/integrations/elogistia-api.md §3.3
const MAX_TRACKING_NUMBERS = 500; // caps how many upstream batches one request can fan out into

/**
 * GET /api/elogistia/statuses?trackingNumbers=L-372BNH,L-295LAI,...
 *
 * Bulk current-status lookup via getManyTracking - the endpoint to use for
 * routine polling instead of re-pulling the full order list (whose list
 * shape doesn't carry a usable text status at all, see
 * elogistiaNormalize.ts). Batches of BATCH_SIZE are fetched in parallel
 * with Promise.all rather than one call per tracking number.
 *
 * No rate limiter here (no persistence => no shared bucket across
 * invocations) - Elogistia's documented cap is 100 req/min per API key, so
 * a single dashboard load with a handful of batches stays well under it;
 * a high-volume production deployment would need a distributed limiter
 * (e.g. Upstash Redis) shared across function instances.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('trackingNumbers')?.trim();
  if (!raw) {
    return toErrorResponse(new ProviderApiError('bad_request', 'trackingNumbers query parameter is required'));
  }

  const trackingNumbers = [...new Set(raw.split(',').map((t) => t.trim()).filter(Boolean))];
  if (trackingNumbers.length === 0) {
    return NextResponse.json({ statuses: [], count: 0 });
  }
  if (trackingNumbers.length > MAX_TRACKING_NUMBERS) {
    return toErrorResponse(
      new ProviderApiError('bad_request', `At most ${MAX_TRACKING_NUMBERS} tracking numbers per request`),
    );
  }

  const batches: string[][] = [];
  for (let i = 0; i < trackingNumbers.length; i += BATCH_SIZE) {
    batches.push(trackingNumbers.slice(i, i + BATCH_SIZE));
  }

  try {
    const results = await Promise.all(
      batches.map((batch) => elogistiaGet('/getManyTracking/', { tracking: batch.join(',') })),
    );
    const statuses: NormalizedStatus[] = results.flatMap((body) => normalizeManyTracking(body));
    return NextResponse.json({ statuses, count: statuses.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
