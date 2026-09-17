# Deploying to Vercel

A practical, run-it-top-to-bottom guide covering both Vercel projects in this repo:

- **`apps/api`** — Express + Prisma/Postgres backend (multi-tenant, DB-backed, OAuth token storage).
- **`apps/web`** — Next.js frontend, which itself holds **two independent integrations**:
  - `/dashboard` — a backend-for-frontend that reads `apps/api`'s database.
  - `/live` + `/api/elogistia/*` + `/api/meta/*` — a separate, stateless, no-database integration that calls Elogistia/Meta directly on every request.

For the reasoning behind any given piece of this, the focused docs go deeper: `docs/deployment-vercel.md` (backend), `docs/deployment-vercel-frontend.md` (`/dashboard`), `docs/deployment-vercel-serverless.md` (`/live`), `docs/security-review.md` (posture), `docs/production-deployment.md` (the original walkthrough this guide distills into a checklist).

---

## 1. Required environment variables

### `apps/api` (Vercel project 1)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | **Pooled** connection string (Vercel Postgres/Neon/Supabase). An unpooled URL exhausts its connection limit under real serverless concurrency. |
| `DELIVERY_CREDENTIALS_ENCRYPTION_KEY` | Yes | 32 random bytes, base64. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `JWT_SECRET` | Yes | Same generation command. Signs tenant session tokens. |
| `META_OAUTH_STATE_SECRET` | Yes | Same generation command. Signs the OAuth `state` param. |
| `INTERNAL_API_TOKEN` | Yes | Same generation command. Gates `/internal/sync` routes and (if enabled) the demo-login route. **Also set as Vercel's `CRON_SECRET`, same value** — Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. |
| `META_APP_ID` / `META_APP_SECRET` | Yes | From your Meta developer app. Only the secret is sensitive. |
| `META_OAUTH_REDIRECT_URI` | Yes | Must exactly match a "Valid OAuth Redirect URI" on the Meta app, e.g. `https://<backend-domain>/api/meta-ads/oauth/callback`. You only know the real domain after the first deploy — see §5. |
| `CORS_ALLOWED_ORIGINS` | No (default: block all) | Set to the frontend's real domain after it's deployed (§5). |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Strongly recommended | Distributed rate limiting — required for correctness once this runs as more than one instance. Falls back to an in-memory limiter (broken across instances) if unset. |
| `ENABLE_DEMO_AUTH` | No (default `false`) | Leave `false` on any deployment holding real seller data — see `docs/security-review.md`. |
| `DELIVERY_API_URL`, `DELIVERY_API_TIMEOUT_MS`, `DELIVERY_RATE_LIMIT_PER_MINUTE`, `META_GRAPH_API_BASE_URL`, `META_GRAPH_API_VERSION`, `META_ADS_RATE_LIMIT_PER_MINUTE`, `META_ADS_API_TIMEOUT_MS`, `*_SYNC_CRON` | No | Sensible defaults in `apps/api/src/infrastructure/config/env.ts`; override only if you know why. |

Full annotated list: `apps/api/.env.example`.

### `apps/web` (Vercel project 2)

| Variable | Required | Notes |
|---|---|---|
| `BACKEND_API_URL` | Yes (for `/dashboard`) | The `apps/api` project's URL. |
| `INTERNAL_API_TOKEN` | Yes (for `/dashboard`) | Must **exactly match** the backend's value. |
| `LIVE_DASHBOARD_USER` / `LIVE_DASHBOARD_PASSWORD` | Yes (for `/live`) | HTTP Basic Auth gating `/live` and all of `/api/elogistia/*`, `/api/meta/*` — **fails closed**: unset means every protected path 401s. |
| `ELOGISTIA_API_KEY` | Yes (for `/live`) | Single platform-level key (this integration is single-account). |
| `META_ACCESS_TOKEN` | Yes (for `/live`) | Long-lived token, ~60 day expiry, **no automatic refresh** — see §6 (error 13). |
| `META_AD_ACCOUNT_ID` | Yes (for `/live`) | Including the `act_` prefix. |
| `ELOGISTIA_API_URL`, `ELOGISTIA_API_TIMEOUT_MS`, `META_GRAPH_API_BASE_URL`, `META_GRAPH_API_VERSION`, `META_API_TIMEOUT_MS` | No | Sensible defaults in `apps/web/src/lib/serverless/env.ts`. |

Full annotated list: `apps/web/.env.example`. **Every variable in both apps is read server-side only — none is prefixed `NEXT_PUBLIC_`.** Verify with `grep -rn NEXT_PUBLIC apps/web/src` before every deploy; it should return nothing for a secret.

In the Vercel dashboard, set each variable's **Environment** scope deliberately (Production / Preview / Development) — a var set only for Production won't exist in a Preview deploy, which is a common source of "works on my deploy, not on this PR's preview" confusion.

---

## 2. Local testing commands

Run from each app's own directory (`apps/api/`, `apps/web/`).

```bash
# One-time setup
npm install                          # apps/api's postinstall runs `prisma generate`
cp .env.example .env                 # apps/api
cp .env.example .env.local           # apps/web
# fill in real/dev values in both files

# apps/api
npm run typecheck                    # tsc --noEmit
npm test                             # jest - 123 tests as of this doc
npm run db:seed                      # optional: deterministic demo data
npm run dev                          # ts-node-dev, http://localhost:3000

# apps/web (in a second terminal)
npm run typecheck
npm run dev                          # next dev, http://localhost:3000 (change PORT if both run at once)
```

Smoke-test both integrations once running:

```bash
# apps/api health
curl http://localhost:3000/health                                  # -> {"status":"ok"}

# /dashboard's BFF path (needs a session cookie - use the browser, not curl, for this one)

# /live's routes (needs LIVE_DASHBOARD_USER/PASSWORD from .env.local)
curl -u "$LIVE_DASHBOARD_USER:$LIVE_DASHBOARD_PASSWORD" http://localhost:3000/api/elogistia/orders
curl -u "$LIVE_DASHBOARD_USER:$LIVE_DASHBOARD_PASSWORD" http://localhost:3000/api/meta/campaigns
```

A request to `/api/elogistia/*` or `/api/meta/*` with no credentials should return `401 {"error":"Authentication required"}` — if it doesn't, `LIVE_DASHBOARD_USER`/`PASSWORD` aren't being read (check `.env.local` is actually in `apps/web/`, not the repo root).

---

## 3. Build verification

Run the **production build** locally before every deploy — `next dev`/`ts-node-dev` hide a class of bugs (static-vs-dynamic rendering, CSP nonce timing) that only show up under a real build.

```bash
# apps/api
cd apps/api
npm run build                        # tsc -p tsconfig.json -> dist/
npm run typecheck
npm test
npm audit --omit=dev                 # expect 0 vulnerabilities

# apps/web
cd apps/web
npm run build                        # next build
npm run typecheck
npm audit --omit=dev
```

What a clean `apps/web` build looks like — check the route table for two things:

```
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/elogistia/orders        ← must be ƒ (dynamic), never ○ (static)
├ ƒ /api/elogistia/statuses
├ ƒ /api/elogistia/tracking
├ ƒ /api/logout
├ ƒ /api/meta/campaigns
├ ƒ /api/meta/insights
├ ƒ /api/session
├ ƒ /dashboard
├ ƒ /live                        ← must be ƒ, not ○ - see §6 error 12
└ ƒ /login

ƒ Proxy (Middleware)              ← must say "Proxy", not print a
                                    "middleware" deprecation warning
```

1. **Every route that reads a cookie, a secret, or live data must show `ƒ`, not `○`.** A `○` next to `/live` or `/login` means it got statically prerendered and will silently misbehave in production (see §6, error 12) even though the build itself succeeds.
2. **No `⚠ The "middleware" file convention is deprecated` warning.** This repo already uses `src/proxy.ts`; if you ever see this warning again, something reintroduced a `middleware.ts`.

Then locally serve the actual production build (not `next dev`) and re-run the smoke tests from §2 against it:

```bash
npm run start        # apps/web: next start
npm run start         # apps/api: node dist/main.js
```

---

## 4. Vercel configuration

Both projects live in the same GitHub repo — import it **twice** as two separate Vercel projects.

### `apps/api`

- **Root Directory:** `apps/api`
- **Framework Preset:** Other
- **Build Command:** leave as configured in `apps/api/vercel.json` (`npm run vercel-build`, which is `prisma generate` — the actual server code is plain compiled-on-the-fly TypeScript run through `api/index.ts`, Vercel's Node builder, not a separate build artifact).
- `apps/api/vercel.json` already defines:
  ```json
  {
    "buildCommand": "npm run vercel-build",
    "rewrites": [{ "source": "/(.*)", "destination": "/api" }],
    "crons": [
      { "path": "/api/delivery/internal/sync", "schedule": "*/15 * * * *" },
      { "path": "/api/meta-ads/internal/sync", "schedule": "0 * * * *" }
    ]
  }
  ```
  No changes needed here unless you add a new sync job.
- **Set `CRON_SECRET`** (Vercel's own reserved env var name) to the same value as `INTERNAL_API_TOKEN` — Vercel Cron authenticates its own requests with it automatically.
- Prisma's `binaryTargets` in `schema.prisma` already includes `rhel-openssl-3.0.x` for Vercel's Amazon Linux runtime alongside `native` for local dev — don't remove either.

### `apps/web`

- **Root Directory:** `apps/web`
- **Framework Preset:** Next.js (auto-detected)
- **No `vercel.json` needed** — zero-config. Per-route `maxDuration` is already set in source (`export const maxDuration = ...` in each `/api/elogistia/*`, `/api/meta/*` route: 15–20s).
- **Confirm your plan supports those `maxDuration` values before relying on them.** Hobby's default cap is lower than 15s unless Fluid Compute applies to the project; Pro allows up to 300s. If your plan doesn't cover it, either upgrade or lower the exported value and accept a smaller Meta-pagination page count (§6, error 3).
- Both integrations' secrets (`ELOGISTIA_API_KEY`, `META_ACCESS_TOKEN`, `LIVE_DASHBOARD_PASSWORD`, `INTERNAL_API_TOKEN`) should be marked **Sensitive** in the Vercel dashboard (hides the value from the UI/logs after save).

### Both projects

- **Root Directory** is the one setting people most often get wrong on a monorepo — double check it before the first deploy, not after a confusing build failure.
- Enable **Preview Deployments** if you want per-PR previews, but remember §1's note: env vars need the **Preview** scope checked too, or every preview will fail exactly like production would with that var missing.

---

## 5. Deployment steps

1. **Provision Postgres** (pooled connection string) — needed for `apps/api` only. Keep the string for step 3.
2. **Generate secrets** (§1's `node -e "..."` commands) for `DELIVERY_CREDENTIALS_ENCRYPTION_KEY`, `JWT_SECRET`, `META_OAUTH_STATE_SECRET`, `INTERNAL_API_TOKEN`/`CRON_SECRET`. Get `META_APP_ID`/`META_APP_SECRET` from your Meta developer app.
3. **Deploy `apps/api`:** new Vercel project → import repo → Root Directory `apps/api` → set every §1 variable (leave `CORS_ALLOWED_ORIGINS` blank and `META_OAUTH_REDIRECT_URI` as a placeholder for now — you don't know the real domains yet) → deploy.
4. **Run migrations against the production database**, as a deliberate manual step (not part of the Vercel build, so you're never migrating prod as a side effect):
   ```bash
   DATABASE_URL="<production connection string>" npx prisma migrate deploy
   ```
   from `apps/api/`, locally or in your own CI step.
5. **Verify the backend:** `curl https://<backend-domain>/health` → `{"status":"ok"}`.
6. **Update `META_OAUTH_REDIRECT_URI`** on the backend project to the real domain from step 3, and add the same URL as a Valid OAuth Redirect URI on the Meta app. Redeploy.
7. **Deploy `apps/web`:** new Vercel project → same repo → Root Directory `apps/web` → set every §1 variable (`BACKEND_API_URL` = the backend's real domain from step 3) → deploy.
8. **Close the CORS loop:** set `CORS_ALLOWED_ORIGINS` on the backend project to the frontend's real domain from step 7, redeploy the backend.
9. **Verify `/dashboard`:** visit the frontend, log in (demo flow, if `ENABLE_DEMO_AUTH=true` on the backend), confirm the dashboard renders.
10. **Verify `/live`:** visit `https://<frontend-domain>/live`, enter `LIVE_DASHBOARD_USER`/`PASSWORD` at the browser's Basic Auth prompt, confirm campaigns/orders render with no failed requests in the Network tab.
11. **Confirm the crons fired at least once** (Vercel dashboard → project → Cron Jobs → check run history) within the first sync interval.

---

## 6. Common production errors and fixes

| # | Symptom | Cause | Fix |
|---|---|---|---|
| 1 | Buttons/forms silently do nothing; console shows `Refused to execute inline script because it violates ... Content-Security-Policy` | A page needing per-request state (a CSP nonce, a cookie) got statically prerendered, so it never received the nonce `src/proxy.ts` generates per-request | Force dynamic rendering: wrap the page in an async Server Component that calls `await connection()` (or reads `cookies()`/`headers()`) before rendering any client child — see error 12, and `src/app/login/page.tsx` / `src/app/live/page.tsx` for the pattern already applied |
| 2 | Every request to `/live` or `/api/elogistia\|meta/*` returns `401 Authentication required`, even with what you believe are the right credentials | `LIVE_DASHBOARD_USER`/`PASSWORD` unset in this environment's Vercel scope (fails closed by design), or set only for Production while you're testing a Preview deploy | Set both vars for **every** environment scope you test in (§1), redeploy |
| 3 | `FUNCTION_INVOCATION_TIMEOUT` on `/api/meta/campaigns` or `/api/meta/insights` for a large ad account | Meta's cursor pagination is sequential (can't `Promise.all` across pages); enough pages at even a large page size can exceed `maxDuration` | Confirm `limit=500` is still applied in `metaGetAllPages` (raises page size, cuts round-trips); raise `maxDuration` if your plan allows (§4) |
| 4 | A newly-added Vercel Cron job never fires / logs 404 or 405 | Vercel Cron only issues **GET** requests; a route defined as POST-only has no GET handler | Add a `GET` alias next to the `POST` handler for any route a cron will hit (already done for `/internal/sync` routes — copy that pattern for new ones) |
| 5 | A cron-triggered sync route returns 401 even though `CRON_SECRET` is set correctly | Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; a route checking only a custom header (e.g. `x-internal-token`) never sees it | Accept both conventions in the auth check (already done in `requireInternalToken`) — verify if you add a new internal route |
| 6 | Prisma throws `Query Engine ... not found` / a binary-target error, only on Vercel | `schema.prisma`'s `binaryTargets` regenerated without `rhel-openssl-3.0.x` (Vercel's Amazon Linux runtime) | Restore both `"native"` and `"rhel-openssl-3.0.x"` in `generator client { binaryTargets = [...] }`, commit, redeploy |
| 7 | Intermittent `too many connections` / `FATAL: remaining connection slots are reserved` from Postgres under real traffic | `DATABASE_URL` points at an **unpooled** connection; every concurrent function invocation opens its own connection | Switch to a pooled connection string (Vercel Postgres/Neon/Supabase all provide one) |
| 8 | Browser console: CORS error calling the backend from the frontend | `CORS_ALLOWED_ORIGINS` on `apps/api` doesn't include the frontend's real domain | Set it (§5 step 8), redeploy the backend — remember this only matters for genuine browser-initiated calls, not the BFF's server-to-server ones |
| 9 | Meta OAuth callback fails with `redirect_uri does not match` | `META_OAUTH_REDIRECT_URI` was set before the real domain existed, or has a trailing-slash/protocol mismatch vs. the Meta app's configured URI | Update both to match exactly (§5 step 6), redeploy |
| 10 | Build succeeds locally, fails on Vercel citing a missing/undefined env var | The var exists in your local `.env`/`.env.local` but wasn't added to the Vercel project, or was added to the wrong environment scope | Add it in Vercel dashboard → Environment Variables, check the right scope(s), redeploy |
| 11 | `Module not found: Can't resolve '@/lib/...'` only on Vercel, never locally | Vercel builds on a case-sensitive filesystem (Linux); local macOS/Windows dev tolerates a mismatched import casing that Linux won't | Match the import path's casing to the file name exactly |
| 12 | A page that reads cookies/session/live data renders stale or breaks after deploy, despite a successful build | The page (or a `'use client'` file it's the entry point for) got statically prerendered — `export const dynamic = 'force-dynamic'` is silently ignored when exported from a `'use client'` module | Split into a thin async Server Component wrapper that calls `await connection()` and renders the real (client) page as a child — check the build's route table (§3) shows `ƒ`, not `○`, for every such route |
| 13 | Every `/api/meta/*` route starts returning `401`/`kind: "auth"` after weeks of working fine | `META_ACCESS_TOKEN` is a long-lived token (~60 day expiry) with **no automatic refresh** in this integration by design (no persistence to store a refreshed one) | Regenerate a long-lived token (`.env.example` has the exact `curl`/Graph API steps) and update the Vercel env var before/at expiry — put a calendar reminder on this |
| 14 | `/api/elogistia/*` starts returning `429`/`kind: "rate_limit"` under real traffic | Single shared Elogistia API key, no distributed rate limiter across function instances (no Redis, by design) | Keep `/live` behind its Basic Auth gate to bound who can trigger requests; if legitimate traffic alone exceeds 100 req/min, this integration's "no persistence" constraint has been outgrown — that's the signal to move this data onto `apps/api`'s DB-backed sync instead |
| 15 | A route handler behaves as if an env var change didn't take effect | Vercel doesn't hot-reload env vars into an already-built deployment | Redeploy after adding or changing **any** environment variable — a dashboard save alone does not affect running functions |
