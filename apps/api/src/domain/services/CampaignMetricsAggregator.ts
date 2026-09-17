import { Campaign } from '../entities/Campaign';
import { DailySpend } from '../entities/DailySpend';

export interface CampaignDashboardRow {
  campaignId: string;
  externalCampaignId: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  spentAmount: number;
  impressions: number;
  clicks: number;
  /** clicks / impressions * 100, null when there have been no impressions yet. */
  ctrPct: number | null;
  /** spentAmount / clicks, null when there have been no clicks yet. */
  cpc: number | null;
  resultsCount: number;
  costPerResult: number | null;
  /** Purchases, unconditionally (see extractPurchases) - distinct from resultsCount, which is objective-relative. */
  purchases: number;
  /** Meta-attributed purchase revenue, same currency as spentAmount. */
  purchaseValue: number;
  /** purchaseValue / spentAmount, null when there has been no spend yet. */
  roas: number | null;
  startDate: Date | null;
  endDate: Date | null;
  currency: string | null;
}

/**
 * Rolls a campaign's full DailySpend history up into the fields the
 * dashboard asks for. Pure function, no I/O - the exact shape callers
 * (GetCampaignDashboardUseCase) need to render "Active/Paused/Stopped"
 * campaign cards.
 */
export function aggregateCampaignForDashboard(campaign: Campaign, dailySpends: DailySpend[]): CampaignDashboardRow {
  const p = campaign.toPrimitives();

  const spentAmount = round2(dailySpends.reduce((sum, d) => sum + d.toPrimitives().spend, 0));
  const impressions = dailySpends.reduce((sum, d) => sum + d.toPrimitives().impressions, 0);
  const clicks = dailySpends.reduce((sum, d) => sum + d.toPrimitives().clicks, 0);
  const resultsCount = dailySpends.reduce((sum, d) => sum + d.toPrimitives().results, 0);
  const purchases = dailySpends.reduce((sum, d) => sum + d.toPrimitives().purchases, 0);
  const purchaseValue = round2(dailySpends.reduce((sum, d) => sum + d.toPrimitives().purchaseValue, 0));
  const costPerResult = resultsCount > 0 ? round2(spentAmount / resultsCount) : null;
  const ctrPct = impressions > 0 ? round2((clicks / impressions) * 100) : null;
  const cpc = clicks > 0 ? round2(spentAmount / clicks) : null;
  const roas = spentAmount > 0 ? round2(purchaseValue / spentAmount) : null;
  const currency = p.currency ?? dailySpends[0]?.toPrimitives().currency ?? null;

  return {
    campaignId: p.id,
    externalCampaignId: p.externalCampaignId,
    name: p.name,
    status: p.status,
    dailyBudget: p.dailyBudget,
    spentAmount,
    impressions,
    clicks,
    ctrPct,
    cpc,
    resultsCount,
    costPerResult,
    purchases,
    purchaseValue,
    roas,
    startDate: p.startDate,
    endDate: p.endDate,
    currency,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
