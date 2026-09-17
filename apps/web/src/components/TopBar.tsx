'use client';

import { useRouter } from 'next/navigation';

export function TopBar({ tenantId }: { tenantId: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-border bg-bg/90 px-1 py-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-teal to-navy shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
            <path d="M3 17l6-6 4 4 7-8" />
            <path d="M15 6h5v5" />
          </svg>
        </div>
        <span className="font-sora text-[16.5px] font-bold text-ink-1">
          Profit<span className="text-teal">Flow</span> AI
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink-2 shadow-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald" />
          </span>
          Tenant: {tenantId}
        </div>
        <button
          onClick={handleLogout}
          className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink-2 shadow-sm hover:text-ink-1"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
