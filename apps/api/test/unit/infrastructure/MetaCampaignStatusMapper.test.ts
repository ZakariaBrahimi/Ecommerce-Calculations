import { MetaCampaignStatusMapper } from '../../../src/infrastructure/providers/meta-ads/MetaCampaignStatusMapper';
import { CampaignStatus } from '../../../src/domain/enums/CampaignStatus';
import { UnknownCampaignStatusError } from '../../../src/domain/errors/MetaAdsIntegrationErrors';

describe('MetaCampaignStatusMapper', () => {
  const mapper = new MetaCampaignStatusMapper();

  it.each<[string, CampaignStatus]>([
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
  ])('maps effective_status "%s" to %s', (raw, expected) => {
    expect(mapper.map(raw)).toBe(expected);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(mapper.map(' active ')).toBe(CampaignStatus.ACTIVE);
  });

  it('throws UnknownCampaignStatusError for an unrecognized value', () => {
    expect(() => mapper.map('SOME_NEW_STATUS')).toThrow(UnknownCampaignStatusError);
  });
});
