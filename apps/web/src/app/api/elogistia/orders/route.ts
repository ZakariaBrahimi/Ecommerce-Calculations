import { NextRequest, NextResponse } from 'next/server';
import { elogistiaGet } from '@/lib/serverless/elogistiaClient';
import { getOrdersPageInfo, normalizeOrderDetailRows } from '@/lib/serverless/elogistiaNormalize';
import { toErrorResponse } from '@/lib/serverless/providerError';

// Live data only, fetched fresh on every dashboard open - no caching, no persistence.
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// Caps how many pages one request pulls, so a growing order history can't
// blow past this route's maxDuration or Elogistia's 100 req/min cap - see
// docs/deployment-vercel-serverless.md.
const MAX_PAGES = 20; // 20 * 100/page = up to 2,000 orders per load

/**
 * GET /api/elogistia/orders
 * GET /api/elogistia/orders?tracking=L-372BNH
 *
 * Without `tracking`: every order, full detail (tracking number, name,
 * status) - not the sparse shape you'd get by omitting `tracking` entirely.
 * Elogistia's getOrders behaves differently depending on the `tracking`
 * param (found empirically, undocumented):
 *   - omitted entirely  -> sparse list (phone/commune only, no tracking/status)
 *   - a real value      -> that one order's full detail
 *   - present but empty -> EVERY order, full detail, paginated at 100/page
 * This route always sends `tracking=''` for a bulk fetch specifically to
 * get the detail shape, fetching all pages (up to MAX_PAGES) in parallel
 * since page numbers are known upfront (unlike Meta's cursor pagination,
 * this doesn't have to be sequential). With `tracking`: a single order.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tracking = req.nextUrl.searchParams.get('tracking')?.trim();

  try {
    if (tracking) {
      const body = await elogistiaGet('/getOrders/', { tracking });
      const orders = normalizeOrderDetailRows(body);
      return NextResponse.json({ orders, count: orders.length });
    }

    const firstPage = await elogistiaGet('/getOrders/', { tracking: '', page: '1' });
    const pageInfo = getOrdersPageInfo(firstPage);
    const totalPages = pageInfo ? Math.min(pageInfo.totalPages, MAX_PAGES) : 1;

    const restPages = await Promise.all(
      Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
        elogistiaGet('/getOrders/', { tracking: '', page: String(i + 2) }),
      ),
    );

    const orders = [firstPage, ...restPages].flatMap((page) => normalizeOrderDetailRows(page));
    return NextResponse.json({ orders, count: orders.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
