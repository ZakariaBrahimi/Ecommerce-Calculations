import { formatDate, formatMoney, formatMultiplier, formatNumber, formatPercent } from '@/lib/format';
import type { CampaignDashboard, CampaignRow } from '@/lib/backendClient';

const STATUS_STYLE: Record<CampaignRow['status'], string> = {
  ACTIVE: 'text-emerald',
  PAUSED: 'text-ink-3',
  STOPPED: 'text-critical',
};

function Row({ row }: { row: CampaignRow }) {
  const currency = row.currency ?? '';
  return (
    <tr className="border-b border-border last:border-none hover:bg-[#F1F5F9]">
      <td className="px-3 py-3.5">
        <div className="flex flex-col gap-1">
          <strong className="text-sm font-semibold text-ink-1">{row.name}</strong>
          <span className={`inline-flex w-fit items-center gap-1.5 text-[11px] font-bold ${STATUS_STYLE[row.status]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {row.status[0] + row.status.slice(1).toLowerCase()}
          </span>
        </div>
      </td>
      <td className="num px-3 py-3.5 text-right text-sm font-semibold text-ink-1">
        {formatMoney(row.dailyBudget, currency)}
      </td>
      <td className="num px-3 py-3.5 text-right text-sm font-semibold text-ink-1">
        {formatMoney(row.spentAmount, currency)}
      </td>
      <td className="num px-3 py-3.5 text-right text-sm text-ink-2">{formatNumber(row.impressions)}</td>
      <td className="num px-3 py-3.5 text-right text-sm text-ink-2">{formatNumber(row.clicks)}</td>
      <td className="num px-3 py-3.5 text-right text-sm text-ink-2">{formatPercent(row.ctrPct)}</td>
      <td className="num px-3 py-3.5 text-right text-sm text-ink-2">{formatMoney(row.cpc, currency)}</td>
      <td className="num px-3 py-3.5 text-right text-sm font-semibold text-ink-1">{formatNumber(row.purchases)}</td>
      <td className="num px-3 py-3.5 text-right text-sm font-semibold text-emerald">
        {formatMultiplier(row.roas)}
      </td>
      <td className="num px-3 py-3.5 text-right text-sm font-semibold text-ink-1">{formatNumber(row.resultsCount)}</td>
      <td className="num px-3 py-3.5 text-right text-sm font-semibold text-ink-1">
        {formatMoney(row.costPerResult, currency)}
      </td>
      <td className="px-3 py-3.5 text-right text-xs text-ink-3">
        {formatDate(row.startDate)} → {row.endDate ? formatDate(row.endDate) : 'ongoing'}
      </td>
    </tr>
  );
}

export function CampaignTable({ dashboard }: { dashboard: CampaignDashboard }) {
  const rows = [...dashboard.active, ...dashboard.paused, ...dashboard.stopped];

  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-md">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-sora text-lg font-bold text-ink-1">Campaign performance</h2>
          <p className="mt-1 text-sm text-ink-2">Meta Ads campaigns synced from the Graph API.</p>
        </div>
        <span className="rounded-md bg-teal-tint px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-teal-strong">
          {rows.length} tracked
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">
          No campaigns synced yet - connect a Meta Ads account and wait for the next sync run.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
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
                <th className="px-3 pb-2.5 text-right">Results</th>
                <th className="px-3 pb-2.5 text-right">Cost / result</th>
                <th className="px-3 pb-2.5 text-right">Active window</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.campaignId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
