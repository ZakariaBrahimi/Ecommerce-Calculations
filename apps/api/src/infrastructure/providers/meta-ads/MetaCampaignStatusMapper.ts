import { CampaignStatusMapper } from '../../../domain/ports/CampaignStatusMapper';
import { CampaignStatus } from '../../../domain/enums/CampaignStatus';
import { UnknownCampaignStatusError } from '../../../domain/errors/MetaAdsIntegrationErrors';

/**
 * Maps Meta's `effective_status` (much finer-grained than its own `status`
 * field - it folds in delivery/review/billing state) into the dashboard's
 * three buckets. See https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/
 * for the full effective_status vocabulary this is built from.
 */
const META_STATUS_MAP: ReadonlyMap<string, CampaignStatus> = new Map([
  ['ACTIVE', CampaignStatus.ACTIVE],
  ['PREAPPROVED', CampaignStatus.ACTIVE],

  ['PAUSED', CampaignStatus.PAUSED],
  ['CAMPAIGN_PAUSED', CampaignStatus.PAUSED],
  ['ADSET_PAUSED', CampaignStatus.PAUSED],
  ['IN_PROCESS', CampaignStatus.PAUSED],
  ['WITH_ISSUES', CampaignStatus.PAUSED],
  ['PENDING_REVIEW', CampaignStatus.PAUSED],
  ['PENDING_BILLING_INFO', CampaignStatus.PAUSED],

  ['DELETED', CampaignStatus.STOPPED],
  ['ARCHIVED', CampaignStatus.STOPPED],
  ['DISAPPROVED', CampaignStatus.STOPPED],
]);

export class MetaCampaignStatusMapper implements CampaignStatusMapper {
  readonly provider = 'meta';

  map(rawStatus: string): CampaignStatus {
    const mapped = META_STATUS_MAP.get(rawStatus.trim().toUpperCase());
    if (!mapped) {
      throw new UnknownCampaignStatusError(rawStatus);
    }
    return mapped;
  }
}
