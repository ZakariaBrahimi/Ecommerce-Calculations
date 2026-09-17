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

function makeSpend(
  spend: number,
  results: number,
  overrides: { impressions?: number; clicks?: number; purchases?: number; purchaseValue?: number } = {},
) {
  return DailySpend.create({
    tenantId: 'tenant-1',
    campaignId: 'campaign-1',
    date: new Date('2024-06-01'),
    spend,
    impressions: overrides.impressions ?? 1000,
    clicks: overrides.clicks ?? 50,
    results,
    resultType: 'omni_purchase',
    purchases: overrides.purchases ?? results,
    purchaseValue: overrides.purchaseValue ?? 0,
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

  it('sums impressions/clicks and derives CTR and CPC', () => {
    const campaign = makeCampaign();
    const spends = [
      makeSpend(100, 5, { impressions: 4000, clicks: 80 }),
      makeSpend(50, 2, { impressions: 1000, clicks: 20 }),
    ];

    const row = aggregateCampaignForDashboard(campaign, spends);

    expect(row.impressions).toBe(5000);
    expect(row.clicks).toBe(100);
    expect(row.ctrPct).toBe(2); // 100 / 5000 * 100
    expect(row.cpc).toBe(1.5); // 150 / 100
  });

  it('sums purchases/purchaseValue and derives ROAS from the totals, not per-day averages', () => {
    const campaign = makeCampaign();
    const spends = [
      makeSpend(100, 5, { purchases: 4, purchaseValue: 300 }),
      makeSpend(50, 2, { purchases: 1, purchaseValue: 900 }),
    ];

    const row = aggregateCampaignForDashboard(campaign, spends);

    expect(row.purchases).toBe(5);
    expect(row.purchaseValue).toBe(1200);
    expect(row.roas).toBe(8); // 1200 / 150, not avg(3, 18)
  });

  it('reports costPerResult/ctrPct/cpc/roas as null and every total as 0 when there is no spend history yet', () => {
    const campaign = makeCampaign();
    const row = aggregateCampaignForDashboard(campaign, []);

    expect(row.spentAmount).toBe(0);
    expect(row.resultsCount).toBe(0);
    expect(row.costPerResult).toBeNull();
    expect(row.impressions).toBe(0);
    expect(row.clicks).toBe(0);
    expect(row.ctrPct).toBeNull();
    expect(row.cpc).toBeNull();
    expect(row.purchases).toBe(0);
    expect(row.purchaseValue).toBe(0);
    expect(row.roas).toBeNull();
  });
});
