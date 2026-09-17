import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readSessionToken, tenantIdFromToken } from '@/lib/session';
import { getCampaignDashboard, getOverview, BackendRequestError } from '@/lib/backendClient';
import { formatMoney, formatMultiplier, formatNumber, formatPercent } from '@/lib/format';
import { TopBar } from '@/components/TopBar';
import { KpiCard } from '@/components/KpiCard';
import { DeliveryFunnel } from '@/components/DeliveryFunnel';
import { CampaignTable } from '@/components/CampaignTable';
import { ProfitBreakdown } from '@/components/ProfitBreakdown';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const token = readSessionToken(await cookies());
  if (!token) redirect('/login');

  let overview;
  let campaigns;
  try {
    [overview, campaigns] = await Promise.all([getOverview(token), getCampaignDashboard(token)]);
  } catch (err) {
    if (err instanceof BackendRequestError && err.status === 401) redirect('/login');
    throw err;
  }

  const { orders, finance } = overview;

  return (
    <div className="mx-auto max-w-[1280px] px-5">
      <TopBar tenantId={tenantIdFromToken(token)} />

      <div className="py-6">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-strong">Performance</p>
        <h1 className="mt-1 font-sora text-[28px] font-bold text-ink-1">Profitability overview</h1>
        <p className="mt-1 max-w-[46ch] text-sm text-ink-2">
          Every order, ad dinar and delivery outcome reconciled into one number: what you actually kept.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 pb-6 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Orders"
          value={formatNumber(orders.received)}
          sub={`${formatPercent(orders.overallSuccessRatePct)} delivered`}
          accent="navy"
          icon={<Bag />}
        />
        <KpiCard
          label="Revenue"
          value={formatMoney(finance.revenue, finance.currency)}
          accent="teal"
          icon={<Wallet />}
        />
        <KpiCard
          label="Ads spend"
          value={formatMoney(finance.adsCost, finance.currency)}
          accent="amber"
          icon={<Megaphone />}
        />
        <KpiCard
          label="Net profit"
          value={formatMoney(finance.netProfit, finance.currency)}
          sub={`${formatPercent(finance.profitMarginPct)} margin`}
          accent="emerald"
          icon={<TrendUp />}
        />
        <KpiCard label="ROAS" value={formatMultiplier(finance.roas)} accent="indigo" icon={<Target />} />
      </section>

      <div className="flex flex-col gap-6 pb-10">
        <DeliveryFunnel orders={orders} />
        <CampaignTable dashboard={campaigns} />
        <ProfitBreakdown finance={finance} />
      </div>

      <p className="pb-8 text-center text-xs text-ink-3">
        ProfitFlow AI · data synced from Elogistia (delivery) and Meta Ads (campaigns)
      </p>
    </div>
  );
}

function Bag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M6 7h12l1 13H5z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  );
}
function Wallet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}
function Megaphone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3 11v2a2 2 0 0 0 2 2h1l9 4V5L6 9H5a2 2 0 0 0-2 2z" />
      <path d="M17 9a3 3 0 0 1 0 6" />
    </svg>
  );
}
function TrendUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3 17l6-6 4 4 8-9" />
      <path d="M14 6h7v7" />
    </svg>
  );
}
function Target() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}
