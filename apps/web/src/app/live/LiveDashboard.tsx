'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney, formatMultiplier, formatNumber, formatPercent } from '@/lib/format';
import {
  CampaignDTO,
  fetchCampaigns,
  fetchInsights,
  fetchProductSummary,
  FetchResult,
  InsightRow,
  CampaignsResponse,
  InsightsResponse,
  ProductSummaryDTO,
  ProductSummaryResponse,
} from '@/lib/liveClient';
import { loadProductConfig, saveProductConfig, ProductConfig, ProductConfigMap } from '@/lib/productConfigStorage';
import { CampaignMultiSelect } from './CampaignMultiSelect';

// Confirmed with the account owner - Meta ad spend is billed in USD here.
// Fixed, not live-fetched (no persistence, no FX API in scope) - update this
// if the real rate moves meaningfully.
const USD_TO_DZD_RATE = 250;

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyConfig(displayName: string): ProductConfig {
  return { displayName, campaignIds: [], buyPrice: null, sellPrice: null };
}

export function LiveDashboard() {
  const [productsResult, setProductsResult] = useState<FetchResult<ProductSummaryResponse> | null>(null);
  const [campaignsResult, setCampaignsResult] = useState<FetchResult<CampaignsResponse> | null>(null);
  const [insightsResult, setInsightsResult] = useState<FetchResult<InsightsResponse> | null>(null);

  const [productsLoading, setProductsLoading] = useState(true);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const [config, setConfig] = useState<ProductConfigMap>({});
  const [configLoaded, setConfigLoaded] = useState(false);

  // localStorage only exists in the browser - loaded once after mount, never during SSR.
  useEffect(() => {
    setConfig(loadProductConfig());
    setConfigLoaded(true);
  }, []);

  const loadAll = useCallback(async () => {
    setProductsLoading(true);
    setCampaignsLoading(true);
    setInsightsLoading(true);

    // Three independent upstream calls (Elogistia's per-product summary,
    // Meta campaigns, Meta insights) fetched in parallel - none depends on
    // the others. Which campaign(s) fund which product is a client-side,
    // user-maintained link (config, below) - Elogistia and Meta have no
    // shared identifier to join on automatically.
    const [products, campaigns, insights] = await Promise.all([fetchProductSummary(), fetchCampaigns(), fetchInsights()]);

    setProductsResult(products);
    setProductsLoading(false);
    setCampaignsResult(campaigns);
    setCampaignsLoading(false);
    setInsightsResult(insights);
    setInsightsLoading(false);
    setLastLoadedAt(new Date());
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function updateConfig(productKey: string, fallbackName: string, patch: Partial<ProductConfig>) {
    setConfig((prev) => {
      const current = prev[productKey] ?? emptyConfig(fallbackName);
      const next = { ...prev, [productKey]: { ...current, ...patch } };
      saveProductConfig(next);
      return next;
    });
  }

  const isLoading = productsLoading || campaignsLoading || insightsLoading || !configLoaded;
  const insightsByCampaignId = new Map((insightsResult?.ok ? insightsResult.data.rows : []).map((r) => [r.campaignId, r]));
  const campaigns = campaignsResult?.ok ? campaignsResult.data.campaigns : [];

  const linkedCampaignIds = new Set(
    productsResult?.ok ? Object.values(config).flatMap((c) => c.campaignIds) : [],
  );
  const unlinkedCampaigns = campaigns.filter((c) => !linkedCampaignIds.has(c.externalCampaignId));
  const unlinkedSpendDZD = round2(
    unlinkedCampaigns.reduce((sum, c) => {
      const insight = insightsByCampaignId.get(c.externalCampaignId);
      if (!insight) return sum;
      const rate = insight.currency === 'USD' ? USD_TO_DZD_RATE : 1;
      return sum + insight.spend * rate;
    }, 0),
  );

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-strong">Live · no database</p>
          <h1 className="mt-1 font-sora text-[28px] font-bold text-ink-1">Serverless integration</h1>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-2">
            Delivery outcomes are fetched directly from Elogistia and aggregated per product on every load; which
            campaign(s) fund each product, and buy/sell price, are saved in this browser only.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastLoadedAt && <span className="text-xs text-ink-3">Last loaded {lastLoadedAt.toLocaleTimeString()}</span>}
          <button
            onClick={loadAll}
            disabled={isLoading}
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-strong disabled:opacity-60"
          >
            {isLoading ? 'Loading…' : 'Refresh'}
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

      {/* Per-product delivery outcomes + profit, linked to campaign(s) you pick */}
      <section className="rounded-lg border border-border bg-white p-6 shadow-md">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-sora text-lg font-bold text-ink-1">Product performance</h2>
          {productsResult?.ok && (
            <span className="rounded-md bg-teal-tint px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-teal-strong">
              {productsResult.data.products.length} products
            </span>
          )}
        </div>
        <p className="mb-4 text-xs text-ink-3">
          Product name, linked campaigns, and buy/sell price are editable and saved in this browser only.
        </p>

        {productsLoading || campaignsLoading || insightsLoading || !configLoaded ? (
          <SkeletonRows rows={5} />
        ) : !productsResult?.ok ? (
          <ErrorBanner message={`Elogistia: ${productsResult?.error ?? 'unknown error'}`} />
        ) : (
          <>
            {unlinkedCampaigns.length > 0 && (
              <p className="mb-3 rounded-md bg-amber-tint px-3 py-2 text-xs text-ink-2">
                {unlinkedCampaigns.length} campaign{unlinkedCampaigns.length === 1 ? '' : 's'} not linked to a product yet
                ({formatMoney(unlinkedSpendDZD, 'DZD')} spend excluded from the costs below) — link them in the table.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px] border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-ink-3">
                    <th className="px-3 pb-2.5">Product</th>
                    <th className="px-3 pb-2.5">Linked campaign(s)</th>
                    <th className="px-3 pb-2.5 text-right">Delivered</th>
                    <th className="px-3 pb-2.5 text-right">Returned</th>
                    <th className="px-3 pb-2.5 text-right">In transit</th>
                    <th className="px-3 pb-2.5 text-right">Delivered %</th>
                    <th className="px-3 pb-2.5 text-right">Returned %</th>
                    <th className="px-3 pb-2.5 text-right">In transit %</th>
                    <th className="px-3 pb-2.5 text-right">Ad spend</th>
                    <th className="px-3 pb-2.5 text-right">Cost / delivered</th>
                    <th className="px-3 pb-2.5 text-right">Buy price</th>
                    <th className="px-3 pb-2.5 text-right">Sell price</th>
                    <th className="px-3 pb-2.5 text-right">Profit / order</th>
                    <th className="px-3 pb-2.5 text-right">Total profit</th>
                    <th className="px-3 pb-2.5 text-right">Total cost</th>
                  </tr>
                </thead>
                <tbody>
                  {productsResult.data.products.map((p: ProductSummaryDTO) => {
                    const productConfig = config[p.productKey] ?? emptyConfig(p.productName);
                    const displayName = productConfig.displayName || p.productName;

                    const spendDZD = round2(
                      productConfig.campaignIds.reduce((sum, id) => {
                        const insight = insightsByCampaignId.get(id);
                        if (!insight) return sum;
                        const rate = insight.currency === 'USD' ? USD_TO_DZD_RATE : 1;
                        return sum + insight.spend * rate;
                      }, 0),
                    );

                    const costPerDelivered = p.delivered > 0 ? round2(spendDZD / p.delivered) : null;
                    const { buyPrice, sellPrice } = productConfig;
                    const netProfitPerOrder =
                      buyPrice != null && sellPrice != null && costPerDelivered != null
                        ? round2(sellPrice - buyPrice - costPerDelivered)
                        : null;
                    const totalNetProfit = netProfitPerOrder != null ? round2(netProfitPerOrder * p.delivered) : null;
                    const totalCost = round2((buyPrice ?? 0) * p.delivered + spendDZD);

                    const deliveredPct = p.total > 0 ? round2((p.delivered / p.total) * 100) : null;
                    const returnedPct = p.total > 0 ? round2((p.returned / p.total) * 100) : null;
                    const inTransitPct = p.total > 0 ? round2((p.inTransit / p.total) * 100) : null;

                    return (
                      <tr key={p.productKey} className="border-b border-border last:border-none align-top hover:bg-[#F1F5F9]">
                        <td className="px-3 py-3">
                          <input
                            value={displayName}
                            onChange={(e) => updateConfig(p.productKey, p.productName, { displayName: e.target.value })}
                            className="w-40 rounded-md border border-border px-2 py-1 text-sm text-ink-1 outline-none focus:border-teal"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <CampaignMultiSelect
                            campaigns={campaigns}
                            selectedIds={productConfig.campaignIds}
                            onChange={(campaignIds) => updateConfig(p.productKey, p.productName, { campaignIds })}
                          />
                        </td>
                        <td className="num px-3 py-3 text-right text-sm font-semibold text-emerald">{formatNumber(p.delivered)}</td>
                        <td className="num px-3 py-3 text-right text-sm font-semibold text-amber">{formatNumber(p.returned)}</td>
                        <td className="num px-3 py-3 text-right text-sm text-indigo">{formatNumber(p.inTransit)}</td>
                        <td className="num px-3 py-3 text-right text-sm text-ink-2">{formatPercent(deliveredPct)}</td>
                        <td className="num px-3 py-3 text-right text-sm text-ink-2">{formatPercent(returnedPct)}</td>
                        <td className="num px-3 py-3 text-right text-sm text-ink-2">{formatPercent(inTransitPct)}</td>
                        <td className="num px-3 py-3 text-right text-sm text-ink-1">{formatMoney(spendDZD, 'DZD')}</td>
                        <td className="num px-3 py-3 text-right text-sm text-ink-1">{formatMoney(costPerDelivered, 'DZD')}</td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            value={buyPrice ?? ''}
                            onChange={(e) =>
                              updateConfig(p.productKey, p.productName, {
                                buyPrice: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            placeholder="DZD"
                            className="w-24 rounded-md border border-border px-2 py-1 text-right text-sm text-ink-1 outline-none focus:border-teal"
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            value={sellPrice ?? ''}
                            onChange={(e) =>
                              updateConfig(p.productKey, p.productName, {
                                sellPrice: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            placeholder="DZD"
                            className="w-24 rounded-md border border-border px-2 py-1 text-right text-sm text-ink-1 outline-none focus:border-teal"
                          />
                        </td>
                        <td className="num px-3 py-3 text-right text-sm font-semibold text-ink-1">
                          {formatMoney(netProfitPerOrder, 'DZD')}
                        </td>
                        <td className={`num px-3 py-3 text-right text-sm font-semibold ${totalNetProfit != null && totalNetProfit < 0 ? 'text-critical' : 'text-emerald'}`}>
                          {formatMoney(totalNetProfit, 'DZD')}
                        </td>
                        <td className="num px-3 py-3 text-right text-sm text-ink-1">{formatMoney(totalCost, 'DZD')}</td>
                      </tr>
                    );
                  })}
                  {productsResult.data.products.length === 0 && (
                    <tr>
                      <td colSpan={15} className="py-8 text-center text-sm text-ink-3">
                        No orders with a recognized product name were found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
