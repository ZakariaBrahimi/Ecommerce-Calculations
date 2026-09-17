import { Logger } from '../../domain/ports/Logger';
import { SyncCampaignStructureUseCase } from './SyncCampaignStructureUseCase';
import { SyncDailyInsightsUseCase } from './SyncDailyInsightsUseCase';

export interface SyncMetaAdsInput {
  tenantId: string;
}

export interface SyncMetaAdsResult {
  tenantId: string;
  campaigns: number;
  adSets: number;
  ads: number;
  insightRows: number;
}

/**
 * "Automatic synchronization" core logic for one tenant: refreshes the
 * campaign/ad set/ad hierarchy, then pulls the rolling insights window.
 * Structure must sync first since insights are matched against it.
 */
export class SyncMetaAdsUseCase {
  constructor(
    private readonly syncStructure: SyncCampaignStructureUseCase,
    private readonly syncInsights: SyncDailyInsightsUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(input: SyncMetaAdsInput): Promise<SyncMetaAdsResult> {
    const log = this.logger.child({ tenantId: input.tenantId, job: 'sync-meta-ads' });

    const structure = await this.syncStructure.execute({ tenantId: input.tenantId });
    const insights = await this.syncInsights.execute({ tenantId: input.tenantId });

    const result: SyncMetaAdsResult = {
      tenantId: input.tenantId,
      campaigns: structure.campaigns,
      adSets: structure.adSets,
      ads: structure.ads,
      insightRows: insights.rowsSynced,
    };
    log.info('Tenant Meta Ads sync complete', { ...result });
    return result;
  }
}
