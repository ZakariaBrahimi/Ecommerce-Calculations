import { formatNumber, formatPercent } from '@/lib/format';
import type { OverviewDashboard } from '@/lib/backendClient';

function FunnelCard({
  step,
  name,
  value,
  rate,
  rateLabel,
  barPct,
  barColor,
  tone = 'default',
}: {
  step: number;
  name: string;
  value: number;
  rate: string;
  rateLabel: string;
  barPct: number;
  barColor: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className={`flex flex-1 flex-col gap-2.5 rounded-md border p-4 ${
        tone === 'warning' ? 'border-amber/30 bg-amber-tint' : 'border-border bg-[#F1F5F9]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full font-sora text-xs font-bold text-white ${
            tone === 'warning' ? 'bg-amber' : 'bg-navy'
          }`}
        >
          {step}
        </span>
        <span className="text-sm font-bold text-ink-1">{name}</span>
      </div>
      <div className={`num text-2xl font-bold ${tone === 'warning' ? 'text-amber' : 'text-ink-1'}`}>
        {formatNumber(value)}
      </div>
      <div className="text-xs text-ink-2">
        <b className="num font-semibold text-ink-1">{rate}</b> {rateLabel}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full ${tone === 'warning' ? 'bg-amber' : 'bg-teal'}`}
          style={{ width: `${Math.min(100, barPct)}%` }}
        />
      </div>
    </div>
  );
}

export function DeliveryFunnel({ orders }: { orders: OverviewDashboard['orders'] }) {
  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-md">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-sora text-lg font-bold text-ink-1">Delivery funnel</h2>
          <p className="mt-1 text-sm text-ink-2">Where confirmed orders actually end up, COD attempt included.</p>
        </div>
        <span className="rounded-md bg-teal-tint px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-teal-strong">
          {formatNumber(orders.received)} orders received
        </span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <FunnelCard
          step={1}
          name="Received"
          value={orders.received}
          rate="100%"
          rateLabel="orders placed this period"
          barPct={100}
          barColor="navy"
        />
        <FunnelCard
          step={2}
          name="Confirmed"
          value={orders.confirmed}
          rate={formatPercent(orders.confirmationRatePct)}
          rateLabel="of received"
          barPct={orders.confirmationRatePct ?? 0}
          barColor="teal"
        />
        <FunnelCard
          step={3}
          name="Delivered"
          value={orders.delivered}
          rate={formatPercent(orders.deliveryRatePct)}
          rateLabel="of confirmed"
          barPct={orders.deliveryRatePct ?? 0}
          barColor="emerald"
        />
      </div>

      <div className="mt-4 flex justify-center">
        <div className="w-full max-w-sm">
          <FunnelCard
            step={4}
            name="Returned"
            value={orders.returned}
            rate={formatPercent(
              orders.confirmed > 0 ? Math.round((orders.returned / orders.confirmed) * 1000) / 10 : null,
            )}
            rateLabel="of confirmed did not deliver"
            barPct={orders.confirmed > 0 ? (orders.returned / orders.confirmed) * 100 : 0}
            barColor="amber"
            tone="warning"
          />
        </div>
      </div>
    </section>
  );
}
