# Elogistia Delivery API — Integration Analysis

Source: attached Postman collection "Documentation Elogistia API" (Elogistia is an Algerian COD delivery/logistics provider — base URL `https://api.elogistia.com`).

---

## 1. API Overview

### 1.1 Available endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/insertCommande/` | POST* | Create a new order/shipment |
| `/getOrders/` | GET | List all orders, **or** get one order's details when `tracking` is passed |
| `/getTracking/` | GET | Full status history/log for one tracking number |
| `/getManyTracking/` | GET | Status history for multiple tracking numbers in one call (comma-separated) |
| `/updateOrdersStatus/` | GET | Update an order's status (e.g. mark "to be picked up", cancel) |
| `/createComment/` | POST* | Attach an internal note/comment to an order |
| `/deleteOrder/` | GET | Delete/cancel an order by tracking number |
| `/printBordereau_15x20/`, `/printBordereau_10x15/`, `/printBordereau_10x10/` | GET | Print a single shipping label (bordereau) in the given format |
| `/printBordereau_multiple_10x15/` | GET | Print multiple shipping labels at once |
| `/getWilayas/` | GET | List deliverable provinces (wilayas) |
| `/getMunicipalities/` | GET | List deliverable communes, optionally filtered by `wilaya` |
| `/getShippingCost/` | GET | List delivery cost table (home vs. stop-desk) per wilaya |
| `/getAgences/` | GET | List stop-desk agency locations |

\* Marked as POST in the docs, but **every parameter — including the API key — is still sent as a URL query string, not a JSON/form body.** There is no distinct "request body" in this API at all; treat every call as query-string-driven regardless of HTTP verb.

### 1.2 Authentication method
- **API-key-in-query-string**, not a header, not OAuth, not a bearer token.
- Each Elogistia **seller account** generates its own API key from the Elogistia dashboard. That key is account-scoped — there is no separate client-secret or signing step.
- **Inconsistency in the docs**: some endpoints name the parameter `apiKey`, others name it `key`, for the exact identical purpose. A robust integration must not assume the parameter name — normalize it in one place (see §3).

### 1.3 Required headers
**None are required or documented.** No `Authorization`, no custom auth header, no content-type header (since there's no body). This is unusual and has a direct security consequence: **the credential travels in the URL**, which means it can end up in:
- web server / reverse proxy access logs,
- browser history if ever called client-side,
- `Referer` headers if a page linking to a bordereau/print URL is followed,
- APM/tracing tools that capture full request URLs by default.

**Mitigation to bake into the integration (not just a "nice to have"):** call this API **only from the backend/worker**, never from the browser; explicitly redact query strings containing `apiKey`/`key` in logs and error-tracking (Sentry `beforeSend` scrubber); disable full-URL capture in APM for this client.

### 1.4 Request format
- Plain HTTPS GET (and nominally POST) with all parameters as URL query params.
- Multi-value fields use a pipe delimiter within a single param, e.g. `product=adidas|nike|puma&price=1500|4500|6500` (parallel arrays — item *n* in `product` corresponds to item *n* in `price`).
- Multiple tracking numbers use a **comma** delimiter, e.g. `tracking=L-372BNH,L-295LAI`.
- No JSON body, no request-level idempotency key provided by the API — **your integration must supply its own idempotency guard** (see §3.4).

### 1.5 Response format
JSON, but **not uniformly shaped** — four different response shapes appear across endpoints:
1. `{ "body": [...], "itemCount": N }` — most GET-list endpoints (`getOrders`, `getWilayas`, `getMunicipalities`, `getShippingCost`, `getAgences`, `getTracking`).
2. A bare JSON array — `getManyTracking`.
3. `{ "success": true, "Message": "...", ...fields }` — action endpoints (`updateOrdersStatus`, `createComment`).
4. A bare JSON string — `deleteOrder` returns `"la commande a été supprimée avec succès"` with no wrapping object.

Field names are **French, inconsistently cased, and inconsistently spelled** across endpoints for the same concept (e.g. `"Commuhne "` with a typo and trailing space vs. `"Commune "` with a trailing space vs. `"Commune"` with none; `"Frais de livraison"` appears as both a request param and a response field with different meanings in different endpoints — requested fee vs. actual applied fee). **A normalization/mapping layer is mandatory, not optional**, and should be covered by snapshot tests against real sample payloads (the ones captured in this doc are a good starting fixture set).

`insertCommande` success response also returns computed shipping economics directly, which is valuable input to the profit engine:
```json
{ "success": "L-214DMUF", "Frais de livraison": 1000, "Poids": 20, "Frais poids en plus": 750 }
```

### 1.6 Pagination
**Not implemented/documented at all.** `getOrders` with no `tracking` filter appears to return the **entire** order list in one response, with no `page`, `limit`, `offset`, or `since` parameter available anywhere in the collection. This is a real integration risk for sellers with large order volumes:
- Treat `getOrders` (unfiltered) as a **full backfill / reconciliation tool**, not a routine polling call — run it rarely (e.g. once at connection time, or a nightly reconciliation job), not every sync cycle.
- For ongoing sync, track tracking numbers you already know about (from your own `orders`/`shipments` tables) and poll their status via `getManyTracking` (comma-batched, e.g. 50–100 per call) instead of re-pulling the full list.
- If Elogistia can add server-side filtering/pagination on request, that should be raised with them directly — flag this as an open question for the pilot integration, not something to work around indefinitely.

### 1.7 Rate limits
**Documented explicitly: 100 requests per minute** (per the "Taux limite" section of the collection). No mention of whether this is per API key, per IP, or per account — assume **per API key** (safest assumption for a multi-tenant platform, since each seller has a distinct key) and implement a token-bucket limiter keyed on `tenant_id + api_key`, not a single global limiter across all sellers.

---

## 2. Endpoints Mapped to ProfitFlow AI's Needs

| ProfitFlow AI need | Elogistia endpoint(s) | Notes |
|---|---|---|
| **Fetching orders** | `GET /getOrders/?key=...` (no `tracking` → full list); `GET /getOrders/?key=...&tracking=...` (single order) | No pagination — see §1.6. Use full list only for initial backfill/reconciliation. |
| **Fetching delivery status** | `GET /getTracking/` (single, full history), `GET /getManyTracking/` (batch, full history) | `getManyTracking` is the one to use for routine polling — batch known tracking numbers, comma-separated, respecting the 100 req/min cap. |
| **Tracking shipments** | Same as above (`getTracking` / `getManyTracking`) | The `historique`/`body` array is itself a timeline (status + timestamp per event) — map every entry into `shipments` status history, not just the latest status, so the profit engine can see *when* a return/cancellation actually happened. |
| **Updating order status** | `GET /updateOrdersStatus/?apiKey=...&tracking=...&status=...` | Only two documented status codes so far: `1` = "to be picked up", `2` = "cancel." Confirm the full status-code table with Elogistia before relying on more values — the collection's "Liste des status des commandes" enumerates ~23 human-readable status **labels** returned by the API, but does not give the numeric codes accepted by this endpoint for all of them. |
| Order creation (needed to round-trip, not asked for but required for a working adapter) | `POST /insertCommande/` | Required if ProfitFlow AI ever creates shipments on the seller's behalf rather than only reading; otherwise this can be phase-2/optional. |
| Cancel/delete | `GET /deleteOrder/` | Distinct from `updateOrdersStatus?status=2` (cancel) — confirm with Elogistia which is the "soft cancel" vs. "hard delete," since a hard delete could remove the audit trail needed for the profit engine's history. |
| Reference data (supports order creation/cost mapping) | `getWilayas`, `getMunicipalities`, `getShippingCost`, `getAgences` | Useful for validating addresses and pre-computing expected delivery fees, but not part of the four core flows above. |

### Normalized delivery-status mapping
Elogistia exposes ~23 raw status labels. Map them into ProfitFlow AI's normalized enum (defined in `ARCHITECTURE.md` §2.3) as follows:

| Normalized status | Elogistia raw labels |
|---|---|
| `pending` | Brouillon, À ramasser, Ramassage à relancer, À remettre |
| `in_transit` | En cours de ramassage, Ramassée, À expédiée, En transit, En hub, En cours livraison, En cours de livraison, Réceptionnée |
| `delivered` | Livrée, Livrée & réglée |
| `returned` | Retour reçu, Retour en transit, Retour remis, Partiel remis |
| `cancelled` | Annulée |
| `lost` | Perdue, Cassée |
| `exception` *(new value worth adding to the enum)* | Suspendue, Partiel |

Keep the raw label in `shipments.raw_payload` regardless — this table is a best-effort mapping to review with Elogistia, not a guaranteed-complete spec, since the docs don't give a canonical status-code table.

---

## 3. API Integration Plan for ProfitFlow AI

This slots directly into the `DeliveryProviderAdapter` interface defined in `ARCHITECTURE.md` §2.3, as the first concrete delivery adapter (`elogistia.adapter.ts`).

### 3.1 Credential model
Each **tenant** (seller) has their own Elogistia account and API key — this is **not** a single platform-wide secret. Store it in `delivery_provider_connections.credentials` (encrypted JSONB, per the schema in `ARCHITECTURE.md` §4), keyed by `tenant_id` + `provider_key = 'elogistia'`. The platform-level `.env` only holds the **base URL** and shared client config (timeouts, retry policy) — never a seller's personal API key.

### 3.2 Sync flow
1. **Onboarding**: seller pastes their Elogistia API key into ProfitFlow AI's settings UI → backend validates it with a cheap read call (e.g. `getWilayas`) → encrypts and stores it.
2. **Backfill (once per connection)**: call `getOrders` (unfiltered) to seed the initial `orders`/`shipments` mapping for any orders Elogistia already knows about that ProfitFlow AI hasn't seen from the store integration.
3. **Ongoing polling (worker job, e.g. every 15–30 min)**: for every shipment in a non-terminal state (`pending`/`in_transit`), batch tracking numbers in groups of ~50 and call `getManyTracking`; stop polling a shipment once it reaches a terminal state (`delivered`, `returned`, `cancelled`, `lost`).
4. **Status write-back (optional, phase 2)**: if ProfitFlow AI ever needs to push a cancellation from the seller's dashboard back to Elogistia, use `updateOrdersStatus`.
5. **Every response** is normalized (raw label → enum), upserted into `shipments` keyed on `(tenant_id, external_shipment_id)`, and triggers a `recompute-profit` job for the affected order (per the Profit Engine's recompute-on-new-fact model).

### 3.3 Rate-limit handling
- Token bucket of 100/min **per tenant's API key**, implemented in Redis (`INCR` + `EXPIRE`, or a proper sliding-window library) so one seller's sync volume can never starve another tenant's requests.
- Prefer `getManyTracking` batching over N individual `getTracking` calls — this is the single biggest lever to stay under the cap for sellers with hundreds of active shipments.
- On a 429/limit signal (the docs don't specify the exact response for exceeding the limit — confirm with Elogistia and handle defensively): exponential backoff + re-queue the job, never drop it.

### 3.4 Idempotency & data integrity
- No idempotency key is provided by the API for `insertCommande` — if ProfitFlow AI creates orders on Elogistia, generate and store your own idempotency token (e.g. hash of `tenant_id + external_order_id`) and check it before calling `insertCommande` again for the same order, to avoid duplicate shipments on retry.
- All polling upserts key on `external_shipment_id` (the `tracking` value) — safe to re-run.
- Log every raw response into `shipments.raw_payload` for audit, since field names/shapes are inconsistent enough that silent mis-mapping is a real risk.

### 3.5 Failure isolation
Wrap all Elogistia calls behind a circuit breaker per tenant — if a seller's API key is revoked/expired, that must degrade to a per-tenant "integration needs attention" flag, and must never block ingestion for other tenants or other integrations (Meta Ads, store orders) sharing the same worker pool.

---

## 4. Secure Backend Service Structure

### 4.1 Module layout (extends `apps/api` / `apps/worker` from `ARCHITECTURE.md` §6)

```
apps/api/src/modules/integrations/delivery/
├── delivery.module.ts
├── delivery-provider-connection.service.ts   # CRUD for tenant credentials (encrypt on write, decrypt on read)
├── adapters/
│   ├── delivery-provider.adapter.ts          # shared interface (already defined in ARCHITECTURE.md)
│   └── elogistia/
│       ├── elogistia.adapter.ts              # implements DeliveryProviderAdapter
│       ├── elogistia.client.ts               # thin HTTP client: base URL, retries, rate limiting
│       ├── elogistia.mapper.ts               # raw payload -> normalized DTOs (status enum, shipment, order)
│       ├── elogistia.types.ts                # raw response shapes (per §1.5), documented from real samples
│       └── elogistia.constants.ts            # status-label map, base path constants
└── dto/
    └── normalized-shipment.dto.ts

apps/worker/src/jobs/
├── poll-delivery-status.job.ts               # runs per tenant, per provider, on a schedule; calls the adapter
└── sync-delivery-order.job.ts                # optional: push order creation to Elogistia
```

### 4.2 Adapter sketch (illustrative, not final code)

```ts
// elogistia.client.ts
export class ElogistiaClient {
  constructor(
    private readonly baseUrl: string,        // from env: DELIVERY_API_URL
    private readonly rateLimiter: RateLimiter // Redis-backed, keyed per tenant
  ) {}

  async get(path: string, params: Record<string, string>, tenantApiKey: string) {
    await this.rateLimiter.acquire(tenantApiKey);
    const url = new URL(path, this.baseUrl);
    // NOTE: this API takes the key as `apiKey` on some endpoints, `key` on others —
    // normalize by always sending BOTH to avoid per-endpoint special-casing.
    url.searchParams.set('apiKey', tenantApiKey);
    url.searchParams.set('key', tenantApiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new DeliveryProviderError('elogistia', res.status, await safeText(res));
    return res.json();
  }
}
```

```ts
// elogistia.adapter.ts
export class ElogistiaAdapter implements DeliveryProviderAdapter {
  constructor(
    private readonly client: ElogistiaClient,
    private readonly mapper: ElogistiaMapper,
    private readonly credentials: DeliveryProviderConnectionService,
  ) {}

  async listUpdatedShipments(tenantId: string, trackingNumbers: string[]) {
    const apiKey = await this.credentials.getDecryptedKey(tenantId, 'elogistia');
    const batches = chunk(trackingNumbers, 50);
    const results = [];
    for (const batch of batches) {
      const raw = await this.client.get('/getManyTracking/', { tracking: batch.join(',') }, apiKey);
      results.push(...this.mapper.toNormalizedStatuses(raw));
    }
    return results;
  }
  // getShipmentStatus, createShipment, updateStatus follow the same pattern
}
```

Note the client **never logs the constructed `url`** directly (only the path + status code) — this is the concrete fix for the "credential in query string" risk from §1.3.

### 4.3 Environment variables — platform-level only

```env
# .env.example — checked into the repo; real values never committed
DELIVERY_API_URL=https://api.elogistia.com
DELIVERY_API_TIMEOUT_MS=10000
DELIVERY_RATE_LIMIT_PER_MINUTE=100

# Master key ENCRYPTING each tenant's individually-stored Elogistia API key
# (see 4.4 — this is a KMS key reference/data key, not a shared Elogistia credential)
DELIVERY_CREDENTIALS_ENCRYPTION_KEY_ID=
```

**No `DELIVERY_API_KEY` env var exists in this design**, deliberately: Elogistia keys are per-tenant, not a single platform secret, so a global `DELIVERY_API_KEY` would be the wrong shape here and would force every seller to share one Elogistia account. If a later integration *does* have a single platform-wide credential (e.g. a shared sandbox account for internal testing), the same pattern from the prompt applies directly:
```env
DELIVERY_API_KEY=
DELIVERY_API_URL=
```
— loaded via `process.env`/`ConfigService`, never inlined in source.

### 4.4 Where secrets are stored

| Secret | Where | Why |
|---|---|---|
| Local development values | `.env` (git-ignored) | Never committed; `.env.example` (committed, no real values) documents required keys |
| Staging/production platform config (`DELIVERY_API_URL`, timeouts, the KMS key **ID** — not the key material itself) | Cloud secrets manager (AWS Secrets Manager or SSM Parameter Store — matches `ARCHITECTURE.md` §3 stack choice), injected as env vars at deploy time via the container orchestrator (ECS task definition secrets) | Keeps real secrets out of CI logs, Docker images, and source control entirely |
| Per-tenant Elogistia API keys | **Encrypted at rest in Postgres**, in `delivery_provider_connections.credentials` (JSONB), using envelope encryption: a per-row data key encrypted by a master key held in KMS (AWS KMS / GCP KMS), referenced only by key **ID** in env config | These are customer secrets, not platform secrets — they must never appear in `.env` at all, must be decrypted only in-memory at call time, and must be individually rotatable/revocable per tenant without touching platform config |
| CI/CD secrets (deploy credentials, registry tokens) | GitHub Actions **encrypted repo/environment secrets** | Standard practice; never echoed in workflow logs |

**Operational rules that follow from this:**
- Never `console.log`/print a full request URL or the raw `credentials` JSONB — mask to last 4 characters in any UI or log (`••••e454`).
- Rotate a tenant's key immediately if the seller reports it as compromised — this is a UI action (re-enter key → decrypt old key discarded, new key encrypted and stored), not a deploy.
- Any API key value that appears in a shared document (like the sample keys in this Postman export) should be treated as **potentially exposed** and rotated by whoever owns that Elogistia account, as a precaution — the example values above were placeholders/samples from the collection, not values to reuse.
