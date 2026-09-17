import { NextResponse } from 'next/server';
import { fetchAllElogistiaOrderPages } from '@/lib/serverless/elogistiaClient';
import { summarizeOrdersByProduct } from '@/lib/serverless/elogistiaNormalize';
import { toErrorResponse } from '@/lib/serverless/providerError';

// Live data only, fetched fresh on every dashboard open - no caching, no persistence.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/elogistia/product-summary
 *
 * Per-product delivery-outcome counts (delivered/returned/in-transit/etc.),
 * derived from every order across every page - not the raw order list.
 * Shipping ~1,400 raw order rows to the browser on every dashboard open was
 * the thing worth avoiding; the actual UI only ever needed these counts, so
 * the aggregation happens here instead. Fetching every page is still
 * required server-side (same cost as /api/elogistia/orders) - what changes
 * is the response size, not the number of upstream calls.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const pages = await fetchAllElogistiaOrderPages();
    const products = summarizeOrdersByProduct(pages);
    return NextResponse.json({ products });
  } catch (err) {
    return toErrorResponse(err);
  }
}
