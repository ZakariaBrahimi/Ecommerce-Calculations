'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState('demo-tenant');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not start a session for that tenant.');
      setPending(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-teal to-navy">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
              <path d="M3 17l6-6 4 4 7-8" />
              <path d="M15 6h5v5" />
            </svg>
          </div>
          <span className="font-sora text-[16.5px] font-bold text-ink-1">
            Profit<span className="text-teal">Flow</span> AI
          </span>
        </div>

        <h1 className="font-sora text-xl font-bold text-ink-1">Sign in</h1>
        <p className="mt-1 text-sm text-ink-2">
          Demo access only - enter the tenant id you seeded data for. A real login system isn&apos;t built yet
          (see docs/production-deployment.md).
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
            Tenant ID
            <input
              className="rounded-md border border-border px-3 py-2 text-sm text-ink-1 outline-none focus:border-teal"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="demo-tenant"
              required
            />
          </label>

          {error && <p className="text-sm text-critical">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-md bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-strong disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'View dashboard'}
          </button>
        </form>
      </div>
    </main>
  );
}
