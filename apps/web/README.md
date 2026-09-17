# ProfitFlow AI — Frontend

The dashboard: Next.js 16 (App Router), deployed to Vercel as its own project alongside `apps/api`. Renders the same design built earlier as a standalone artifact, now wired to real data.

## Architecture

This app is a **backend-for-frontend (BFF)**, not a thin client calling `apps/api` from the browser:

- The tenant session lives only in an httpOnly cookie (`pf_session`) - never readable by client JS.
- Every backend call happens server-side (Server Components / Route Handlers), using `BACKEND_API_URL` and, for the demo login only, `INTERNAL_API_TOKEN` - neither is ever bundled into client-side JavaScript (`grep -r NEXT_PUBLIC src/` returns nothing).
- Because those calls are server-to-server, they aren't subject to browser CORS at all.

See `../../docs/deployment-vercel-frontend.md` for the full deployment writeup and `../../docs/production-deployment.md` for the combined step-by-step (both apps + database + secrets).

## Layout

```
src/
  app/
    page.tsx            redirects to /dashboard or /login based on the session cookie
    login/page.tsx       demo login form (tenant id only - see below)
    dashboard/page.tsx    server component: fetches /api/overview + /api/meta-ads/dashboard, renders everything
    api/session/route.ts  mints a demo session server-side, sets the httpOnly cookie
    api/logout/route.ts   clears it
  lib/
    session.ts            cookie name/options, display-only token decode
    backendClient.ts       server-only fetch wrapper for the backend API
    format.ts              money/percent/date formatting
  components/              KpiCard, DeliveryFunnel, CampaignTable, ProfitBreakdown, TopBar
```

## Getting started

```bash
cp .env.example .env.local   # BACKEND_API_URL, INTERNAL_API_TOKEN
npm install
npm run dev
```

Requires `apps/api` running (locally or deployed) with `ENABLE_DEMO_AUTH=true` for the login flow to work - see the demo-auth caveat below.

## Scripts

- `npm run dev` / `npm run build` / `npm run start`
- `npm run typecheck`

## The demo login is not a real login system

There's no signup/login module yet (`ARCHITECTURE.md`'s Auth/Tenancy module is future work). `/login` calls the backend's `POST /api/auth/demo-token`, which mints a valid session for whatever tenant id you type, gated behind the backend's `INTERNAL_API_TOKEN` and an explicit `ENABLE_DEMO_AUTH=true` flag (default off). Read `../../docs/security-review.md` §4 before enabling that flag anywhere with real seller data. Replacing this is the first thing to do before opening this up beyond a trusted pilot.

## Security headers

Configured in `next.config.js` (`X-Frame-Options`, `Strict-Transport-Security`, a same-origin `Content-Security-Policy`, etc.) - verify after deploying with `curl -sI <url> | grep -i x-frame-options`.
