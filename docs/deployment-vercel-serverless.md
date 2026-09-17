# The stateless serverless integration (`/live`, `src/app/api/elogistia/*`, `src/app/api/meta/*`)

This is a **second, independent integration** inside `apps/web` — it does not touch `apps/api`, its Postgres database, or the DB-backed dashboard at `/dashboard`. It exists to satisfy a different, stricter set of requirements: no database, no persistence, live data fetched fresh on every page open, deployed purely as Vercel Functions with zero extra infrastructure (no Postgres, no Redis, no cron).

Both integrations coexist in the same Next.js app without overlapping: `/dashboard` reads accumulated history from `apps/api`'s database; `/live` calls Elogistia and Meta directly, every time, and forgets the response the moment it's sent to the browser.

## Architecture

```
Browser (/live)
  │  Promise.all: same-origin fetch, no credentials attached
  ▼
Next.js Route Handlers (Vercel Functions)
  /api/elogistia/orders     → GET https://api.elogistia.com/getOrders/
  /api/elogistia/statuses   → GET https://api.elogistia.com/getManyTracking/ (batched, parallel)
  /api/elogistia/tracking   → GET https://api.elogistia.com/getTracking/
  /api/meta/campaigns       → GET https://graph.facebook.com/.../campaigns + .../{ad_account_id} (parallel)
  /api/meta/insights        → GET https://graph.facebook.com/.../insights
```

Every route:
- reads its provider credentials from server-only environment variables (never `NEXT_PUBLIC_`, never returned in a response body),
- sets `cache: 'no-store'` on its upstream `fetch()` and `export const dynamic = 'force-dynamic'` on the route itself, so a "dashboard open" is always a real live call, never a cached one,
- applies a request timeout via `AbortSignal.timeout()` (`ELOGISTIA_API_TIMEOUT_MS` / `META_API_TIMEOUT_MS`) and classifies every failure (timeout / auth / rate limit / upstream error) into a normalized `{error, kind}` JSON body with the matching HTTP status — see `src/lib/serverless/providerError.ts`,
- normalizes the provider's raw, inconsistent field shapes into a clean, typed response before anything reaches the browser — see `src/lib/serverless/{elogistia,meta}Normalize.ts`.

`/live`'s client component (`src/app/live/LiveDashboard.tsx`) fetches orders, campaigns and insights with a single `Promise.all` (they're independent of each other), shows a loading skeleton per section while its own request is in flight, and degrades per-section on error rather than blanking the whole page. Statuses are fetched right after orders resolve, since Elogistia's order-list shape has no usable status field of its own (see the module doc comment) — that's a genuine dependency, not an artificial one, so it isn't forced into the same `Promise.all`.

## 1. Environment variables

Set these on the same Vercel project as `apps/web` (Project Settings → Environment Variables). They're independent of `BACKEND_API_URL`/`INTERNAL_API_TOKEN` (`docs/deployment-vercel-frontend.md`) — both sets can be present at once.

| Variable | Required | Notes |
|---|---|---|
| `ELOGISTIA_API_KEY` | Yes | A single platform-level key (this integration is single-account, not multi-tenant). Mark **Sensitive**. |
| `ELOGISTIA_API_URL` | No (default `https://api.elogistia.com`) | |
| `ELOGISTIA_API_TIMEOUT_MS` | No (default `10000`) | |
| `META_ACCESS_TOKEN` | Yes | A long-lived access token (~60 day expiry) — see `.env.example` for how to generate one. There is no OAuth dialog/callback in this integration (nowhere to store the resulting token between requests); refresh this value manually before it expires. Mark **Sensitive**. |
| `META_AD_ACCOUNT_ID` | Yes | Including the `act_` prefix. |
| `META_GRAPH_API_BASE_URL` | No (default `https://graph.facebook.com`) | |
| `META_GRAPH_API_VERSION` | No (default `v19.0`) | |
| `META_API_TIMEOUT_MS` | No (default `15000`) | |

## 2. Vercel Function configuration

Each route exports its own `maxDuration` (15s for Elogistia routes, 20s for Meta routes, which paginate) — comfortably inside Vercel's default Hobby/Pro limits, so no `vercel.json` function overrides are needed unless a plan's default is lower than that. No cron entries, no `vercel.json` at all is required for this integration specifically (contrast with `apps/api`'s `vercel.json`, which needs Cron Jobs for its sync workers — this integration has no background jobs to schedule).

## 3. What "no database, no persistence" means in practice here

- `/api/elogistia/statuses` batches tracking numbers into groups of 50 and fetches them with `Promise.all` rather than one call per tracking number, but does **not** rate-limit across invocations — there is nothing to hold a shared token bucket in (no Redis, per the requirements). Elogistia's documented cap is 100 req/min per API key; a single dashboard load doing a handful of batches stays well under it. A high-traffic deployment would need a distributed limiter (e.g. Upstash Redis, as `apps/api` already uses) if that assumption stops holding.
- `/api/meta/insights` asks Meta to aggregate spend/impressions/clicks/purchases over the requested `datePreset` (default `last_30d`) itself, rather than pulling a day-by-day breakdown and summing it locally — there's nowhere to persist that breakdown between calls, so there's no reason to compute it that way.
- Nothing here writes to a database, queue, or file — every response is the direct, normalized result of the upstream call(s) made during that single request.

## 4. Local development

Copy the block from `apps/web/.env.example` into `apps/web/.env.local`, fill in real Elogistia/Meta credentials, then `npm run dev` (or `npm run build && npm run start` to test the production build, which is what actually runs on Vercel). Visit `/live`.
