import { Campaign } from '../entities/Campaign';
import { DailySpend } from '../entities/DailySpend';

export interface CampaignDashboardRow {
  campaignId: string;
  externalCampaignId: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  spentAmount: number;
  resultsCount: number;
  costPerResult: number | null;
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
  const resultsCount = dailySpends.reduce((sum, d) => sum + d.toPrimitives().results, 0);
  const costPerResult = resultsCount > 0 ? round2(spentAmount / resultsCount) : null;
  const currency = p.currency ?? dailySpends[0]?.toPrimitives().currency ?? null;

  return {
    campaignId: p.id,
    externalCampaignId: p.externalCampaignId,
    name: p.name,
    status: p.status,
    dailyBudget: p.dailyBudget,
    spentAmount,
    resultsCount,
    costPerResult,
    startDate: p.startDate,
    endDate: p.endDate,
    currency,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
