/**
 * Browser-side fetch helpers for the stateless serverless integration
 * (src/app/api/elogistia/*, src/app/api/meta/*). These call same-origin
 * Route Handlers only - no credentials ever pass through this module, the
 * API keys stay server-side in src/lib/serverless/*. Every call uses
 * `cache: 'no-store'` so a dashboard "refresh" is always a real live fetch,
 * never a cached response.
 */

export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string; kind?: string };

async function safeFetch<T>(url: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    if (!res.ok) {
      const error = typeof body.error === 'string' ? body.error : `Request failed (${res.status})`;
      return { ok: false, error, kind: typeof body.kind === 'string' ? body.kind : undefined };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export type DeliveryStatus =
  | 'pending'
  | 'in_transit'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'lost'
  | 'exception'
  | 'unknown';

export interface OrderDTO {
  externalOrderId: string | null;
  trackingNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  commune: string | null;
  wilaya: string | null;
  deliveryFee: number | null;
  rawStatus: string;
  status: DeliveryStatus;
}

export interface OrdersResponse {
  orders: OrderDTO[];
  count: number;
}

export interface StatusDTO {
  trackingNumber: string;
  rawStatus: string;
  status: DeliveryStatus;
  occurredAt: string | null;
}

export interface StatusesResponse {
  statuses: StatusDTO[];
  count: number;
}

export interface TrackingHistoryResponse {
  trackingNumber: string;
  currentStatus: DeliveryStatus;
  currentRawStatus: string;
  history: Array<{ rawStatus: string; status: DeliveryStatus; occurredAt: string | null }>;
}

export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'UNKNOWN';

export interface CampaignDTO {
  externalCampaignId: string;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  rawStatus: string;
  dailyBudget: number | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
}

export interface CampaignsResponse {
  campaigns: CampaignDTO[];
  active: CampaignDTO[];
  paused: CampaignDTO[];
  stopped: CampaignDTO[];
}

export interface InsightRow {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctrPct: number | null;
  cpc: number | null;
  purchases: number;
  purchaseValue: number;
  roas: number | null;
  currency: string | null;
}

export interface InsightTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ctrPct: number | null;
  cpc: number | null;
  purchases: number;
  purchaseValue: number;
  roas: number | null;
  currency: string | null;
}

export interface InsightsResponse {
  datePreset: string;
  rows: InsightRow[];
  totals: InsightTotals;
}

export const fetchOrders = (trackingNumber?: string) =>
  safeFetch<OrdersResponse>(`/api/elogistia/orders${trackingNumber ? `?tracking=${encodeURIComponent(trackingNumber)}` : ''}`);

export const fetchStatuses = (trackingNumbers: string[]) =>
  safeFetch<StatusesResponse>(`/api/elogistia/statuses?trackingNumbers=${encodeURIComponent(trackingNumbers.join(','))}`);

export const fetchTrackingHistory = (trackingNumber: string) =>
  safeFetch<TrackingHistoryResponse>(`/api/elogistia/tracking?trackingNumber=${encodeURIComponent(trackingNumber)}`);

export const fetchCampaigns = () => safeFetch<CampaignsResponse>('/api/meta/campaigns');

export const fetchInsights = (datePreset?: string) =>
  safeFetch<InsightsResponse>(`/api/meta/insights${datePreset ? `?datePreset=${encodeURIComponent(datePreset)}` : ''}`);
