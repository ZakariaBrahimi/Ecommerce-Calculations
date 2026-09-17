import { randomBytes } from 'node:crypto';
import { SyncCampaignStructureUseCase } from '../../../src/application/use-cases/SyncCampaignStructureUseCase';
import { MetaConnectionResolver } from '../../../src/application/services/MetaConnectionResolver';
import { InMemoryCampaignRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryCampaignRepository';
import { InMemoryAdSetRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryAdSetRepository';
import { InMemoryAdRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryAdRepository';
import { InMemoryMetaAdAccountConnectionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryMetaAdAccountConnectionRepository';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';
import { MetaCampaignStatusMapper } from '../../../src/infrastructure/providers/meta-ads/MetaCampaignStatusMapper';
import { CampaignStatus } from '../../../src/domain/enums/CampaignStatus';
import { MetaAuthenticationError, MetaConnectionNotFoundError } from '../../../src/domain/errors/MetaAdsIntegrationErrors';
import { FakeMetaAdsGateway, NoopLogger } from './testFakes';

const TENANT = 'tenant-1';

async function setup() {
  const gateway = new FakeMetaAdsGateway();
  const campaigns = new InMemoryCampaignRepository();
  const adSets = new InMemoryAdSetRepository();
  const ads = new InMemoryAdRepository();
  const connections = new InMemoryMetaAdAccountConnectionRepository();
  const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
  const resolver = new MetaConnectionResolver(connections, cipher);
  const statusMapper = new MetaCampaignStatusMapper();

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

  const useCase = new SyncCampaignStructureUseCase(
    gateway,
    campaigns,
    adSets,
    ads,
    statusMapper,
    resolver,
    new NoopLogger(),
  );

  return { gateway, campaigns, adSets, ads, connections, useCase };
}

describe('SyncCampaignStructureUseCase', () => {
  it('syncs campaigns, ad sets and ads and links them by internal id', async () => {
    const { gateway, campaigns, adSets, ads, useCase } = await setup();
    gateway.campaigns = [
      {
        externalCampaignId: 'c1',
        name: 'Campaign 1',
        objective: 'OUTCOME_SALES',
        effectiveStatus: 'ACTIVE',
        dailyBudget: 50,
        currency: 'USD',
        startDate: new Date('2024-01-01'),
        endDate: null,
      },
    ];
    gateway.adSets = [
      {
        externalAdSetId: 'as1',
        externalCampaignId: 'c1',
        name: 'AdSet 1',
        effectiveStatus: 'PAUSED',
        dailyBudget: 20,
        startDate: null,
        endDate: null,
      },
    ];
    gateway.ads = [
      { externalAdId: 'ad1', externalAdSetId: 'as1', externalCampaignId: 'c1', name: 'Ad 1', effectiveStatus: 'ACTIVE' },
    ];

    const result = await useCase.execute({ tenantId: TENANT });

    expect(result).toEqual({ campaigns: 1, adSets: 1, ads: 1, unmappedStatuses: 0 });

    const campaign = await campaigns.findByExternalId(TENANT, 'c1');
    expect(campaign!.status).toBe(CampaignStatus.ACTIVE);

    const adSetList = await adSets.listByCampaign(TENANT, campaign!.id);
    expect(adSetList).toHaveLength(1);
    expect(adSetList[0].toPrimitives().status).toBe(CampaignStatus.PAUSED);

    const adList = await ads.listByAdSet(TENANT, adSetList[0].id);
    expect(adList).toHaveLength(1);
    expect(adList[0].toPrimitives().campaignId).toBe(campaign!.id);
  });

  it('skips an ad set referencing a campaign not present in this sync run', async () => {
    const { gateway, adSets, useCase } = await setup();
    gateway.adSets = [
      {
        externalAdSetId: 'orphan-as',
        externalCampaignId: 'does-not-exist',
        name: 'Orphan',
        effectiveStatus: 'ACTIVE',
        dailyBudget: null,
        startDate: null,
        endDate: null,
      },
    ];

    const result = await useCase.execute({ tenantId: TENANT });

    expect(result.adSets).toBe(0);
    expect(await adSets.findByExternalId(TENANT, 'orphan-as')).toBeNull();
  });

  it('defaults an unmapped effective_status to PAUSED for a new campaign and counts it', async () => {
    const { gateway, campaigns, useCase } = await setup();
    gateway.campaigns = [
      {
        externalCampaignId: 'c-weird',
        name: 'Weird status campaign',
        objective: null,
        effectiveStatus: 'SOME_BRAND_NEW_STATUS',
        dailyBudget: null,
        currency: 'USD',
        startDate: null,
        endDate: null,
      },
    ];

    const result = await useCase.execute({ tenantId: TENANT });

    expect(result.unmappedStatuses).toBe(1);
    const campaign = await campaigns.findByExternalId(TENANT, 'c-weird');
    expect(campaign!.status).toBe(CampaignStatus.PAUSED);
  });

  it('throws MetaConnectionNotFoundError when no ad account has been selected yet', async () => {
    const gateway = new FakeMetaAdsGateway();
    const campaigns = new InMemoryCampaignRepository();
    const adSets = new InMemoryAdSetRepository();
    const ads = new InMemoryAdRepository();
    const connections = new InMemoryMetaAdAccountConnectionRepository();
    const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
    const resolver = new MetaConnectionResolver(connections, cipher);
    const useCase = new SyncCampaignStructureUseCase(
      gateway,
      campaigns,
      adSets,
      ads,
      new MetaCampaignStatusMapper(),
      resolver,
      new NoopLogger(),
    );

    await expect(useCase.execute({ tenantId: 'unconnected-tenant' })).rejects.toThrow(
      MetaConnectionNotFoundError,
    );
  });

  it('marks the connection invalid and throws MetaAuthenticationError when the token has expired', async () => {
    const { connections, useCase } = await setup();
    await connections.save({
      ...(await connections.find(TENANT))!,
      tokenExpiresAt: new Date(Date.now() - 1000),
    });

    await expect(useCase.execute({ tenantId: TENANT })).rejects.toThrow(MetaAuthenticationError);
    expect((await connections.find(TENANT))!.status).toBe('invalid');
  });
});
