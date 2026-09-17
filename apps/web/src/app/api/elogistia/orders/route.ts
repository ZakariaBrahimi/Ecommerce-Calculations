import { NextRequest, NextResponse } from 'next/server';
import { elogistiaGet, fetchAllElogistiaOrderPages } from '@/lib/serverless/elogistiaClient';
import { normalizeOrderDetailRows } from '@/lib/serverless/elogistiaNormalize';
import { toErrorResponse } from '@/lib/serverless/providerError';

// Live data only, fetched fresh on every dashboard open - no caching, no persistence.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/elogistia/orders
 * GET /api/elogistia/orders?tracking=L-372BNH
 *
 * Manual/diagnostic use (curl, a future single-order feature) - the /live
 * dashboard itself no longer calls the bulk (no `tracking`) path; it uses
 * /api/elogistia/product-summary instead, which aggregates this same data
 * server-side rather than shipping every raw order to the browser. With
 * `tracking`: a single order's full detail.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tracking = req.nextUrl.searchParams.get('tracking')?.trim();

  try {
    if (tracking) {
      const body = await elogistiaGet('/getOrders/', { tracking });
      const orders = normalizeOrderDetailRows(body);
      return NextResponse.json({ orders, count: orders.length });
    }

    const pages = await fetchAllElogistiaOrderPages();
    const orders = pages.flatMap((page) => normalizeOrderDetailRows(page));
    return NextResponse.json({ orders, count: orders.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
