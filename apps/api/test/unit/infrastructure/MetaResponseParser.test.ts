import {
  parseAdAccounts,
  parseAds,
  parseAdSets,
  parseCampaigns,
  parseDailyInsights,
  parseTokenExchangeResponse,
} from '../../../src/infrastructure/providers/meta-ads/MetaResponseParser';
import { MetaResponseValidationError } from '../../../src/domain/errors/MetaAdsIntegrationErrors';

describe('parseCampaigns', () => {
  it('parses a campaign row and converts daily_budget from minor units', () => {
    const [campaign] = parseCampaigns(
      [
        {
          id: '120001',
          name: 'Summer Sale',
          objective: 'OUTCOME_SALES',
          effective_status: 'ACTIVE',
          daily_budget: '2500', // $25.00 in cents
          start_time: '2024-06-01T00:00:00+0000',
          stop_time: '2024-06-30T00:00:00+0000',
        },
      ],
      'USD',
    );

    expect(campaign.externalCampaignId).toBe('120001');
    expect(campaign.dailyBudget).toBe(25);
    expect(campaign.currency).toBe('USD');
    expect(campaign.startDate?.toISOString()).toContain('2024-06-01');
  });

  it('does not divide budgets for zero-decimal currencies', () => {
    const [campaign] = parseCampaigns(
      [{ id: '1', name: 'JPY campaign', effective_status: 'ACTIVE', daily_budget: '5000' }],
      'JPY',
    );
    expect(campaign.dailyBudget).toBe(5000);
  });

  it('throws MetaResponseValidationError when required fields are missing', () => {
    expect(() => parseCampaigns([{ id: '1' }], 'USD')).toThrow(MetaResponseValidationError);
  });
});

describe('parseAdSets / parseAds', () => {
  it('parses ad set rows', () => {
    const [adSet] = parseAdSets(
      [{ id: '2', campaign_id: '120001', name: 'AdSet 1', effective_status: 'PAUSED', daily_budget: '1000' }],
      'USD',
    );
    expect(adSet.externalAdSetId).toBe('2');
    expect(adSet.externalCampaignId).toBe('120001');
    expect(adSet.dailyBudget).toBe(10);
  });

  it('parses ad rows', () => {
    const [ad] = parseAds([
      { id: '3', adset_id: '2', campaign_id: '120001', name: 'Ad 1', effective_status: 'ACTIVE' },
    ]);
    expect(ad.externalAdId).toBe('3');
    expect(ad.externalAdSetId).toBe('2');
  });
});

describe('parseDailyInsights', () => {
  it('parses spend/impressions/clicks/actions without applying minor-unit conversion', () => {
    const [insight] = parseDailyInsights([
      {
        campaign_id: '120001',
        date_start: '2024-06-05',
        spend: '123.45',
        impressions: '10000',
        clicks: '250',
        account_currency: 'USD',
        actions: [{ action_type: 'omni_purchase', value: '8' }],
      },
    ]);

    expect(insight.spend).toBe(123.45);
    expect(insight.impressions).toBe(10000);
    expect(insight.clicks).toBe(250);
    expect(insight.actions).toEqual([{ actionType: 'omni_purchase', value: 8 }]);
  });

  it('throws when campaign_id/date_start is missing', () => {
    expect(() => parseDailyInsights([{ spend: '1' }])).toThrow(MetaResponseValidationError);
  });
});

describe('parseAdAccounts', () => {
  it('parses ad account rows', () => {
    const [account] = parseAdAccounts([{ id: 'act_123', name: 'My Store', currency: 'EUR', account_status: 1 }]);
    expect(account).toEqual({
      externalAdAccountId: 'act_123',
      name: 'My Store',
      currency: 'EUR',
      accountStatus: '1',
    });
  });
});

describe('parseTokenExchangeResponse', () => {
  it('extracts access_token and expires_in', () => {
    const result = parseTokenExchangeResponse({ access_token: 'tok_abc', expires_in: 5183944 });
    expect(result).toEqual({ accessToken: 'tok_abc', expiresInSeconds: 5183944 });
  });

  it('defaults expiresInSeconds to ~60 days when expires_in is absent', () => {
    const result = parseTokenExchangeResponse({ access_token: 'tok_abc' });
    expect(result.expiresInSeconds).toBe(60 * 24 * 60 * 60);
  });

  it('throws when access_token is missing', () => {
    expect(() => parseTokenExchangeResponse({})).toThrow(MetaResponseValidationError);
  });
});
