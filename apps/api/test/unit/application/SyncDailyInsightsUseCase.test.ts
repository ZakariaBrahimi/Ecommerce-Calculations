import { randomBytes } from 'node:crypto';
import { SyncDailyInsightsUseCase } from '../../../src/application/use-cases/SyncDailyInsightsUseCase';
import { MetaConnectionResolver } from '../../../src/application/services/MetaConnectionResolver';
import { InMemoryCampaignRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryCampaignRepository';
import { InMemoryDailySpendRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDailySpendRepository';
import { InMemoryMetaAdAccountConnectionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryMetaAdAccountConnectionRepository';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';
import { Campaign } from '../../../src/domain/entities/Campaign';
import { CampaignStatus } from '../../../src/domain/enums/CampaignStatus';
import { FakeMetaAdsGateway, NoopLogger } from './testFakes';

const TENANT = 'tenant-1';

async function setup() {
  const gateway = new FakeMetaAdsGateway();
  const campaigns = new InMemoryCampaignRepository();
  const dailySpend = new InMemoryDailySpendRepository();
  const connections = new InMemoryMetaAdAccountConnectionRepository();
  const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
  const resolver = new MetaConnectionResolver(connections, cipher);

  await connections.save({
    tenantId: TENANT,
    provider: 'meta',
    encryptedAccessToken: cipher.encrypt('token'),
    tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    adAccountId: 'act_1',
    currency: 'USD',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const campaign = Campaign.create({
    tenantId: TENANT,
    provider: 'meta',
    adAccountId: 'act_1',
    externalCampaignId: 'c1',
    name: 'Campaign 1',
    objective: 'OUTCOME_SALES',
    status: CampaignStatus.ACTIVE,
    rawStatus: 'ACTIVE',
    dailyBudget: 50,
    currency: 'USD',
    startDate: new Date('2024-01-01'),
    endDate: null,
    lastSyncedAt: new Date(),
  });
  await campaigns.upsert(campaign);

  const useCase = new SyncDailyInsightsUseCase(gateway, campaigns, dailySpend, resolver, new NoopLogger());

  return { gateway, campaigns, dailySpend, campaign, useCase };
}

describe('SyncDailyInsightsUseCase', () => {
  it('upserts a DailySpend row per insight, deriving results from the campaign objective', async () => {
    const { gateway, dailySpend, campaign, useCase } = await setup();
    gateway.insights = [
      {
        externalCampaignId: 'c1',
        date: new Date('2024-06-05'),
        spend: 100,
        impressions: 5000,
        clicks: 80,
        currency: 'USD',
        actions: [{ actionType: 'omni_purchase', value: 4 }],
      },
    ];

    const result = await useCase.execute({ tenantId: TENANT });

    expect(result).toEqual({ rowsSynced: 1, campaignsNotFound: 0 });
    const rows = await dailySpend.listByCampaign(TENANT, campaign.id);
    expect(rows).toHaveLength(1);
    const row = rows[0].toPrimitives();
    expect(row.spend).toBe(100);
    expect(row.results).toBe(4);
    expect(row.resultType).toBe('omni_purchase');
    expect(row.costPerResult).toBe(25);
  });

  it('skips and counts an insight row for a campaign not yet synced', async () => {
    const { gateway, useCase } = await setup();
    gateway.insights = [
      {
        externalCampaignId: 'unknown-campaign',
        date: new Date('2024-06-05'),
        spend: 10,
        impressions: 100,
        clicks: 2,
        currency: 'USD',
        actions: [],
      },
    ];

    const result = await useCase.execute({ tenantId: TENANT });
    expect(result).toEqual({ rowsSynced: 0, campaignsNotFound: 1 });
  });
});
