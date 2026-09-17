'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney, formatMultiplier, formatNumber, formatPercent } from '@/lib/format';
import {
  CampaignDTO,
  fetchCampaigns,
  fetchInsights,
  fetchOrders,
  fetchStatuses,
  fetchTrackingHistory,
  FetchResult,
  InsightRow,
  OrderDTO,
  StatusDTO,
  TrackingHistoryResponse,
  CampaignsResponse,
  InsightsResponse,
  OrdersResponse,
  StatusesResponse,
} from '@/lib/liveClient';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_transit: 'In transit',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
  lost: 'Lost',
  exception: 'Needs attention',
  unknown: 'Unknown',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-ink-3',
  in_transit: 'text-indigo',
  delivered: 'text-emerald',
  returned: 'text-amber',
  cancelled: 'text-critical',
  lost: 'text-critical',
  exception: 'text-critical',
  unknown: 'text-ink-3',
};

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-critical/30 bg-critical/5 px-4 py-3 text-sm text-critical">{message}</div>
  );
}

function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 w-full animate-pulse rounded-md bg-[#F1F5F9]" />
      ))}
    </div>
  );
}

export function LiveDashboard() {
  const [ordersResult, setOrdersResult] = useState<FetchResult<OrdersResponse> | null>(null);
  const [statusesByTracking, setStatusesByTracking] = useState<Map<string, StatusDTO>>(new Map());
  const [statusesError, setStatusesError] = useState<string | null>(null);
  const [campaignsResult, setCampaignsResult] = useState<FetchResult<CampaignsResponse> | null>(null);
  const [insightsResult, setInsightsResult] = useState<FetchResult<InsightsResponse> | null>(null);

  const [ordersLoading, setOrdersLoading] = useState(true);
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);

  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [trackingPanel, setTrackingPanel] = useState<{ trackingNumber: string; result: FetchResult<TrackingHistoryResponse> | 'loading' } | null>(null);

  const loadAll = useCallback(async () => {
    setOrdersLoading(true);
    setCampaignsLoading(true);
    setInsightsLoading(true);
    setStatusesByTracking(new Map());
    setStatusesError(null);

    // Three independent upstream calls (Elogistia orders, Meta campaigns,
    // Meta insights) fetched in parallel - none depends on the others.
    const [orders, campaigns, insights] = await Promise.all([fetchOrders(), fetchCampaigns(), fetchInsights()]);

    setOrdersResult(orders);
    setOrdersLoading(false);
    setCampaignsResult(campaigns);
    setCampaignsLoading(false);
    setInsightsResult(insights);
    setInsightsLoading(false);
    setLastLoadedAt(new Date());

    // Statuses genuinely depend on the tracking numbers orders just
    // returned (Elogistia's order-list shape has no usable status field of
    // its own - see elogistiaNormalize.ts) - this call runs after orders,
    // but still in parallel with nothing left to wait on at this point.
    if (orders.ok && orders.data.orders.length > 0) {
      setStatusesLoading(true);
      const trackingNumbers = orders.data.orders.map((o) => o.trackingNumber).filter(Boolean);
      const statuses = await fetchStatuses(trackingNumbers);
      if (statuses.ok) {
        setStatusesByTracking(new Map(statuses.data.statuses.map((s) => [s.trackingNumber, s])));
      } else {
        setStatusesError(statuses.error);
      }
      setStatusesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function openTracking(trackingNumber: string) {
    setTrackingPanel({ trackingNumber, result: 'loading' });
    const result = await fetchTrackingHistory(trackingNumber);
    setTrackingPanel({ trackingNumber, result });
  }

  const insightsByCampaignId = new Map((insightsResult?.ok ? insightsResult.data.rows : []).map((r) => [r.campaignId, r]));

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-strong">Live · no database</p>
          <h1 className="mt-1 font-sora text-[28px] font-bold text-ink-1">Serverless integration</h1>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-2">
            Every section below is fetched directly from Elogistia and Meta on this page load - nothing is
            persisted or cached between visits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastLoadedAt && <span className="text-xs text-ink-3">Last loaded {lastLoadedAt.toLocaleTimeString()}</span>}
          <button
            onClick={loadAll}
            disabled={ordersLoading || campaignsLoading || insightsLoading}
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-strong disabled:opacity-60"
          >
            {ordersLoading || campaignsLoading || insightsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Meta campaigns + insights, joined client-side by campaignId */}
      <section className="mb-6 rounded-lg border border-border bg-white p-6 shadow-md">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-sora text-lg font-bold text-ink-1">Meta Ads campaigns</h2>
          {insightsResult?.ok && (
            <span className="rounded-md bg-teal-tint px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-teal-strong">
              {insightsResult.data.datePreset.replace('_', ' ')}
            </span>
          )}
        </div>

        {campaignsLoading || insightsLoading ? (
          <SkeletonRows />
        ) : !campaignsResult?.ok ? (
          <ErrorBanner message={`Campaigns: ${campaignsResult?.error ?? 'unknown error'}`} />
        ) : (
          <>
            {!insightsResult?.ok && <ErrorBanner message={`Insights: ${insightsResult?.error ?? 'unknown error'}`} />}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-ink-3">
                    <th className="px-3 pb-2.5">Campaign</th>
                    <th className="px-3 pb-2.5 text-right">Daily budget</th>
                    <th className="px-3 pb-2.5 text-right">Spend</th>
                    <th className="px-3 pb-2.5 text-right">Impressions</th>
                    <th className="px-3 pb-2.5 text-right">Clicks</th>
                    <th className="px-3 pb-2.5 text-right">CTR</th>
                    <th className="px-3 pb-2.5 text-right">CPC</th>
                    <th className="px-3 pb-2.5 text-right">Purchases</th>
                    <th className="px-3 pb-2.5 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignsResult.data.campaigns.map((c: CampaignDTO) => {
                    const insight: InsightRow | undefined = insightsByCampaignId.get(c.externalCampaignId);
                    return (
                      <tr key={c.externalCampaignId} className="border-b border-border last:border-none hover:bg-[#F1F5F9]">
                        <td className="px-3 py-3.5">
                          <div className="flex flex-col gap-1">
                            <strong className="text-sm font-semibold text-ink-1">{c.name}</strong>
                            <span
                              className={`inline-flex w-fit items-center gap-1.5 text-[11px] font-bold ${
                                c.status === 'ACTIVE' ? 'text-emerald' : c.status === 'PAUSED' ? 'text-ink-3' : 'text-critical'
                              }`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {c.status[0] + c.status.slice(1).toLowerCase()}
                            </span>
                          </div>
                        </td>
                        <td className="num px-3 py-3.5 text-right text-sm font-semibold text-ink-1">
                          {formatMoney(c.dailyBudget, c.currency)}
                        </td>
                        <td className="num px-3 py-3.5 text-right text-sm font-semibold text-ink-1">
                          {formatMoney(insight?.spend ?? null, c.currency)}
                        </td>
                        <td className="num px-3 py-3.5 text-right text-sm text-ink-2">{formatNumber(insight?.impressions ?? null)}</td>
                        <td className="num px-3 py-3.5 text-right text-sm text-ink-2">{formatNumber(insight?.clicks ?? null)}</td>
                        <td className="num px-3 py-3.5 text-right text-sm text-ink-2">{formatPercent(insight?.ctrPct ?? null)}</td>
                        <td className="num px-3 py-3.5 text-right text-sm text-ink-2">{formatMoney(insight?.cpc ?? null, c.currency)}</td>
                        <td className="num px-3 py-3.5 text-right text-sm font-semibold text-ink-1">{formatNumber(insight?.purchases ?? null)}</td>
                        <td className="num px-3 py-3.5 text-right text-sm font-semibold text-emerald">
                          {formatMultiplier(insight?.roas ?? null)}
                        </td>
                      </tr>
                    );
                  })}
                  {campaignsResult.data.campaigns.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-sm text-ink-3">
                        No campaigns found on this ad account.
                      </td>
                    </tr>
                  )}
                </tbody>
                {insightsResult?.ok && campaignsResult.data.campaigns.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border font-bold text-ink-1">
                      <td className="px-3 py-3">Totals</td>
                      <td className="px-3 py-3" />
                      <td className="num px-3 py-3 text-right">{formatMoney(insightsResult.data.totals.spend, insightsResult.data.totals.currency ?? '')}</td>
                      <td className="num px-3 py-3 text-right">{formatNumber(insightsResult.data.totals.impressions)}</td>
                      <td className="num px-3 py-3 text-right">{formatNumber(insightsResult.data.totals.clicks)}</td>
                      <td className="num px-3 py-3 text-right">{formatPercent(insightsResult.data.totals.ctrPct)}</td>
                      <td className="num px-3 py-3 text-right">{formatMoney(insightsResult.data.totals.cpc, insightsResult.data.totals.currency ?? '')}</td>
                      <td className="num px-3 py-3 text-right">{formatNumber(insightsResult.data.totals.purchases)}</td>
                      <td className="num px-3 py-3 text-right text-emerald">{formatMultiplier(insightsResult.data.totals.roas)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </section>

      {/* Elogistia orders + live statuses */}
      <section className="rounded-lg border border-border bg-white p-6 shadow-md">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-sora text-lg font-bold text-ink-1">Elogistia orders</h2>
          {ordersResult?.ok && (
            <span className="rounded-md bg-teal-tint px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-teal-strong">
              {ordersResult.data.count} orders
            </span>
          )}
        </div>

        {ordersLoading ? (
          <SkeletonRows rows={6} />
        ) : !ordersResult?.ok ? (
          <ErrorBanner message={`Orders: ${ordersResult?.error ?? 'unknown error'}`} />
        ) : (
          <>
            {statusesError && <div className="mb-3"><ErrorBanner message={`Statuses: ${statusesError}`} /></div>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-ink-3">
                    <th className="px-3 pb-2.5">Tracking</th>
                    <th className="px-3 pb-2.5">Customer</th>
                    <th className="px-3 pb-2.5">Wilaya / commune</th>
                    <th className="px-3 pb-2.5 text-right">Delivery fee</th>
                    <th className="px-3 pb-2.5">Status</th>
                    <th className="px-3 pb-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {ordersResult.data.orders.map((o: OrderDTO) => {
                    const liveStatus = statusesByTracking.get(o.trackingNumber);
                    const status = liveStatus?.status ?? o.status;
                    return (
                      <tr key={o.trackingNumber} className="border-b border-border last:border-none hover:bg-[#F1F5F9]">
                        <td className="px-3 py-3 font-mono text-xs text-ink-2">{o.trackingNumber}</td>
                        <td className="px-3 py-3 text-sm text-ink-1">{o.customerName ?? '—'}</td>
                        <td className="px-3 py-3 text-sm text-ink-2">
                          {[o.wilaya, o.commune].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="num px-3 py-3 text-right text-sm text-ink-2">{formatMoney(o.deliveryFee, 'DZD')}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${STATUS_STYLE[status]}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {statusesLoading && !liveStatus ? 'Checking…' : STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => openTracking(o.trackingNumber)}
                            className="text-xs font-semibold text-teal-strong hover:underline"
                          >
                            View history
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {ordersResult.data.orders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-ink-3">
                        No orders returned by Elogistia.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {trackingPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setTrackingPanel(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-sora text-base font-bold text-ink-1">Tracking history</h3>
              <button onClick={() => setTrackingPanel(null)} className="text-sm text-ink-3 hover:text-ink-1">
                Close
              </button>
            </div>
            <p className="mb-3 font-mono text-xs text-ink-2">{trackingPanel.trackingNumber}</p>

            {trackingPanel.result === 'loading' ? (
              <SkeletonRows rows={3} />
            ) : !trackingPanel.result.ok ? (
              <ErrorBanner message={trackingPanel.result.error} />
            ) : trackingPanel.result.data.history.length === 0 ? (
              <p className="text-sm text-ink-3">No history events returned.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {trackingPanel.result.data.history.map((event, i) => (
                  <li key={i} className="border-l-2 border-teal pl-3">
                    <p className={`text-sm font-semibold ${STATUS_STYLE[event.status]}`}>{event.rawStatus || STATUS_LABEL[event.status]}</p>
                    <p className="text-xs text-ink-3">{event.occurredAt ? formatDate(event.occurredAt) : 'Date unknown'}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
