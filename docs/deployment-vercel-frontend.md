# Deploying `apps/web` to Vercel

`apps/web` is a Next.js 16 (App Router) app — Vercel's native framework, so this is the simpler of the two deployments (contrast with `docs/deployment-vercel.md`, which had to work around Vercel's serverless model for the Express backend). It renders the same dashboard that was designed as a standalone artifact earlier in this project, now wired to real data.

## Architecture: this app is a backend-for-frontend (BFF), not a thin client

The browser **never** talks to `apps/api` directly, and never holds the backend's URL or any secret:

- The tenant session lives only in an **httpOnly cookie** (`pf_session`) — client-side JavaScript cannot read it, which closes off the most common XSS-driven token-theft path.
- Every call to the backend (`/api/overview`, `/api/meta-ads/dashboard`, the demo login) happens **server-side** — inside a Next.js Server Component or Route Handler — using a plain (non-`NEXT_PUBLIC_`) environment variable for the backend's URL. Nothing in `next.config.js` or the client bundle references it.
- Because these are server-to-server calls, they are **not subject to browser CORS at all** — CORS only restricts requests a browser's JavaScript initiates. The backend's `CORS_ALLOWED_ORIGINS` allowlist (see `docs/security-review.md`) is still worth setting to this app's real domain as defense-in-depth, in case a future feature adds a genuine client-side fetch (e.g. a live "refresh now" button), but the main dashboard flow doesn't depend on it.

This is why "Configure CORS" for this project mostly means configuring it on the **backend**, not the frontend — there's no separate CORS surface to configure here.

## 1. Project setup on Vercel

This is the same monorepo as the backend, deployed as a **second, separate Vercel project**:

1. Import the repository again (or add a second project from the same repo) into Vercel.
2. **Project Settings → General → Root Directory**: `apps/web`.
3. Framework preset: **Next.js** (auto-detected).
4. Build/install commands: leave as Vercel's Next.js defaults (`next build` / `npm install`) — nothing custom is needed here, unlike the backend.

## 2. Environment variables

Set these in **Project Settings → Environment Variables** for this project (they are entirely separate from the backend project's variables, even though some values are shared):

| Variable | Value | Notes |
|---|---|---|
| `BACKEND_API_URL` | The backend Vercel project's URL (or a custom domain in front of it), e.g. `https://profitflow-api.vercel.app` | Server-only — never prefix this `NEXT_PUBLIC_`, which would bundle it into client JS. |
| `INTERNAL_API_TOKEN` | **The exact same value** as the backend project's `INTERNAL_API_TOKEN` | Used only by `src/app/api/session/route.ts` to mint a demo session server-side. Mark **Sensitive**. |

Both are read exactly once, server-side, per `src/lib/backendClient.ts`'s doc comment — verify with `grep -r NEXT_PUBLIC apps/web/src` that nothing sensitive ever gets that prefix.

## 3. The demo login, and what to do instead in real production

`apps/web`'s `/login` page and `/api/session` route exist because there is no real signup/login system yet (see `docs/security-review.md` §4 and `IssueDemoTenantTokenUseCase`'s doc comment) — they let this dashboard show real, live data end-to-end without waiting on that separate module. Before onboarding real sellers:

1. Build the real Auth/Tenancy module (ARCHITECTURE.md) on the backend — real user accounts, password/OAuth login, a token that's issued through an actual authenticated flow.
2. Replace `/login`'s tenant-id form with a real login form calling that new endpoint instead of `/api/auth/demo-token`.
3. Set the backend's `ENABLE_DEMO_AUTH` back to `false` (or remove the demo endpoint/use case entirely) and stop deploying the frontend's `INTERNAL_API_TOKEN` variable — it will no longer be needed.

Shipping this app to a **staging** environment for internal review before that work is done is fine; **do not** point it at a production backend that holds real seller credentials with `ENABLE_DEMO_AUTH=true` set on that backend.

## 4. Security headers

Configured in `next.config.js`'s `headers()` — `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, and a `Content-Security-Policy` restricting scripts/styles/connections to this app's own origin. Vercel serves these on every response with no extra configuration; verify after deploying with:

```bash
curl -sI https://your-frontend.vercel.app/login | grep -iE "x-frame-options|content-security-policy|strict-transport"
```

## 5. Local verification before you deploy

This was exercised locally, end to end, before being written down — not just described:

```bash
cd apps/api && npm run build   # backend running locally
cd apps/web
npm install
npm run typecheck
npm run build
npm run start -- -p 3001       # or npm run dev
```

With the backend running and `apps/web/.env.local` pointing `BACKEND_API_URL` at it, the full flow was verified with real HTTP requests (not just code review): `GET /` redirects to `/login` with no session; `POST /api/session` with a `tenantId` returns a `Set-Cookie` for `pf_session`; `GET /dashboard` with that cookie renders the real seeded numbers (161 orders received, 140 confirmed, 87 delivered, 243,600 / 121,800 / 52,325 DZD revenue/product cost/ad spend) fetched live from the backend's `/api/overview` and `/api/meta-ads/dashboard`; and `GET /dashboard` with no cookie redirects straight to `/login` rather than leaking data.
