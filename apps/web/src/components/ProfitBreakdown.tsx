import { formatMoney, formatMultiplier, formatPercent } from '@/lib/format';
import type { OverviewDashboard } from '@/lib/backendClient';

export function ProfitBreakdown({ finance }: { finance: OverviewDashboard['finance'] }) {
  const profitPositive = finance.netProfit >= 0;

  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-md">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-sora text-lg font-bold text-ink-1">Profit breakdown</h2>
          <p className="mt-1 text-sm text-ink-2">
            Revenue, split into product cost, delivery fees and ad spend - and what&apos;s left.
          </p>
        </div>
        <span className="rounded-md bg-teal-tint px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-teal-strong">
          {formatPercent(finance.profitMarginPct)} net margin
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-[#F1F5F9] p-5">
          <div className="text-xs font-semibold text-ink-2">Total revenue</div>
          <div className="num mt-1 text-xl font-bold text-ink-1">{formatMoney(finance.revenue, finance.currency)}</div>
          <div className="mt-4 flex flex-col gap-3 border-l-2 border-border pl-4">
            <LineItem label="Product cost (COGS)" value={formatMoney(finance.productCost, finance.currency)} />
            <LineItem label="Delivery cost" value={formatMoney(finance.deliveryCost, finance.currency)} />
            <LineItem label="Ads cost" value={formatMoney(finance.adsCost, finance.currency)} />
            <LineItem
              label="Net profit kept"
              value={formatMoney(finance.netProfit, finance.currency)}
              emphasize
              positive={profitPositive}
            />
          </div>
        </div>

        <div className="rounded-md border border-border p-5">
          <h3 className="mb-3 text-sm font-bold text-ink-1">Detailed calculation</h3>
          <CalcRow label="Revenue" value={formatMoney(finance.revenue, finance.currency)} />
          <CalcRow label="Product cost (COGS)" value={`−${formatMoney(finance.productCost, finance.currency)}`} />
          <CalcRow label="Delivery cost" value={`−${formatMoney(finance.deliveryCost, finance.currency)}`} />
          <CalcRow label="Ads cost" value={`−${formatMoney(finance.adsCost, finance.currency)}`} />
          <div className="mt-1 flex items-baseline justify-between border-t-2 border-ink-1 pt-3">
            <span className="text-sm font-bold text-ink-1">Net profit</span>
            <span className={`num text-base font-bold ${profitPositive ? 'text-emerald' : 'text-critical'}`}>
              {formatMoney(finance.netProfit, finance.currency)}
            </span>
          </div>
          <p className="mt-2 text-[11px] font-medium text-ink-3">
            Net margin {formatPercent(finance.profitMarginPct)} of revenue
          </p>
        </div>

        <div className="rounded-md border border-border p-5">
          <h3 className="mb-3 text-sm font-bold text-ink-1">Efficiency</h3>
          <CalcRow label="ROAS" value={formatMultiplier(finance.roas)} />
          <CalcRow label="Profit per delivered order" value={formatMoney(finance.profitPerDeliveredOrder, finance.currency)} />
          <CalcRow label="CAC" value={finance.cac === null ? 'Not tracked yet' : formatMoney(finance.cac, finance.currency)} />
          <div className="mt-4 rounded-md bg-teal-tint p-3 text-xs leading-relaxed text-teal-strong">
            Product cost is pulled per order at delivery time; ad spend is synced from Meta Ads. CAC needs
            distinct-customer tracking, which the orders module doesn&apos;t have yet - shown as &quot;not tracked&quot;
            rather than guessed.
          </div>
        </div>
      </div>
    </section>
  );
}

function LineItem({
  label,
  value,
  emphasize,
  positive,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${emphasize ? 'font-semibold text-ink-1' : 'text-ink-2'}`}>{label}</span>
      <span
        className={`num text-sm font-semibold ${
          emphasize ? (positive ? 'text-emerald' : 'text-critical') : 'text-ink-1'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function CalcRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-2 text-sm last:border-none">
      <span className="text-ink-2">{label}</span>
      <span className="num font-semibold text-ink-1">{value}</span>
    </div>
  );
}
