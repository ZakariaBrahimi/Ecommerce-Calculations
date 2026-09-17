import { Logger, LogMeta } from '../../../src/domain/ports/Logger';
import {
  DeliveryProviderGateway,
  RawDeliveryOrderRecord,
  RawDeliveryStatusRecord,
} from '../../../src/domain/ports/DeliveryProviderGateway';
import {
  MetaAdAccountSummary,
  MetaAdsGateway,
  MetaOAuthTokenExchangeResult,
  RawAdRecord,
  RawAdSetRecord,
  RawCampaignRecord,
  RawDailyInsightRecord,
} from '../../../src/domain/ports/MetaAdsGateway';

export class NoopLogger implements Logger {
  debug(_message: string, _meta?: LogMeta): void {}
  info(_message: string, _meta?: LogMeta): void {}
  warn(_message: string, _meta?: LogMeta): void {}
  error(_message: string, _meta?: LogMeta): void {}
  child(): Logger {
    return this;
  }
}

/** In-memory stand-in for a delivery provider - lets tests script exact API responses. */
export class FakeDeliveryProviderGateway implements DeliveryProviderGateway {
  readonly provider = 'fake-provider';
  validKeys = new Set<string>(['valid-key']);
  orders: RawDeliveryOrderRecord[] = [];
  statusesByTracking = new Map<string, RawDeliveryStatusRecord>();
  fetchOrderStatusesError: Error | undefined;

  async validateApiKey(apiKey: string): Promise<boolean> {
    return this.validKeys.has(apiKey);
  }

  async fetchOrders(_apiKey: string, params?: { trackingNumber?: string }): Promise<RawDeliveryOrderRecord[]> {
    if (params?.trackingNumber) {
      return this.orders.filter((o) => o.trackingNumber === params.trackingNumber);
    }
    return this.orders;
  }

  async fetchOrderStatuses(_apiKey: string, trackingNumbers: string[]): Promise<RawDeliveryStatusRecord[]> {
    if (this.fetchOrderStatusesError) throw this.fetchOrderStatusesError;
    return trackingNumbers
      .map((t) => this.statusesByTracking.get(t))
      .filter((s): s is RawDeliveryStatusRecord => Boolean(s));
  }
}

/** In-memory stand-in for Meta's Graph API - lets tests script exact responses without HTTP. */
export class FakeMetaAdsGateway implements MetaAdsGateway {
  readonly provider = 'meta' as const;
  tokenExchangeResult: MetaOAuthTokenExchangeResult = {
    accessToken: 'long-lived-token',
    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  };
  adAccounts: MetaAdAccountSummary[] = [
    { externalAdAccountId: 'act_1', name: 'My Store', currency: 'USD', accountStatus: '1' },
  ];
  campaigns: RawCampaignRecord[] = [];
  adSets: RawAdSetRecord[] = [];
  ads: RawAdRecord[] = [];
  insights: RawDailyInsightRecord[] = [];

  buildAuthorizationUrl(state: string): string {
    return `https://www.facebook.com/v19.0/dialog/oauth?state=${state}`;
  }

  async exchangeCodeForLongLivedToken(_code: string): Promise<MetaOAuthTokenExchangeResult> {
    return this.tokenExchangeResult;
  }

  async listAdAccounts(_accessToken: string): Promise<MetaAdAccountSummary[]> {
    return this.adAccounts;
  }

  async fetchCampaigns(_accessToken: string, _adAccountId: string, _currency: string): Promise<RawCampaignRecord[]> {
    return this.campaigns;
  }

  async fetchAdSets(_accessToken: string, _adAccountId: string, _currency: string): Promise<RawAdSetRecord[]> {
    return this.adSets;
  }

  async fetchAds(_accessToken: string, _adAccountId: string): Promise<RawAdRecord[]> {
    return this.ads;
  }

  async fetchDailyInsights(
    _accessToken: string,
    _adAccountId: string,
    _sinceDaysAgo: number,
  ): Promise<RawDailyInsightRecord[]> {
    return this.insights;
  }
}
