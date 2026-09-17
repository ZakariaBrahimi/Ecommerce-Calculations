import { GetCampaignDashboardUseCase } from '../../../src/application/use-cases/GetCampaignDashboardUseCase';
import { InMemoryCampaignRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryCampaignRepository';
import { InMemoryDailySpendRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDailySpendRepository';
import { Campaign } from '../../../src/domain/entities/Campaign';
import { DailySpend } from '../../../src/domain/entities/DailySpend';
import { CampaignStatus } from '../../../src/domain/enums/CampaignStatus';

const TENANT = 'tenant-1';

function makeCampaign(name: string, status: CampaignStatus, externalCampaignId: string) {
  return Campaign.create({
    tenantId: TENANT,
    provider: 'meta',
    adAccountId: 'act_1',
    externalCampaignId,
    name,
    objective: 'OUTCOME_SALES',
    status,
    rawStatus: status,
    dailyBudget: 30,
    currency: 'USD',
    startDate: new Date('2024-01-01'),
    endDate: null,
    lastSyncedAt: new Date(),
  });
}

describe('GetCampaignDashboardUseCase', () => {
  it('groups campaigns into active/paused/stopped, each with the dashboard fields', async () => {
    const campaigns = new InMemoryCampaignRepository();
    const dailySpend = new InMemoryDailySpendRepository();

    const active = makeCampaign('Active Campaign', CampaignStatus.ACTIVE, 'c-active');
    const paused = makeCampaign('Paused Campaign', CampaignStatus.PAUSED, 'c-paused');
    const stopped = makeCampaign('Stopped Campaign', CampaignStatus.STOPPED, 'c-stopped');
    await campaigns.upsert(active);
    await campaigns.upsert(paused);
    await campaigns.upsert(stopped);

    await dailySpend.upsert(
      DailySpend.create({
        tenantId: TENANT,
        campaignId: active.id,
        date: new Date('2024-06-01'),
        spend: 40,
        impressions: 1000,
        clicks: 20,
        results: 2,
        resultType: 'omni_purchase',
        purchases: 2,
        purchaseValue: 160,
        currency: 'USD',
      }),
    );

    const useCase = new GetCampaignDashboardUseCase(campaigns, dailySpend);
    const dashboard = await useCase.execute({ tenantId: TENANT });

    expect(dashboard.active).toHaveLength(1);
    expect(dashboard.paused).toHaveLength(1);
    expect(dashboard.stopped).toHaveLength(1);

    expect(dashboard.active[0]).toMatchObject({
      name: 'Active Campaign',
      dailyBudget: 30,
      spentAmount: 40,
      impressions: 1000,
      clicks: 20,
      ctrPct: 2,
      cpc: 2,
      resultsCount: 2,
      costPerResult: 20,
      purchases: 2,
      purchaseValue: 160,
      roas: 4,
    });
    expect(dashboard.paused[0].spentAmount).toBe(0);
    expect(dashboard.paused[0].costPerResult).toBeNull();
    expect(dashboard.paused[0].roas).toBeNull();
  });

  it('returns empty groups for a tenant with no campaigns', async () => {
    const useCase = new GetCampaignDashboardUseCase(
      new InMemoryCampaignRepository(),
      new InMemoryDailySpendRepository(),
    );
    const dashboard = await useCase.execute({ tenantId: 'no-campaigns-tenant' });
    expect(dashboard).toEqual({ active: [], paused: [], stopped: [] });
  });
});
