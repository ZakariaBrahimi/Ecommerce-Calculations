import { MetaAdsGateway } from '../../domain/ports/MetaAdsGateway';
import { CampaignRepository } from '../../domain/ports/CampaignRepository';
import { DailySpendRepository } from '../../domain/ports/DailySpendRepository';
import { Logger } from '../../domain/ports/Logger';
import { MetaConnectionResolver } from '../services/MetaConnectionResolver';
import { DailySpend } from '../../domain/entities/DailySpend';
import { extractResults, extractPurchases } from '../../infrastructure/providers/meta-ads/MetaResultsExtractor';

export interface SyncDailyInsightsInput {
  tenantId: string;
  /** How far back to re-pull (Meta revises attributed conversions for several days after the fact). */
  sinceDaysAgo?: number;
}

export interface SyncDailyInsightsResult {
  rowsSynced: number;
  campaignsNotFound: number;
}

const DEFAULT_SINCE_DAYS_AGO = 7;

/**
 * Pulls daily campaign-level spend/results and upserts DailySpend rows.
 * Must run after SyncCampaignStructureUseCase - insight rows are matched
 * against campaigns already stored by external id.
 */
export class SyncDailyInsightsUseCase {
  constructor(
    private readonly gateway: MetaAdsGateway,
    private readonly campaigns: CampaignRepository,
    private readonly dailySpend: DailySpendRepository,
    private readonly connectionResolver: MetaConnectionResolver,
    private readonly logger: Logger,
  ) {}

  async execute(input: SyncDailyInsightsInput): Promise<SyncDailyInsightsResult> {
    const log = this.logger.child({ tenantId: input.tenantId, provider: this.gateway.provider });
    const { accessToken, adAccountId } = await this.connectionResolver.resolve(input.tenantId);

    const raw = await this.gateway.fetchDailyInsights(
      accessToken,
      adAccountId,
      input.sinceDaysAgo ?? DEFAULT_SINCE_DAYS_AGO,
    );

    const result: SyncDailyInsightsResult = { rowsSynced: 0, campaignsNotFound: 0 };

    for (const record of raw) {
      const campaign = await this.campaigns.findByExternalId(input.tenantId, record.externalCampaignId);
      if (!campaign) {
        result.campaignsNotFound += 1;
        log.warn('Insight row references a campaign not yet synced - run campaign structure sync first', {
          externalCampaignId: record.externalCampaignId,
        });
        continue;
      }

      const { results, resultType } = extractResults(campaign.toPrimitives().objective, record.actions, record.clicks);
      const { purchases, purchaseValue } = extractPurchases(record.actions, record.actionValues);

      await this.dailySpend.upsert(
        DailySpend.create({
          tenantId: input.tenantId,
          campaignId: campaign.id,
          date: record.date,
          spend: record.spend,
          impressions: record.impressions,
          clicks: record.clicks,
          results,
          resultType,
          purchases,
          purchaseValue,
          currency: record.currency,
        }),
      );
      result.rowsSynced += 1;
    }

    log.info('Meta daily insights sync complete', { ...result });
    return result;
  }
}
