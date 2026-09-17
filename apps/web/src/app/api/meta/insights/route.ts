import { NextRequest, NextResponse } from 'next/server';
import { metaConfig } from '@/lib/serverless/env';
import { metaGetAllPages } from '@/lib/serverless/metaClient';
import { normalizeInsights } from '@/lib/serverless/metaNormalize';
import { toErrorResponse } from '@/lib/serverless/providerError';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const INSIGHT_FIELDS = 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,account_currency';
const VALID_PRESETS = new Set([
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_90d',
  'this_month',
  'maximum',
]);

/**
 * GET /api/meta/insights
 * GET /api/meta/insights?datePreset=last_7d
 *
 * Per-campaign spend/impressions/clicks/purchases with derived CTR, CPC and
 * ROAS - asks Meta to aggregate over the whole window itself (level=campaign,
 * no time_increment) rather than pulling a day-by-day breakdown and summing
 * it locally, since there's nowhere to persist that breakdown between calls
 * anyway. Re-fetched and recomputed from scratch on every call.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestedPreset = req.nextUrl.searchParams.get('datePreset')?.trim();
  // Default to Meta's full account lifetime, not a 30-day window - product
  // performance links a campaign's *entire* spend to a product (see
  // /api/elogistia/product-summary), so a campaign that ran outside the last
  // 30 days would otherwise show 0 spend and silently understate cost.
  const datePreset = requestedPreset && VALID_PRESETS.has(requestedPreset) ? requestedPreset : 'maximum';

  try {
    const config = metaConfig();
    const rows = await metaGetAllPages(`/${config.adAccountId}/insights`, {
      level: 'campaign',
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
    });

    return NextResponse.json({ datePreset, ...normalizeInsights(rows) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
