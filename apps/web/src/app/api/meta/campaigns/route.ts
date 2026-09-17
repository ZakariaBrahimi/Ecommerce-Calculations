import { NextResponse } from 'next/server';
import { metaConfig } from '@/lib/serverless/env';
import { metaGet, metaGetAllPages } from '@/lib/serverless/metaClient';
import { normalizeCampaigns } from '@/lib/serverless/metaNormalize';
import { toErrorResponse } from '@/lib/serverless/providerError';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CAMPAIGN_FIELDS = 'id,name,objective,effective_status,daily_budget,start_time,stop_time';
const AD_ACCOUNT_FIELDS = 'id,name,currency';

interface AdAccountBody {
  currency?: string;
}

/**
 * GET /api/meta/campaigns
 *
 * The account's campaign list with name/objective/status/daily budget -
 * fetched live from Meta's Graph API on every call (no persistence, no
 * sync job). Fetches the campaign list and the ad account's currency (daily
 * budget is minor units and needs it for the dollars/dinars conversion) in
 * parallel with Promise.all, since neither depends on the other.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const config = metaConfig();

    // The campaign list is a paginated collection (`{data: [...]}`); the ad
    // account itself is a single node (a plain object), so it needs a plain
    // metaGet, not metaGetAllPages - fetched in parallel since neither call
    // depends on the other.
    const [campaignRows, adAccount] = await Promise.all([
      metaGetAllPages(`/${config.adAccountId}/campaigns`, { fields: CAMPAIGN_FIELDS }),
      metaGet(`/${config.adAccountId}`, { fields: AD_ACCOUNT_FIELDS }) as Promise<AdAccountBody>,
    ]);

    const currency = adAccount?.currency ?? 'USD';
    const campaigns = normalizeCampaigns(campaignRows, currency);

    return NextResponse.json({
      campaigns,
      active: campaigns.filter((c) => c.status === 'ACTIVE'),
      paused: campaigns.filter((c) => c.status === 'PAUSED'),
      stopped: campaigns.filter((c) => c.status === 'STOPPED'),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
