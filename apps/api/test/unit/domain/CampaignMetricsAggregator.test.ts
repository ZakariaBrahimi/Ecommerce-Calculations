import { aggregateCampaignForDashboard } from '../../../src/domain/services/CampaignMetricsAggregator';
import { Campaign } from '../../../src/domain/entities/Campaign';
import { DailySpend } from '../../../src/domain/entities/DailySpend';
import { CampaignStatus } from '../../../src/domain/enums/CampaignStatus';

function makeCampaign(overrides: Partial<Parameters<typeof Campaign.create>[0]> = {}) {
  return Campaign.create({
    tenantId: 'tenant-1',
    provider: 'meta',
    adAccountId: 'act_1',
    externalCampaignId: 'ext-1',
    name: 'Test Campaign',
    objective: 'OUTCOME_SALES',
    status: CampaignStatus.ACTIVE,
    rawStatus: 'ACTIVE',
    dailyBudget: 50,
    currency: 'USD',
    startDate: new Date('2024-06-01'),
    endDate: null,
    lastSyncedAt: new Date(),
    ...overrides,
  });
}

function makeSpend(spend: number, results: number) {
  return DailySpend.create({
    tenantId: 'tenant-1',
    campaignId: 'campaign-1',
    date: new Date('2024-06-01'),
    spend,
    impressions: 1000,
    clicks: 50,
    results,
    resultType: 'omni_purchase',
    currency: 'USD',
  });
}

describe('aggregateCampaignForDashboard', () => {
  it('sums spend and results across the campaign lifetime and derives cost per result', () => {
    const campaign = makeCampaign();
    const spends = [makeSpend(100, 5), makeSpend(50, 2)];

    const row = aggregateCampaignForDashboard(campaign, spends);

    expect(row.spentAmount).toBe(150);
    expect(row.resultsCount).toBe(7);
    expect(row.costPerResult).toBeCloseTo(21.43, 2);
    expect(row.dailyBudget).toBe(50);
    expect(row.status).toBe(CampaignStatus.ACTIVE);
  });

  it('reports costPerResult as null and spentAmount as 0 when there is no spend history yet', () => {
    const campaign = makeCampaign();
    const row = aggregateCampaignForDashboard(campaign, []);

    expect(row.spentAmount).toBe(0);
    expect(row.resultsCount).toBe(0);
    expect(row.costPerResult).toBeNull();
  });
});
