# ProfitFlow AI — Architecture & Product Design

**Status:** Pre-implementation design document. No application code has been written yet — this defines the system before Phase 1 begins.

---

## 1. Requirements Analysis

### 1.1 Core problem
Sellers running Meta Ads for e-commerce (often COD-based, dropshipping-style operations) can see ad spend and revenue separately, but rarely see **true net profit per campaign / product / order**, because that requires reconciling five independent, asynchronous data sources:

1. **Ad spend & performance** (Meta Ads) — spend, impressions, clicks, reported conversions, per campaign/ad set/ad, per day.
2. **Delivery outcome** (Delivery/COD provider) — an order marked "confirmed" isn't revenue until it's actually **delivered and paid**; a large share of COD orders are returned/cancelled, and delivery/return fees eat into margin.
3. **Orders** — from the store/CMS (Shopify, WooCommerce, YouCan, custom backend, or manual entry) — quantities, SKUs, order status, customer, attribution (UTM / ad ID if available).
4. **Product costs (COGS)** — landed cost per SKU, which changes over time (supplier price changes, currency shifts) and must be versioned, not a single static field.
5. **Revenue** — actual collected revenue (not just order total — must subtract returns, partial deliveries, COD collection failures, discounts).

Profit is only meaningful once all five are joined at the **order/SKU/day** grain and rolled up to campaign/ad/product/seller level.

### 1.2 Key domain constraints that drive the architecture
- **Data arrives asynchronously and out of order.** An order placed today may not get a final delivery status for 3–15 days. Ad spend for today is available today; delivery outcome is not. So profit numbers must be **explicitly marked provisional vs. final**, and recomputed as new data lands (event-sourced / recompute-on-new-fact model, not a single UPDATE).
- **Multi-tenant from day one.** This is a platform for many sellers, each with their own ad accounts, stores, and delivery providers — not a single-business internal tool.
- **Delivery providers are numerous and non-standardized** (this is the least standardized integration — many regional COD delivery companies with bespoke REST APIs, inconsistent status vocabularies). This must be built as a **pluggable adapter**, not a hard-coded integration.
- **Cost data changes over time** — COGS must be a time-series per SKU, not a single field, or historical profit gets silently rewritten when a seller updates today's cost.
- **Attribution is imperfect.** Meta reports "conversions" using its own attribution window; actual delivered/paid orders are ground truth. The platform's job is to reconcile the two, not blindly trust either.
- **Financial correctness matters more than raw feature velocity.** This pushes toward a strongly-typed backend, an explicit ledger-style profit model, decimal (not float) money handling, and idempotent ingestion.

### 1.3 Primary user stories
- As a seller, I connect my Meta Ad account, my delivery provider(s), and my store — and see net profit per campaign within a day of setting up.
- As a seller, I see profit degrade in near-real time as returns/cancellations come back from the delivery provider, and I can see *which* campaigns are profitable once real delivery outcomes are counted (not just "conversions").
- As a seller, I set/import product cost (COGS) per SKU, optionally with cost history.
- As a seller, I get alerts when a campaign's real (delivered) profit margin drops below a threshold.
- As an admin/operator, I can onboard a new delivery provider by writing one adapter, not touching core logic.

---

## 2. Recommended Architecture

### 2.1 Shape: **Modular monolith + async workers**, not microservices (yet)
For a v1–v2 product with a small team, a distributed microservices architecture adds operational cost (service discovery, distributed tracing, network failure modes) without a matching benefit. Instead:

- **One backend codebase**, organized into strict **domain modules** (Auth/Tenancy, Integrations, Orders, Costs, Ads, Delivery, Profit Engine, Notifications, Billing).
- **Hard module boundaries enforced in code** (no reaching into another module's DB tables directly — go through its service layer), so it can be split into real services later *if* scale demands it, without a rewrite.
- **Separate deployable worker process(es)** from day one for anything that talks to third-party APIs or does scheduled/bulk work — this is the one place where separating a process matters immediately, because ad/delivery API rate limits, retries, and backoff must never block user-facing requests.

### 2.2 High-level component diagram

```
                         ┌─────────────────────────┐
                         │   Web Dashboard (SPA)    │
                         │  Next.js / React + TS    │
                         └────────────┬─────────────┘
                                      │ HTTPS (REST/GraphQL)
                         ┌────────────▼─────────────┐
                         │        API Gateway        │
                         │  (Auth, rate limit, BFF)  │
                         └────────────┬─────────────┘
                                      │
        ┌───────────────┬────────────┼────────────┬───────────────┐
        │               │            │            │               │
  ┌─────▼─────┐   ┌─────▼─────┐┌─────▼─────┐┌─────▼──────┐  ┌─────▼─────┐
  │  Auth &   │   │ Integrations││  Orders   ││   Costs    │  │  Profit    │
  │ Tenancy   │   │  (config)  ││  Module   ││   Module   │  │  Engine    │
  └─────┬─────┘   └─────┬─────┘└─────┬─────┘└─────┬──────┘  └─────┬─────┘
        │               │            │            │               │
        └───────────────┴─────┬──────┴────────────┴───────────────┘
                               │
                     ┌─────────▼─────────┐
                     │   PostgreSQL (RDS)  │  ← source of truth, per-tenant scoped
                     └─────────┬─────────┘
                               │
                     ┌─────────▼─────────┐        ┌────────────────────┐
                     │   Redis (cache +   │◄──────►│  Background Workers │
                     │   BullMQ queues)   │        │  (Node/BullMQ or    │
                     └─────────┬─────────┘        │   Python/Celery)    │
                               │                    └─────────┬──────────┘
                               │                               │
              ┌────────────────┴───────────────┐   ┌───────────┴────────────┐
              │ Scheduled sync jobs (cron)      │   │ Adapter layer:          │
              │ - pull Meta Ads insights        │   │ - MetaAdsAdapter        │
              │ - poll delivery status          │   │ - DeliveryAdapter (×N)  │
              │ - recompute profit snapshots    │   │ - StoreAdapter (Shopify,│
              └─────────────────────────────────┘   │   WooCommerce, custom)  │
                                                      └────────────────────────┘
```

### 2.3 Why an adapter/plugin layer for integrations
Meta Ads = one well-documented API. Delivery providers = many, inconsistent, regionally specific. Both **and** the store/order source (Shopify, WooCommerce, a seller's custom backend, or manual CSV) should implement a common internal interface:

```ts
interface DeliveryProviderAdapter {
  authenticate(credentials): Promise<AuthContext>
  createShipment(order): Promise<ProviderShipmentRef>
  getShipmentStatus(ref): Promise<NormalizedDeliveryStatus>
  listUpdatedShipments(since: Date): Promise<NormalizedDeliveryStatus[]>
}
```
All provider-specific quirks (status string mapping, pagination, auth style) live inside the adapter; the Profit Engine only ever sees the **normalized** status enum (`pending`, `in_transit`, `delivered`, `returned`, `cancelled`, `lost`). New provider = new adapter class + config row, zero core changes.

### 2.4 The Profit Engine (the actual differentiator)
This is not "just a join" — it's the core business logic and deserves to be its own module with clear inputs/outputs:

**Input facts** (append-only, per order/day):
- Order line items + store revenue at order time
- Ad spend allocated to that order's campaign/day (spend is allocated at campaign/day grain, then apportioned to orders attributed to that campaign — see §2.5)
- Delivery outcome + delivery/COD/return fees
- COGS applicable at the time of the order (from cost history, not "current" cost)
- Payment gateway/COD collection fees

**Output**: a `profit_snapshot` row per order (and rolled up per campaign/day, per product/day, per seller/day), each with an explicit `status: provisional | final` flag and a `computed_at` timestamp, recomputed via an idempotent recalculation job whenever an upstream fact changes (new delivery status, cost edit, spend correction).

**Formula (per order):**
```
net_revenue   = collected_revenue - refunds - COD_collection_fee
order_cogs    = Σ(sku_cost_at_order_time × qty)
delivery_cost = base_delivery_fee + (return_fee if returned/cancelled else 0)
allocated_ad_spend = campaign_day_spend × (this_order / attributed_orders_that_day)
net_profit    = net_revenue - order_cogs - delivery_cost - allocated_ad_spend - payment_fees
```
Rollups (campaign, product, seller, day/week/month) are pre-aggregated into materialized snapshot tables — the dashboard should almost never compute this live from raw rows.

### 2.5 Ad-spend attribution model (be explicit, don't hide the assumption)
Meta's own attributed "conversions" are unreliable for COD businesses (a Meta "conversion" often just means "reached checkout," not "delivered and paid"). Recommended default: allocate a campaign's daily spend proportionally across the orders your store attributes to that campaign that day (via UTM parameters or click-id capture), and clearly label this as a **modeled allocation**, with the underlying method configurable (last-click UTM, ad-id passthrough, or equal-split fallback when no attribution data exists). Never present it as exact.

### 2.6 Multi-tenancy
- Every table carries `tenant_id` (seller/organization). Enforce isolation with PostgreSQL **Row-Level Security** policies (`tenant_id = current_setting('app.tenant_id')`) in addition to application-level scoping — belt and suspenders for financial data.
- One seller can have multiple ad accounts, multiple stores, multiple delivery providers → tenant is the billing/ownership boundary, not a 1:1 with any single integration.

---

## 3. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 14+ (React, TypeScript)**, Tailwind CSS, shadcn/ui, Tremor or Recharts for charts, TanStack Query | SSR for fast dashboard loads, strong ecosystem, one language across stack |
| Backend API | **NestJS (Node.js + TypeScript)** | Structured modules map directly to the domain modules in §2.1; strong DI; shares types with frontend via a shared package |
| Background workers | **BullMQ (Redis-backed)** in a separate Node process | Retries, backoff, rate-limit-aware scheduling for third-party API calls; same language as API, no polyglot overhead |
| Database | **PostgreSQL 16** | ACID correctness for money; native RLS for tenant isolation; JSONB for provider-specific raw payloads; window functions for rollups |
| Time-series/analytics option | **TimescaleDB extension on the same Postgres** (only if daily ad-metrics volume grows large) | Avoids standing up a second analytics DB early; adopt only when needed |
| Cache/Queue | **Redis** | BullMQ backend + hot-path caching (dashboard summaries) |
| ORM | **Prisma** | Type-safe schema, migrations, good fit with NestJS/TS |
| Auth | **JWT (access+refresh) + OAuth2** for Meta login/consent; email+password or magic link for sellers | Meta integration requires OAuth anyway; reuse the pattern |
| Money handling | **Integer minor units (cents) or a Decimal type**, never floats | Prevents rounding drift in profit math |
| Infra/deploy | **Docker** everywhere; **Docker Compose** for local/dev; **AWS ECS Fargate** (or Railway/Render for early-stage simplicity) for prod; managed Postgres (RDS) and Redis (ElastiCache) | Production-ready without full Kubernetes overhead at this stage; can graduate to k8s later since everything is already containerized |
| CI/CD | **GitHub Actions** — lint/test/build on PR, deploy on merge to main | Matches this repo's GitHub-based workflow |
| Observability | **Sentry** (errors), **Prometheus + Grafana** or a hosted equivalent (metrics), structured JSON logs (pino) shipped to a log store | Required to trust financial numbers in production |
| Secrets | Cloud secrets manager (AWS Secrets Manager / SSM Parameter Store) in prod; `.env` + `.env.example` locally | Ad/delivery API tokens are sensitive per-tenant secrets |
| Testing | Jest (unit), Supertest (API), Playwright (E2E on dashboard) | Profit-calculation logic needs strong unit test coverage given financial risk |

**Alternative stack** (if the team is Python-leaning): FastAPI + SQLAlchemy + Celery instead of NestJS/Prisma/BullMQ — the module boundaries and data model in this doc are stack-agnostic and hold either way.

---

## 4. Database Models (core schema)

All tables include `id (uuid)`, `tenant_id (uuid, FK)`, `created_at`, `updated_at` unless noted. Money columns are `numeric(14,4)` with an explicit `currency` column.

```
tenants
  id, name, default_currency, plan, created_at

users
  id, tenant_id, email, password_hash, role (owner|admin|viewer), last_login_at

── Integrations (credentials/config only; no business data) ─────────
ad_accounts
  id, tenant_id, provider ('meta'), external_account_id, access_token (encrypted),
  token_expires_at, status (active|expired|revoked)

store_connections
  id, tenant_id, provider ('shopify'|'woocommerce'|'custom'|'manual'),
  external_shop_id, credentials (encrypted jsonb), status

delivery_provider_connections
  id, tenant_id, provider_key (e.g. 'yalidine','zr_express','noest', ...),
  credentials (encrypted jsonb), status

── Catalog & cost ────────────────────────────────────────────────────
products
  id, tenant_id, sku, name, active

product_costs                       -- versioned COGS, never overwritten
  id, tenant_id, product_id, unit_cost, currency, effective_from, effective_to (nullable)

── Ads ───────────────────────────────────────────────────────────────
campaigns
  id, tenant_id, ad_account_id, external_campaign_id, name, objective, status

ad_sets / ads                       -- mirrors campaigns, FK up to campaign/ad_set
  id, tenant_id, campaign_id, external_id, name, status

ad_insights_daily                   -- one row per ad(or campaign)/day
  id, tenant_id, campaign_id, ad_id (nullable), date,
  spend, impressions, clicks, reported_conversions, currency

── Orders ────────────────────────────────────────────────────────────
orders
  id, tenant_id, store_connection_id, external_order_id, order_number,
  customer_ref, placed_at, status (pending|confirmed|shipped|delivered|
  returned|cancelled), currency, gross_total, discount_total,
  attributed_campaign_id (nullable), attribution_method

order_items
  id, tenant_id, order_id, product_id, sku, quantity, unit_price

── Delivery ──────────────────────────────────────────────────────────
shipments
  id, tenant_id, order_id, delivery_provider_connection_id,
  external_shipment_id, status (normalized enum), base_fee, return_fee,
  cod_collected_amount, status_updated_at, raw_payload (jsonb)

── Profit engine output (derived, recomputable) ────────────────────
order_profit_snapshots
  id, tenant_id, order_id, net_revenue, order_cogs, delivery_cost,
  allocated_ad_spend, payment_fees, net_profit, margin_pct,
  calc_status (provisional|final), computed_at

profit_rollups_daily                -- pre-aggregated for dashboard speed
  id, tenant_id, grain ('campaign'|'product'|'seller'), grain_id,
  date, spend, revenue, cogs, delivery_cost, net_profit, orders_count,
  delivered_count, returned_count

── Ops ───────────────────────────────────────────────────────────────
alert_rules
  id, tenant_id, metric, condition, threshold, channel (email|webhook)

sync_jobs_log
  id, tenant_id, job_type, status, started_at, finished_at, error (nullable)
```

Key modeling decisions worth calling out:
- **`product_costs` is append-only/versioned** — profit for a March order must always use March's cost, even if the seller updates COGS in June.
- **`ad_insights_daily` is idempotent-upsertable** on `(ad_id or campaign_id, date)` — Meta re-reports historical days as attribution windows close, so re-pulling must overwrite, not duplicate.
- **`shipments.raw_payload jsonb`** keeps the original provider response for debugging/audit without polluting the normalized schema.
- **`order_profit_snapshots` is fully recomputable** from the other tables — treat it as a cache/materialization, not a source of truth, so a bug in the profit formula can be fixed by replaying, not backfilling manually.

---

## 5. API Integrations

### 5.1 Meta Marketing API (Graph API)
- OAuth2 login flow (Facebook Login for Business) → store long-lived access token per `ad_accounts` row, refresh before expiry.
- Scheduled pull (every 1–4h) of `/act_{id}/insights` at campaign and ad level: spend, impressions, clicks, actions. Use `time_increment=1` for daily grain, and re-pull a rolling 7-day window each run (Meta revises attributed conversions for several days after the fact).
- Respect Meta's rate limits (Ads Insights has its own throttling headers) — the worker must read `X-Business-Use-Case-Usage` and back off accordingly.
- Optional later: **Conversions API** to send delivered/paid order events back to Meta, improving *their* optimization — valuable as a v2 feature, not required for v1 profit visibility.

### 5.2 Delivery provider APIs (pluggable, per region)
- No single "delivery API" exists — this is a family of regional COD carriers (e.g., Yalidine, ZR Express, Noest Express, and similar), each with its own REST API and auth (API key/token pairs, sometimes IP allowlisting).
- Build one `DeliveryProviderAdapter` implementation per provider (see §2.3), normalizing to a shared status enum. Start with 1–2 providers the founding sellers actually use; add more as adapters, not core changes.
- Poll for status updates (most of these APIs don't offer webhooks) on a schedule (e.g., every 30–60 min for active shipments), and stop polling once a shipment reaches a terminal state (`delivered`, `returned`, `cancelled`, `lost`).

### 5.3 Orders / store source
- **Shopify**: OAuth app + webhooks (`orders/create`, `orders/updated`, `orders/fulfilled`) for near-real-time ingestion — preferred over polling.
- **WooCommerce**: REST API key + webhook support, similar pattern.
- **Custom/other backends**: expose a documented inbound webhook + a simple REST "push order" endpoint, plus CSV import as a fallback for sellers without an integratable system.
- All paths converge on the same internal `orders`/`order_items` tables via a normalization layer, mirroring the delivery adapter pattern.

### 5.4 Supporting integrations (later phases)
- Currency exchange rates (if a seller's ad account, store, and delivery provider use different currencies) — a daily-rate provider (e.g., exchangerate.host or a bank feed), applied at the time each fact is recorded, not floating.
- Notification channels: email (transactional provider), and optionally WhatsApp/Telegram/Slack webhook for alerts, since COD sellers in the target market often live in chat apps.

### 5.5 Webhook & job idempotency
Every inbound webhook and every scheduled pull must be idempotent (upsert keyed on the external ID), because at-least-once delivery is the norm for both Meta and delivery-provider integrations — duplicate webhook fires must never double-count spend or orders.

---

## 6. Folder Structure

Monorepo, since frontend/backend/shared types benefit from being versioned together:

```
profitflow-ai/
├── apps/
│   ├── web/                      # Next.js dashboard
│   │   ├── app/                  # routes: /dashboard, /campaigns, /products, /settings
│   │   ├── components/
│   │   ├── lib/                  # API client, auth helpers
│   │   └── ...
│   ├── api/                      # NestJS HTTP API
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── tenancy/
│   │   │   │   ├── integrations/
│   │   │   │   │   ├── meta-ads/
│   │   │   │   │   ├── delivery/
│   │   │   │   │   │   └── adapters/   # one file per provider
│   │   │   │   │   └── stores/
│   │   │   │   │       └── adapters/   # shopify.adapter.ts, woocommerce.adapter.ts, ...
│   │   │   │   ├── orders/
│   │   │   │   ├── products-costs/
│   │   │   │   ├── ads/
│   │   │   │   ├── delivery/
│   │   │   │   ├── profit-engine/
│   │   │   │   ├── alerts/
│   │   │   │   └── billing/
│   │   │   ├── common/            # guards, interceptors, decorators
│   │   │   └── main.ts
│   │   └── test/
│   └── worker/                    # BullMQ job processors (separate process, shares modules from api or a common lib)
│       ├── src/
│       │   ├── jobs/
│       │   │   ├── sync-meta-ads.job.ts
│       │   │   ├── poll-delivery-status.job.ts
│       │   │   ├── ingest-orders.job.ts
│       │   │   └── recompute-profit.job.ts
│       │   └── scheduler.ts
│       └── ...
├── packages/
│   ├── shared-types/               # DTOs/enums shared between web, api, worker
│   ├── profit-engine-core/         # pure calculation functions, framework-free, heavily unit-tested
│   └── config/                     # shared eslint/tsconfig
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.worker
│   │   ├── Dockerfile.web
│   │   └── docker-compose.yml       # local dev: postgres, redis, api, worker, web
│   ├── migrations/                  # Prisma migrations (or lives in apps/api/prisma)
│   └── terraform/ (or cdk/)         # prod infra as code, once cloud target is chosen
├── docs/
│   ├── ARCHITECTURE.md              # this file
│   ├── adapters/                    # how to add a new delivery/store adapter
│   └── runbooks/
├── .github/
│   └── workflows/
│       ├── ci.yml                   # lint, test, build on PR
│       └── deploy.yml               # build+push images, deploy on merge to main
├── .env.example
└── package.json                     # workspaces: apps/*, packages/*
```

---

## 7. Development Phases

**Phase 0 — Foundation (1–2 weeks)**
Repo scaffolding (monorepo, CI, lint/test config), tenant/user auth, base Postgres schema + RLS policies, deploy skeleton (empty API + web + worker to staging).

**Phase 1 — Manual core (2–3 weeks)**
`products`, `product_costs`, manual order entry / CSV import, a basic profit calculation using manually entered ad spend and delivery cost (no live integrations yet). Goal: prove the profit formula and dashboard UX with real seller data before automating ingestion.

**Phase 2 — Meta Ads integration (2 weeks)**
OAuth connect flow, `ad_accounts`/`campaigns`/`ad_insights_daily` sync worker, campaign-level spend visible in dashboard, replacing manual spend entry.

**Phase 3 — Store/orders integration (2–3 weeks)**
Shopify + one other store adapter (or custom webhook API), automated order ingestion, attribution capture (UTM/click-id), replacing manual order entry.

**Phase 4 — Delivery provider integration (2–3 weeks)**
First 1–2 delivery adapters, shipment status polling, delivery/return fee capture — this is what upgrades "reported conversions" into "actual delivered profit," the platform's core value prop.

**Phase 5 — Profit engine automation & rollups (2 weeks)**
Recompute-on-new-fact pipeline, `profit_rollups_daily` materialization, provisional-vs-final status surfaced in UI, dashboard performance pass (pre-aggregated queries only).

**Phase 6 — Alerts & insights (2 weeks)**
`alert_rules`, threshold notifications (email/webhook/chat), basic anomaly surfacing (e.g., "this campaign's real margin dropped 40% after returns landed").

**Phase 7 — Multi-tenant SaaS hardening (2–3 weeks)**
Billing/plans, per-tenant rate limiting, admin tooling for onboarding new delivery adapters without code changes where feasible (config-driven where possible), audit logging, backup/restore drills.

**Phase 8 — Scale & production hardening (ongoing)**
Load testing the sync workers, TimescaleDB migration if ad-metrics volume warrants it, expand delivery/store adapter library based on customer demand, SOC2-style controls if enterprise sellers require it.

---

## Open decisions to confirm before Phase 0
1. Which delivery provider(s) do the first pilot sellers actually use? (Determines the first adapter(s) to build in Phase 4.)
2. Which store platform(s) are in scope for v1 — Shopify, WooCommerce, a custom backend, or manual-only to start?
3. Node/NestJS vs. Python/FastAPI — confirm team preference before scaffolding Phase 0.
4. Target cloud provider for production (AWS/GCP/Railway/Render) — affects `infra/` details only, not the module design above.
