import { MetaAdsGateway } from '../../domain/ports/MetaAdsGateway';
import { CampaignRepository } from '../../domain/ports/CampaignRepository';
import { AdSetRepository } from '../../domain/ports/AdSetRepository';
import { AdRepository } from '../../domain/ports/AdRepository';
import { CampaignStatusMapper } from '../../domain/ports/CampaignStatusMapper';
import { Logger } from '../../domain/ports/Logger';
import { MetaConnectionResolver } from '../services/MetaConnectionResolver';
import { Campaign } from '../../domain/entities/Campaign';
import { AdSet } from '../../domain/entities/AdSet';
import { Ad } from '../../domain/entities/Ad';
import { CampaignStatus } from '../../domain/enums/CampaignStatus';
import { UnknownCampaignStatusError } from '../../domain/errors/MetaAdsIntegrationErrors';

export interface SyncCampaignStructureInput {
  tenantId: string;
}

export interface SyncCampaignStructureResult {
  campaigns: number;
  adSets: number;
  ads: number;
  unmappedStatuses: number;
}

/**
 * Pulls the campaign/ad set/ad hierarchy from Meta and upserts it. Run
 * before SyncDailyInsightsUseCase, which resolves insight rows against
 * campaigns already stored here.
 */
export class SyncCampaignStructureUseCase {
  constructor(
    private readonly gateway: MetaAdsGateway,
    private readonly campaigns: CampaignRepository,
    private readonly adSets: AdSetRepository,
    private readonly ads: AdRepository,
    private readonly statusMapper: CampaignStatusMapper,
    private readonly connectionResolver: MetaConnectionResolver,
    private readonly logger: Logger,
  ) {}

  async execute(input: SyncCampaignStructureInput): Promise<SyncCampaignStructureResult> {
    const log = this.logger.child({ tenantId: input.tenantId, provider: this.gateway.provider });
    const { accessToken, adAccountId, currency } = await this.connectionResolver.resolve(input.tenantId);

    const result: SyncCampaignStructureResult = { campaigns: 0, adSets: 0, ads: 0, unmappedStatuses: 0 };
    const now = new Date();

    const campaignIdByExternalId = await this.syncCampaigns(
      input.tenantId,
      accessToken,
      adAccountId,
      currency,
      now,
      result,
      log,
    );
    const adSetIdByExternalId = await this.syncAdSets(
      input.tenantId,
      accessToken,
      adAccountId,
      currency,
      campaignIdByExternalId,
      now,
      result,
      log,
    );
    await this.syncAds(input.tenantId, accessToken, adAccountId, campaignIdByExternalId, adSetIdByExternalId, now, result, log);

    log.info('Meta campaign structure sync complete', { ...result });
    return result;
  }

  private async syncCampaigns(
    tenantId: string,
    accessToken: string,
    adAccountId: string,
    currency: string,
    now: Date,
    result: SyncCampaignStructureResult,
    log: Logger,
  ): Promise<Map<string, string>> {
    const raw = await this.gateway.fetchCampaigns(accessToken, adAccountId, currency);
    const idMap = new Map<string, string>();

    for (const record of raw) {
      const existing = await this.campaigns.findByExternalId(tenantId, record.externalCampaignId);
      const status = this.mapStatusOrFallback(record.effectiveStatus, existing?.status, log, record.externalCampaignId, result);

      if (!existing) {
        const campaign = Campaign.create({
          tenantId,
          provider: this.gateway.provider,
          adAccountId,
          externalCampaignId: record.externalCampaignId,
          name: record.name,
          objective: record.objective,
          status,
          rawStatus: record.effectiveStatus,
          dailyBudget: record.dailyBudget,
          currency: record.currency,
          startDate: record.startDate,
          endDate: record.endDate,
          lastSyncedAt: now,
        });
        await this.campaigns.upsert(campaign);
        idMap.set(record.externalCampaignId, campaign.id);
      } else {
        existing.applySync(
          {
            name: record.name,
            objective: record.objective,
            status,
            rawStatus: record.effectiveStatus,
            dailyBudget: record.dailyBudget,
            currency: record.currency,
            startDate: record.startDate,
            endDate: record.endDate,
          },
          now,
        );
        await this.campaigns.upsert(existing);
        idMap.set(record.externalCampaignId, existing.id);
      }
      result.campaigns += 1;
    }

    return idMap;
  }

  private async syncAdSets(
    tenantId: string,
    accessToken: string,
    adAccountId: string,
    currency: string,
    campaignIdByExternalId: Map<string, string>,
    now: Date,
    result: SyncCampaignStructureResult,
    log: Logger,
  ): Promise<Map<string, string>> {
    const raw = await this.gateway.fetchAdSets(accessToken, adAccountId, currency);
    const idMap = new Map<string, string>();

    for (const record of raw) {
      const campaignId = campaignIdByExternalId.get(record.externalCampaignId);
      if (!campaignId) {
        log.warn('Ad set references a campaign not seen in this sync run - skipping', {
          externalAdSetId: record.externalAdSetId,
          externalCampaignId: record.externalCampaignId,
        });
        continue;
      }

      const existing = await this.adSets.findByExternalId(tenantId, record.externalAdSetId);
      const status = this.mapStatusOrFallback(
        record.effectiveStatus,
        existing?.toPrimitives().status,
        log,
        record.externalAdSetId,
        result,
      );

      if (!existing) {
        const adSet = AdSet.create({
          tenantId,
          campaignId,
          externalAdSetId: record.externalAdSetId,
          name: record.name,
          status,
          rawStatus: record.effectiveStatus,
          dailyBudget: record.dailyBudget,
          startDate: record.startDate,
          endDate: record.endDate,
          lastSyncedAt: now,
        });
        await this.adSets.upsert(adSet);
        idMap.set(record.externalAdSetId, adSet.id);
      } else {
        existing.applySync(
          {
            name: record.name,
            status,
            rawStatus: record.effectiveStatus,
            dailyBudget: record.dailyBudget,
            startDate: record.startDate,
            endDate: record.endDate,
          },
          now,
        );
        await this.adSets.upsert(existing);
        idMap.set(record.externalAdSetId, existing.id);
      }
      result.adSets += 1;
    }

    return idMap;
  }

  private async syncAds(
    tenantId: string,
    accessToken: string,
    adAccountId: string,
    campaignIdByExternalId: Map<string, string>,
    adSetIdByExternalId: Map<string, string>,
    now: Date,
    result: SyncCampaignStructureResult,
    log: Logger,
  ): Promise<void> {
    const raw = await this.gateway.fetchAds(accessToken, adAccountId);

    for (const record of raw) {
      const campaignId = campaignIdByExternalId.get(record.externalCampaignId);
      const adSetId = adSetIdByExternalId.get(record.externalAdSetId);
      if (!campaignId || !adSetId) {
        log.warn('Ad references a campaign/ad set not seen in this sync run - skipping', {
          externalAdId: record.externalAdId,
        });
        continue;
      }

      const existing = await this.ads.findByExternalId(tenantId, record.externalAdId);
      const status = this.mapStatusOrFallback(
        record.effectiveStatus,
        existing?.toPrimitives().status,
        log,
        record.externalAdId,
        result,
      );

      if (!existing) {
        await this.ads.upsert(
          Ad.create({
            tenantId,
            campaignId,
            adSetId,
            externalAdId: record.externalAdId,
            name: record.name,
            status,
            rawStatus: record.effectiveStatus,
            lastSyncedAt: now,
          }),
        );
      } else {
        existing.applySync({ name: record.name, status, rawStatus: record.effectiveStatus }, now);
        await this.ads.upsert(existing);
      }
      result.ads += 1;
    }
  }

  private mapStatusOrFallback(
    rawStatus: string,
    fallback: CampaignStatus | undefined,
    log: Logger,
    externalId: string,
    result: SyncCampaignStructureResult,
  ): CampaignStatus {
    try {
      return this.statusMapper.map(rawStatus);
    } catch (err) {
      if (!(err instanceof UnknownCampaignStatusError)) throw err;
      result.unmappedStatuses += 1;
      log.warn('Unmapped Meta effective_status - keeping prior status, defaulting new records to PAUSED', {
        externalId,
        rawStatus,
      });
      return fallback ?? CampaignStatus.PAUSED;
    }
  }
}
