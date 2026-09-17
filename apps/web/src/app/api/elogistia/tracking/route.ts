import { NextRequest, NextResponse } from 'next/server';
import { elogistiaGet } from '@/lib/serverless/elogistiaClient';
import { normalizeSingleTracking } from '@/lib/serverless/elogistiaNormalize';
import { ProviderApiError, toErrorResponse } from '@/lib/serverless/providerError';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/elogistia/tracking?trackingNumber=L-372BNH
 *
 * Full status history/log for one shipment (getTracking) - every event,
 * oldest first, not just the latest status (that's /api/elogistia/statuses,
 * which is what routine polling should use instead).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const trackingNumber = req.nextUrl.searchParams.get('trackingNumber')?.trim();
  if (!trackingNumber) {
    return toErrorResponse(new ProviderApiError('bad_request', 'trackingNumber query parameter is required'));
  }

  try {
    const body = await elogistiaGet('/getTracking/', { tracking: trackingNumber });
    return NextResponse.json(normalizeSingleTracking(body, trackingNumber));
  } catch (err) {
    return toErrorResponse(err);
  }
}
