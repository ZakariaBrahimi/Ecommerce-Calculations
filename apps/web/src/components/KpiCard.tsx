import type { ReactNode } from 'react';

const ICON_BG: Record<string, string> = {
  navy: 'bg-navy/10 text-navy',
  teal: 'bg-teal-tint text-teal-strong',
  amber: 'bg-amber-tint text-amber',
  emerald: 'bg-emerald-tint text-emerald',
  indigo: 'bg-indigo-tint text-indigo',
};

export function KpiCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: keyof typeof ICON_BG;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${ICON_BG[accent]}`}>{icon}</div>
        <span className="text-xs font-semibold text-ink-2">{label}</span>
      </div>
      <div className="num text-2xl font-bold text-ink-1">{value}</div>
      {sub && <div className="text-xs text-ink-3">{sub}</div>}
    </div>
  );
}
