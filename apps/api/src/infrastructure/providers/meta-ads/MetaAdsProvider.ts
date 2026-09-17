import {
  MetaAdAccountSummary,
  MetaAdsGateway,
  MetaOAuthTokenExchangeResult,
  RawAdRecord,
  RawAdSetRecord,
  RawCampaignRecord,
  RawDailyInsightRecord,
} from '../../../domain/ports/MetaAdsGateway';
import { MetaGraphHttpClient } from './MetaGraphHttpClient';
import {
  parseAdAccounts,
  parseAds,
  parseAdSets,
  parseCampaigns,
  parseDailyInsights,
  parseTokenExchangeResponse,
} from './MetaResponseParser';

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  oauthDialogBaseUrl: string; // https://www.facebook.com - separate host from the Graph API itself
}

const CAMPAIGN_FIELDS = 'id,name,objective,effective_status,daily_budget,start_time,stop_time';
const ADSET_FIELDS = 'id,campaign_id,name,effective_status,daily_budget,start_time,end_time';
const AD_FIELDS = 'id,adset_id,campaign_id,name,effective_status';
const INSIGHT_FIELDS = 'campaign_id,spend,impressions,clicks,actions,action_values,date_start,account_currency';
const AD_ACCOUNT_FIELDS = 'id,name,currency,account_status';
const OAUTH_SCOPES = 'ads_read,ads_management,business_management';

/**
 * Concrete MetaAdsGateway for Meta's Marketing (Graph) API. The only place
 * in the codebase that knows Meta's endpoint paths, field lists, and OAuth
 * mechanics - use cases and controllers depend only on the gateway port.
 */
export class MetaAdsProvider implements MetaAdsGateway {
  readonly provider = 'meta' as const;

  constructor(
    private readonly client: MetaGraphHttpClient,
    private readonly oauth: MetaOAuthConfig,
  ) {}

  buildAuthorizationUrl(state: string): string {
    const url = new URL('/v19.0/dialog/oauth', this.oauth.oauthDialogBaseUrl);
    url.searchParams.set('client_id', this.oauth.appId);
    url.searchParams.set('redirect_uri', this.oauth.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', OAUTH_SCOPES);
    url.searchParams.set('response_type', 'code');
    return url.toString();
  }

  async exchangeCodeForLongLivedToken(code: string): Promise<MetaOAuthTokenExchangeResult> {
    const shortLived = parseTokenExchangeResponse(
      await this.client.getPublic('/oauth/access_token', {
        client_id: this.oauth.appId,
        client_secret: this.oauth.appSecret,
        redirect_uri: this.oauth.redirectUri,
        code,
      }),
    );

    const longLived = parseTokenExchangeResponse(
      await this.client.getPublic('/oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: this.oauth.appId,
        client_secret: this.oauth.appSecret,
        fb_exchange_token: shortLived.accessToken,
      }),
    );

    return {
      accessToken: longLived.accessToken,
      expiresAt: new Date(Date.now() + longLived.expiresInSeconds * 1000),
    };
  }

  async listAdAccounts(accessToken: string): Promise<MetaAdAccountSummary[]> {
    const rows = await this.client.getAllPages('/me/adaccounts', { fields: AD_ACCOUNT_FIELDS }, accessToken);
    return parseAdAccounts(rows);
  }

  async fetchCampaigns(accessToken: string, adAccountId: string, currency: string): Promise<RawCampaignRecord[]> {
    const rows = await this.client.getAllPages(
      `/${adAccountId}/campaigns`,
      { fields: CAMPAIGN_FIELDS },
      accessToken,
    );
    return parseCampaigns(rows, currency);
  }

  async fetchAdSets(accessToken: string, adAccountId: string, currency: string): Promise<RawAdSetRecord[]> {
    const rows = await this.client.getAllPages(`/${adAccountId}/adsets`, { fields: ADSET_FIELDS }, accessToken);
    return parseAdSets(rows, currency);
  }

  async fetchAds(accessToken: string, adAccountId: string): Promise<RawAdRecord[]> {
    const rows = await this.client.getAllPages(`/${adAccountId}/ads`, { fields: AD_FIELDS }, accessToken);
    return parseAds(rows);
  }

  async fetchDailyInsights(
    accessToken: string,
    adAccountId: string,
    sinceDaysAgo: number,
  ): Promise<RawDailyInsightRecord[]> {
    const rows = await this.client.getAllPages(
      `/${adAccountId}/insights`,
      {
        level: 'campaign',
        time_increment: '1',
        fields: INSIGHT_FIELDS,
        date_preset: datePresetFor(sinceDaysAgo),
      },
      accessToken,
    );
    return parseDailyInsights(rows);
  }
}

function datePresetFor(sinceDaysAgo: number): string {
  // Meta's named presets cover the common windows the sync job re-pulls
  // (attribution gets revised for several days after the fact); an
  // arbitrary N would need `time_range` instead of `date_preset`.
  if (sinceDaysAgo <= 7) return 'last_7d';
  if (sinceDaysAgo <= 14) return 'last_14d';
  if (sinceDaysAgo <= 30) return 'last_30d';
  return 'last_90d';
}
