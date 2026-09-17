import { MetaResponseValidationError } from '../../../domain/errors/MetaAdsIntegrationErrors';
import {
  MetaAdAccountSummary,
  RawAdRecord,
  RawAdSetRecord,
  RawCampaignRecord,
  RawDailyInsightRecord,
  RawInsightAction,
} from '../../../domain/ports/MetaAdsGateway';
import { minorUnitsToAmount } from './currency';

interface GraphCampaignRow {
  id?: string;
  name?: string;
  objective?: string;
  effective_status?: string;
  daily_budget?: string;
  start_time?: string;
  stop_time?: string;
}

interface GraphAdSetRow {
  id?: string;
  campaign_id?: string;
  name?: string;
  effective_status?: string;
  daily_budget?: string;
  start_time?: string;
  end_time?: string;
}

interface GraphAdRow {
  id?: string;
  adset_id?: string;
  campaign_id?: string;
  name?: string;
  effective_status?: string;
}

interface GraphActionRow {
  action_type?: string;
  value?: string;
}

interface GraphInsightRow {
  campaign_id?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  account_currency?: string;
  actions?: GraphActionRow[];
}

interface GraphAdAccountRow {
  id?: string;
  name?: string;
  currency?: string;
  account_status?: number;
}

export function parseCampaigns(rows: unknown[], currency: string | null): RawCampaignRecord[] {
  return (rows as GraphCampaignRow[]).map((row) => {
    if (!row.id || !row.name || !row.effective_status) {
      throw new MetaResponseValidationError('Meta campaign row is missing id/name/effective_status');
    }
    return {
      externalCampaignId: row.id,
      name: row.name,
      objective: row.objective ?? null,
      effectiveStatus: row.effective_status,
      dailyBudget: row.daily_budget ? minorUnitsToAmount(Number(row.daily_budget), currency) : null,
      currency,
      startDate: parseGraphDate(row.start_time),
      endDate: parseGraphDate(row.stop_time),
    };
  });
}

export function parseAdSets(rows: unknown[], currency: string | null): RawAdSetRecord[] {
  return (rows as GraphAdSetRow[]).map((row) => {
    if (!row.id || !row.campaign_id || !row.name || !row.effective_status) {
      throw new MetaResponseValidationError('Meta ad set row is missing required fields');
    }
    return {
      externalAdSetId: row.id,
      externalCampaignId: row.campaign_id,
      name: row.name,
      effectiveStatus: row.effective_status,
      dailyBudget: row.daily_budget ? minorUnitsToAmount(Number(row.daily_budget), currency) : null,
      startDate: parseGraphDate(row.start_time),
      endDate: parseGraphDate(row.end_time),
    };
  });
}

export function parseAds(rows: unknown[]): RawAdRecord[] {
  return (rows as GraphAdRow[]).map((row) => {
    if (!row.id || !row.adset_id || !row.campaign_id || !row.name || !row.effective_status) {
      throw new MetaResponseValidationError('Meta ad row is missing required fields');
    }
    return {
      externalAdId: row.id,
      externalAdSetId: row.adset_id,
      externalCampaignId: row.campaign_id,
      name: row.name,
      effectiveStatus: row.effective_status,
    };
  });
}

export function parseDailyInsights(rows: unknown[]): RawDailyInsightRecord[] {
  return (rows as GraphInsightRow[]).map((row) => {
    if (!row.campaign_id || !row.date_start) {
      throw new MetaResponseValidationError('Meta insight row is missing campaign_id/date_start');
    }
    const actions: RawInsightAction[] = (row.actions ?? [])
      .filter((a): a is Required<GraphActionRow> => Boolean(a.action_type && a.value !== undefined))
      .map((a) => ({ actionType: a.action_type, value: Number(a.value) }));

    return {
      externalCampaignId: row.campaign_id,
      date: parseGraphDate(row.date_start) ?? new Date(row.date_start),
      // Insights `spend` is already in standard decimal notation, unlike
      // campaign/ad set budget fields - see currency.ts's doc comment.
      spend: row.spend ? Number(row.spend) : 0,
      impressions: row.impressions ? Number(row.impressions) : 0,
      clicks: row.clicks ? Number(row.clicks) : 0,
      currency: row.account_currency ?? null,
      actions,
    };
  });
}

export function parseAdAccounts(rows: unknown[]): MetaAdAccountSummary[] {
  return (rows as GraphAdAccountRow[]).map((row) => {
    if (!row.id || !row.name) {
      throw new MetaResponseValidationError('Meta ad account row is missing id/name');
    }
    return {
      externalAdAccountId: row.id,
      name: row.name,
      currency: row.currency ?? 'USD',
      accountStatus: row.account_status !== undefined ? String(row.account_status) : 'unknown',
    };
  });
}

export function parseTokenExchangeResponse(body: unknown): { accessToken: string; expiresInSeconds: number } {
  const parsed = body as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) {
    throw new MetaResponseValidationError('Meta OAuth token response is missing access_token');
  }
  return {
    accessToken: parsed.access_token,
    // Meta omits expires_in for a handful of token types (implying no
    // expiry) - default to the standard long-lived-token lifetime (~60
    // days) rather than treating the token as permanent.
    expiresInSeconds: parsed.expires_in ?? 60 * 24 * 60 * 60,
  };
}

function parseGraphDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
