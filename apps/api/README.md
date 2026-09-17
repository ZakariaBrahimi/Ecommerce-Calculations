# ProfitFlow AI — Backend

Backend services for ProfitFlow AI's integrations, built with clean
architecture: domain and application logic have no dependency on Express,
Prisma, or any third-party HTTP API — only on the port interfaces under
`src/domain/ports`. Two integrations live here so far:

- **Delivery (Elogistia)** — see `docs/integrations/elogistia-api.md` (repo root).
- **Meta Ads** — OAuth-based campaign/spend sync, documented below.

## Layout

```
src/
  domain/          entities, enums, errors, port interfaces — no framework imports
  application/      use cases + services orchestrating ports
  infrastructure/   Prisma repos, provider HTTP clients/gateways, logging,
                    encryption, rate limiting, the sync job schedulers
  interfaces/http/  Express controllers/routes/middleware
  composition/      the one place that wires concrete infra into use cases
                    (container.ts for delivery, metaAdsContainer.ts for Meta Ads)
  main.ts           process entrypoint
prisma/schema.prisma  database models for both integrations
test/unit/            fast tests against fakes/in-memory repos, no DB needed
```

## Getting started

```bash
cp .env.example .env      # fill in DATABASE_URL, encryption keys, JWT_SECRET,
                           # INTERNAL_API_TOKEN, and the META_* variables
npm install
npx prisma migrate dev    # creates the delivery_*, campaigns/ad_sets/ads/daily_spend, etc. tables
npm run dev
```

## Scripts

- `npm run dev` — runs the API with hot reload
- `npm run build` / `npm start` — compiles to `dist/` and runs it
- `npm test` — unit tests (fakes/in-memory repos, no live DB or network)
- `npm run typecheck` — `tsc --noEmit`

## Delivery integration — key design points

- **No delivery-provider API key ever reaches the frontend.** The frontend
  only holds its own ProfitFlow AI session JWT; a seller's Elogistia key is
  submitted once via `POST /api/delivery/connections`, validated, encrypted
  (AES-256-GCM), and stored per tenant — never returned in any response.
- **One adapter per provider.** `ElogistiaDeliveryProvider` is the only
  class that knows Elogistia's endpoints; a second delivery provider is
  added by implementing `DeliveryProviderGateway` and `DeliveryStatusMapper`
  again, without touching use cases, controllers, or the sync job.
- **Sync job isolates failures per tenant and per batch** — one seller's
  expired key or one bad batch never blocks anyone else's sync run.

## Meta Ads integration — key design points

- **OAuth, backend-only.** `GET /api/meta-ads/oauth/start` (tenant session
  required) returns the Meta authorization URL; Meta redirects the browser
  to `GET /api/meta-ads/oauth/callback` with `code`/`state` and no auth
  header of its own. The callback recovers the tenant id from a *signed*
  `state` param (`MetaOAuthStateCodec`), then exchanges `code` for a
  long-lived token entirely server-to-server — the Meta app secret and the
  resulting access token never reach the frontend.
- **Secure token storage.** The long-lived token is AES-256-GCM encrypted
  (the same `CredentialsCipher` used for delivery credentials) and stored
  per tenant in `meta_ad_account_connections`; `MetaConnectionResolver`
  decrypts it in memory only for the duration of a sync call and rejects
  (marking the connection `invalid`) once the token's expiry has passed.
- **Automatic synchronization.** `MetaAdsSyncScheduler` runs
  `SyncMetaAdsUseCase` hourly (configurable via `META_ADS_SYNC_CRON`) for
  every tenant with an active connection: first the campaign/ad set/ad
  hierarchy (`SyncCampaignStructureUseCase`), then a rolling window of daily
  insights (`SyncDailyInsightsUseCase`, re-pulling ~7 days back since Meta
  revises attributed conversions after the fact). One tenant's failure
  never blocks another's.
- **Dashboard is a pure read.** `GET /api/meta-ads/dashboard` never calls
  Meta live — it reads whatever the last sync stored and groups campaigns
  into Active/Paused/Stopped (`GetCampaignDashboardUseCase` +
  `CampaignMetricsAggregator`), each with name, daily budget, spent amount,
  cost per result, number of results, and start/end date.
- **"Results" means what Ads Manager means.** Meta's Insights API only
  returns a flat `actions` array; `MetaResultsExtractor` maps a campaign's
  objective (`OUTCOME_SALES`, `OUTCOME_LEADS`, etc.) to the right action
  type so "Number of results" matches what a seller already sees in Ads
  Manager, instead of an arbitrary raw metric.
- **Prepared for profitability metrics.** `ProfitMetricsCalculator` is a
  pure, fully-tested module for CAC, ROAS, cost per delivered order, and
  profit/margin per campaign. Today only `adSpend` (from `DailySpend`) feeds
  it; `deliveredOrdersCount`, `attributedRevenue`, `cogs`, `deliveryCost` and
  `paymentFees` are wired in once the orders/delivery data join is built —
  the formulas don't change when that happens.

## Errors and logging (shared across both integrations)

- **Errors** are typed hierarchies (`DeliveryIntegrationError`,
  `MetaAdsIntegrationError`) translated to HTTP status codes in one place
  (`interfaces/http/errorHandler.ts`); nothing else constructs a raw `Error`
  for a provider failure.
- **Logging** goes through the `Logger` port (Pino in production), with
  API keys, access tokens, and encrypted credentials redacted at the logger
  level as defense in depth on top of callers never passing them in.

## Security & deployment

- Full audit (findings, fixes, remaining gaps): `../../docs/security-review.md`.
- Deploying this service to Vercel (why the in-process cron/rate-limiter
  had to change, env var setup, secrets management): `../../docs/deployment-vercel.md`.
- `helmet`, a `CORS_ALLOWED_ORIGINS` allowlist (never a wildcard), and
  inbound rate limiting (`express-rate-limit`) sit in front of every route -
  see `interfaces/http/middleware/security.ts`.
- `npm audit` is currently clean (0 vulnerabilities).
