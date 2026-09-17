/**
 * Every call in this file runs server-side only (Server Components, Route
 * Handlers) - the backend's real URL and the INTERNAL_API_TOKEN used to
 * mint a demo session never reach client-side JavaScript. This is a
 * deliberate backend-for-frontend pattern: the browser only ever talks to
 * this Next.js app's own origin, so the backend's CORS policy doesn't even
 * need to allow it for the main dashboard flow (see
 * docs/deployment-vercel-frontend.md).
 */

function backendUrl(): string {
  const url = process.env.BACKEND_API_URL;
  if (!url) throw new Error('Missing required environment variable: BACKEND_API_URL');
  return url.replace(/\/$/, '');
}

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BackendRequestError';
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10_000),
    // Dashboard data changes on the backend's own sync schedule, not on every
    // page load - Next.js should not cache these calls indefinitely, but
    // there's no need to hit the backend more than once every few seconds
    // per viewer either.
    next: { revalidate: 15 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new BackendRequestError(`Backend request to ${path} failed (${response.status}): ${body}`, response.status);
  }

  return (await response.json()) as T;
}

export interface DemoTokenResult {
  tenantId: string;
  token: string;
  expiresInSeconds: number;
}

/** Server-only: mints a demo tenant session. Requires INTERNAL_API_TOKEN and ENABLE_DEMO_AUTH=true on the backend. */
export async function mintDemoToken(tenantId: string): Promise<DemoTokenResult> {
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) throw new Error('Missing required environment variable: INTERNAL_API_TOKEN');

  return request<DemoTokenResult>('/api/auth/demo-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${internalToken}` },
    body: JSON.stringify({ tenantId }),
  });
}

export interface OverviewDashboard {
  orders: {
    received: number;
    confirmed: number;
    delivered: number;
    returned: number;
    confirmationRatePct: number | null;
    deliveryRatePct: number | null;
    overallSuccessRatePct: number | null;
  };
  finance: {
    revenue: number;
    productCost: number;
    deliveryCost: number;
    adsCost: number;
    totalCost: number;
    netProfit: number;
    profitMarginPct: number | null;
    roas: number | null;
    profitPerDeliveredOrder: number | null;
    cac: number | null;
    currency: string;
  };
}

export function getOverview(sessionToken: string): Promise<OverviewDashboard> {
  return request<OverviewDashboard>('/api/overview', {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

export interface CampaignRow {
  campaignId: string;
  externalCampaignId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
  dailyBudget: number | null;
  spentAmount: number;
  impressions: number;
  clicks: number;
  ctrPct: number | null;
  cpc: number | null;
  resultsCount: number;
  costPerResult: number | null;
  purchases: number;
  purchaseValue: number;
  roas: number | null;
  startDate: string | null;
  endDate: string | null;
  currency: string | null;
}

export interface CampaignDashboard {
  active: CampaignRow[];
  paused: CampaignRow[];
  stopped: CampaignRow[];
}

export function getCampaignDashboard(sessionToken: string): Promise<CampaignDashboard> {
  return request<CampaignDashboard>('/api/meta-ads/dashboard', {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}
