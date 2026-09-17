export interface MetaOAuthTokenExchangeResult {
  accessToken: string;
  expiresAt: Date;
}

export interface MetaAdAccountSummary {
  externalAdAccountId: string; // e.g. "act_123456789"
  name: string;
  currency: string;
  accountStatus: string;
}

export interface RawCampaignRecord {
  externalCampaignId: string;
  name: string;
  objective: string | null;
  effectiveStatus: string;
  dailyBudget: number | null;
  currency: string | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface RawAdSetRecord {
  externalAdSetId: string;
  externalCampaignId: string;
  name: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface RawAdRecord {
  externalAdId: string;
  externalAdSetId: string;
  externalCampaignId: string;
  name: string;
  effectiveStatus: string;
}

export interface RawInsightAction {
  actionType: string;
  value: number;
}

export interface RawDailyInsightRecord {
  externalCampaignId: string;
  date: Date;
  spend: number;
  impressions: number;
  clicks: number;
  currency: string | null;
  actions: RawInsightAction[];
  /** Meta's per-action_type attributed revenue (`action_values`) - paired with `actions` by actionType, see extractPurchases. */
  actionValues: RawInsightAction[];
}

/**
 * Port for talking to Meta's Marketing (Graph) API. Implementations own
 * OAuth transport, HTTP calls, rate limiting and retries - the application
 * layer only ever calls this interface, never `fetch` or an SDK directly.
 */
export interface MetaAdsGateway {
  readonly provider: 'meta';

  buildAuthorizationUrl(state: string): string;

  /** Exchanges an OAuth `code` for a short-lived token, then that for a long-lived one. */
  exchangeCodeForLongLivedToken(code: string): Promise<MetaOAuthTokenExchangeResult>;

  listAdAccounts(accessToken: string): Promise<MetaAdAccountSummary[]>;

  /** `currency` is the ad account's currency (Meta doesn't return it per-campaign) - stamps RawCampaignRecord.currency. */
  fetchCampaigns(accessToken: string, adAccountId: string, currency: string): Promise<RawCampaignRecord[]>;
  fetchAdSets(accessToken: string, adAccountId: string, currency: string): Promise<RawAdSetRecord[]>;
  fetchAds(accessToken: string, adAccountId: string): Promise<RawAdRecord[]>;

  /** Pulls a rolling window (e.g. last 7 days) since Meta revises attribution after the fact. */
  fetchDailyInsights(accessToken: string, adAccountId: string, sinceDaysAgo: number): Promise<RawDailyInsightRecord[]>;
}
