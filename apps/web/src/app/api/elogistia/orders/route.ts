import { NextRequest, NextResponse } from 'next/server';
import { elogistiaGet } from '@/lib/serverless/elogistiaClient';
import { normalizeOrders } from '@/lib/serverless/elogistiaNormalize';
import { toErrorResponse } from '@/lib/serverless/providerError';

// Live data only, fetched fresh on every dashboard open - no caching, no persistence.
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/elogistia/orders
 * GET /api/elogistia/orders?tracking=L-372BNH
 *
 * Without `tracking`: the full, unpaginated order list (Elogistia has no
 * pagination on this endpoint - treat as a backfill/reconciliation read,
 * not a tight polling loop). With `tracking`: a single order's details.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tracking = req.nextUrl.searchParams.get('tracking')?.trim() || undefined;

  try {
    const body = await elogistiaGet('/getOrders/', { tracking });
    const orders = normalizeOrders(body, Boolean(tracking));
    return NextResponse.json({ orders, count: orders.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
