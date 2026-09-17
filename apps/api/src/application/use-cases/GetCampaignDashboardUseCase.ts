import { CampaignRepository } from '../../domain/ports/CampaignRepository';
import { DailySpendRepository } from '../../domain/ports/DailySpendRepository';
import { CampaignStatus } from '../../domain/enums/CampaignStatus';
import { aggregateCampaignForDashboard, CampaignDashboardRow } from '../../domain/services/CampaignMetricsAggregator';

export interface CampaignDashboard {
  active: CampaignDashboardRow[];
  paused: CampaignDashboardRow[];
  stopped: CampaignDashboardRow[];
}

/**
 * The query behind "every time I open the dashboard": campaigns grouped
 * into Active/Paused/Stopped, each row carrying exactly the fields the
 * product asked for (name, daily budget, spent amount, cost per result,
 * number of results, start/end date). Pure read from what the sync job has
 * already stored - no live Meta API call happens on page load.
 */
export class GetCampaignDashboardUseCase {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly dailySpend: DailySpendRepository,
  ) {}

  async execute(input: { tenantId: string }): Promise<CampaignDashboard> {
    const [campaigns, allDailySpend] = await Promise.all([
      this.campaigns.listByTenant(input.tenantId),
      this.dailySpend.listByTenant(input.tenantId),
    ]);

    const spendByCampaignId = new Map<string, typeof allDailySpend>();
    for (const spend of allDailySpend) {
      const list = spendByCampaignId.get(spend.campaignId) ?? [];
      list.push(spend);
      spendByCampaignId.set(spend.campaignId, list);
    }

    const dashboard: CampaignDashboard = { active: [], paused: [], stopped: [] };

    for (const campaign of campaigns) {
      const row = aggregateCampaignForDashboard(campaign, spendByCampaignId.get(campaign.id) ?? []);
      switch (campaign.status) {
        case CampaignStatus.ACTIVE:
          dashboard.active.push(row);
          break;
        case CampaignStatus.PAUSED:
          dashboard.paused.push(row);
          break;
        case CampaignStatus.STOPPED:
          dashboard.stopped.push(row);
          break;
      }
    }

    return dashboard;
  }
}
