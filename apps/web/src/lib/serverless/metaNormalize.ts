/**
 * Raw-shape parsing, status/currency normalization and derived-metric
 * calculation for Meta's Marketing API, reimplemented standalone for the
 * stateless serverless integration (mirrors apps/api's
 * MetaResponseParser/MetaCampaignStatusMapper/MetaResultsExtractor/currency.ts).
 * No persistence here - CTR/CPC/ROAS are computed fresh from whatever Meta
 * returns for the requested window, not accumulated across calls.
 */

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'PYG', 'UGX']);

/** daily_budget/lifetime_budget are minor units (e.g. cents); Insights fields like spend are not - see apps/api/currency.ts. */
export function minorUnitsToAmount(minorUnits: number, currency: string | null): number {
  const divisor = currency && ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100;
  return minorUnits / divisor;
}

export type NormalizedCampaignStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'UNKNOWN';

const CAMPAIGN_STATUS_MAP: ReadonlyMap<string, NormalizedCampaignStatus> = new Map([
  ['ACTIVE', 'ACTIVE'],
  ['PREAPPROVED', 'ACTIVE'],

  ['PAUSED', 'PAUSED'],
  ['CAMPAIGN_PAUSED', 'PAUSED'],
  ['ADSET_PAUSED', 'PAUSED'],
  ['IN_PROCESS', 'PAUSED'],
  ['WITH_ISSUES', 'PAUSED'],
  ['PENDING_REVIEW', 'PAUSED'],
  ['PENDING_BILLING_INFO', 'PAUSED'],

  ['DELETED', 'STOPPED'],
  ['ARCHIVED', 'STOPPED'],
  ['DISAPPROVED', 'STOPPED'],
]);

/** Unlike the DB-backed mapper, an unrecognized effective_status resolves to 'UNKNOWN' rather than throwing - a single unfamiliar value from Meta should never 500 the whole live dashboard. */
export function mapCampaignStatus(rawStatus: string): NormalizedCampaignStatus {
  return CAMPAIGN_STATUS_MAP.get(rawStatus.trim().toUpperCase()) ?? 'UNKNOWN';
}

export interface NormalizedCampaign {
  externalCampaignId: string;
  name: string;
  objective: string | null;
  status: NormalizedCampaignStatus;
  rawStatus: string;
  dailyBudget: number | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
}

interface GraphCampaignRow {
  id?: string;
  name?: string;
  objective?: string;
  effective_status?: string;
  daily_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export function normalizeCampaigns(rows: unknown[], currency: string): NormalizedCampaign[] {
  return (rows as GraphCampaignRow[])
    .filter((row): row is Required<Pick<GraphCampaignRow, 'id' | 'name' | 'effective_status'>> & GraphCampaignRow =>
      Boolean(row.id && row.name && row.effective_status),
    )
    .map((row) => ({
      externalCampaignId: row.id,
      name: row.name,
      objective: row.objective ?? null,
      status: mapCampaignStatus(row.effective_status),
      rawStatus: row.effective_status,
      dailyBudget: row.daily_budget ? minorUnitsToAmount(Number(row.daily_budget), currency) : null,
      currency,
      startDate: row.start_time ?? null,
      endDate: row.stop_time ?? null,
    }));
}

/** The action_type priority list for a completed purchase (see apps/api's MetaResultsExtractor for the same list). */
const PURCHASE_ACTION_TYPES: readonly string[] = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'];

interface GraphActionRow {
  action_type?: string;
  value?: string;
}

interface GraphInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  account_currency?: string;
  actions?: GraphActionRow[];
  action_values?: GraphActionRow[];
}

export interface NormalizedInsight {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctrPct: number | null;
  cpc: number | null;
  purchases: number;
  purchaseValue: number;
  roas: number | null;
  currency: string | null;
}

export interface NormalizedInsightsResponse {
  rows: NormalizedInsight[];
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    ctrPct: number | null;
    cpc: number | null;
    purchases: number;
    purchaseValue: number;
    roas: number | null;
    currency: string | null;
  };
}

export function normalizeInsights(rows: unknown[]): NormalizedInsightsResponse {
  const parsed = (rows as GraphInsightRow[])
    .filter((row): row is Required<Pick<GraphInsightRow, 'campaign_id'>> & GraphInsightRow => Boolean(row.campaign_id))
    .map((row) => {
      const spend = row.spend ? Number(row.spend) : 0;
      const impressions = row.impressions ? Number(row.impressions) : 0;
      const clicks = row.clicks ? Number(row.clicks) : 0;
      const { purchases, purchaseValue } = extractPurchases(row.actions ?? [], row.action_values ?? []);

      const insight: NormalizedInsight = {
        campaignId: row.campaign_id,
        campaignName: row.campaign_name ?? row.campaign_id,
        spend: round2(spend),
        impressions,
        clicks,
        ctrPct: impressions > 0 ? round2((clicks / impressions) * 100) : null,
        cpc: clicks > 0 ? round2(spend / clicks) : null,
        purchases,
        purchaseValue: round2(purchaseValue),
        roas: spend > 0 ? round2(purchaseValue / spend) : null,
        currency: row.account_currency ?? null,
      };
      return insight;
    });

  const totalSpend = round2(parsed.reduce((sum, r) => sum + r.spend, 0));
  const totalImpressions = parsed.reduce((sum, r) => sum + r.impressions, 0);
  const totalClicks = parsed.reduce((sum, r) => sum + r.clicks, 0);
  const totalPurchases = parsed.reduce((sum, r) => sum + r.purchases, 0);
  const totalPurchaseValue = round2(parsed.reduce((sum, r) => sum + r.purchaseValue, 0));

  return {
    rows: parsed,
    totals: {
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctrPct: totalImpressions > 0 ? round2((totalClicks / totalImpressions) * 100) : null,
      cpc: totalClicks > 0 ? round2(totalSpend / totalClicks) : null,
      purchases: totalPurchases,
      purchaseValue: totalPurchaseValue,
      roas: totalSpend > 0 ? round2(totalPurchaseValue / totalSpend) : null,
      currency: parsed[0]?.currency ?? null,
    },
  };
}

function extractPurchases(
  actions: GraphActionRow[],
  actionValues: GraphActionRow[],
): { purchases: number; purchaseValue: number } {
  for (const actionType of PURCHASE_ACTION_TYPES) {
    const action = actions.find((a) => a.action_type === actionType);
    if (action) {
      const value = actionValues.find((a) => a.action_type === actionType);
      return { purchases: Number(action.value ?? 0), purchaseValue: value ? Number(value.value ?? 0) : 0 };
    }
  }
  return { purchases: 0, purchaseValue: 0 };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
