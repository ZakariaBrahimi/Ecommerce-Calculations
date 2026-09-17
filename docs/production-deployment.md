# ProfitFlow AI — Production Deployment Guide

This is the master, step-by-step guide to deploying ProfitFlow AI to production: the `apps/api` backend and the `apps/web` frontend, as **two separate Vercel projects** from the same monorepo, sharing one Postgres database. Read this top to bottom on a first deploy; the two linked docs below go deeper on their half if you need it.

- Backend detail: `docs/deployment-vercel.md`
- Frontend detail: `docs/deployment-vercel-frontend.md`
- Security posture (what's protected, what's flagged as a known gap): `docs/security-review.md`

## Before you start: what "production" means for this app today

Be honest about scope going in. This deployment gives you: two real integrations (Elogistia delivery, Meta Ads) with encrypted per-tenant credentials, automatic sync, and a working dashboard — all reviewed for the secret-handling and hardening in `docs/security-review.md`. It does **not** yet give you: a real user signup/login system (the frontend's `/login` mints a demo session for whatever tenant id you type — see §7), or a payments/billing layer. Treat this as "production-ready for a single operator or an internal/trusted pilot," not "ready for public self-serve signup," until the Auth/Tenancy module in `ARCHITECTURE.md` is built.

## Step 1 — Provision the database

1. Create a Postgres database with a **pooled** connection string (Vercel Postgres, Neon, or Supabase all work — each has a pooler built in). A direct, unpooled connection string will exhaust its connection limit under real serverless concurrency.
2. Keep the connection string somewhere safe for a moment — it's `DATABASE_URL` in Step 3.
3. Don't run migrations yet — that's Step 4, after the backend project exists (so you're migrating the actual production database on purpose, not as a side effect of a build).

## Step 2 — Generate every secret up front

Running each of these once now means Step 3 is just pasting values, not context-switching to a terminal mid-setup:

```bash
# Encryption key for tenant credentials (Elogistia keys, Meta tokens) at rest
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # -> DELIVERY_CREDENTIALS_ENCRYPTION_KEY

# JWT signing secret (tenant sessions)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # -> JWT_SECRET

# OAuth state signing secret (Meta OAuth callback)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # -> META_OAUTH_STATE_SECRET

# Internal token - gates the sync-trigger routes AND (if you enable it) the demo-login route.
# Also set as Vercel's own CRON_SECRET on the backend project (see Step 4) - same value, both places.
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # -> INTERNAL_API_TOKEN / CRON_SECRET
```

You'll also need, from your Meta developer app (https://developers.facebook.com/apps): `META_APP_ID`, `META_APP_SECRET`.

## Step 3 — Deploy the backend (`apps/api`)

Full detail: `docs/deployment-vercel.md`. Summary:

1. New Vercel project → import this repo → **Root Directory: `apps/api`** → Framework: **Other**.
2. Set every environment variable from `apps/api/.env.example`, scoped to Production (and Preview, if you use preview deploys):
   - `DATABASE_URL` (Step 1)
   - `DELIVERY_CREDENTIALS_ENCRYPTION_KEY`, `JWT_SECRET`, `META_OAUTH_STATE_SECRET`, `INTERNAL_API_TOKEN` (Step 2) — mark all **Sensitive**
   - `META_APP_ID`, `META_APP_SECRET` (mark the secret **Sensitive**), `META_OAUTH_REDIRECT_URI` (set this to `https://<your-backend-domain>/api/meta-ads/oauth/callback` — you'll only know the real domain after the first deploy; redeploy once you do, or claim a custom domain first)
   - `CORS_ALLOWED_ORIGINS` — leave blank for now, come back and set it to your frontend's domain after Step 6
   - `CRON_SECRET` — same value as `INTERNAL_API_TOKEN` (see Step 2's note)
   - Leave `ENABLE_DEMO_AUTH` **unset** for now — see §7 before turning this on
   - `UPSTASH_REDIS_REST_URL` / `_TOKEN` — see §6, strongly recommended before real traffic
3. Deploy. Vercel runs `npm install` (triggers `prisma generate` via `postinstall`) then `vercel-build`.
4. **Run migrations against the production database** — this is a deliberate, separate step, not part of the Vercel build (see `docs/deployment-vercel.md` §4 for why):
   ```bash
   DATABASE_URL="<your production connection string>" npx prisma migrate deploy
   ```
   Run this from `apps/api/`, locally or as a manual CI step you trigger yourself.
5. Confirm it's alive: `curl https://<your-backend-domain>/health` → `{"status":"ok"}`.

## Step 4 — Wire up Vercel Cron (replaces the in-process scheduler)

Already configured in `apps/api/vercel.json` — nothing to do here except confirm your Vercel plan supports the schedule (`*/15 * * * *` for delivery sync, hourly for Meta Ads; see `docs/deployment-vercel.md` §5 for plan-limit caveats). After the first deploy, check **Project Settings → Cron Jobs** shows both jobs registered.

## Step 5 — (Optional but recommended) Seed or connect real data

- For a demo/staging environment: run `npm run db:seed` from `apps/api/` against the production `DATABASE_URL` to populate the realistic demo dataset used throughout this project's docs.
- For real production use: connect a real Elogistia account (`POST /api/delivery/connections`) and a real Meta Ads account (the OAuth flow at `/api/meta-ads/oauth/start`) for each real tenant, instead of seeding.

## Step 6 — Deploy the frontend (`apps/web`)

Full detail: `docs/deployment-vercel-frontend.md`. Summary:

1. **Second** Vercel project, same repo → **Root Directory: `apps/web`** → Framework: **Next.js** (auto-detected).
2. Environment variables (both server-only, neither prefixed `NEXT_PUBLIC_`):
   - `BACKEND_API_URL` = the backend project's URL from Step 3
   - `INTERNAL_API_TOKEN` = the exact same value you set on the backend in Step 3 (mark **Sensitive**)
3. Deploy — no custom build command needed, Vercel's Next.js defaults handle it.
4. Go back to the **backend** project and set `CORS_ALLOWED_ORIGINS` to this frontend's domain, then redeploy the backend (defense-in-depth; the main dashboard flow is server-to-server and doesn't strictly require this — see `docs/deployment-vercel-frontend.md`'s architecture note).

## Step 7 — Decide how people will actually log in

The frontend's `/login` page mints a session via `POST /api/auth/demo-token` — **this endpoint does not exist on the backend unless you explicitly set `ENABLE_DEMO_AUTH=true`**, and even then it requires the shared `INTERNAL_API_TOKEN`. Read `docs/security-review.md` §4 and `docs/deployment-vercel-frontend.md` §3 before deciding:

- **Trusted pilot / internal use, you control both deployments**: set `ENABLE_DEMO_AUTH=true` on the backend. Anyone who can reach `/login` on your frontend can open a session for any tenant id they type — acceptable only because you're the one giving out access to the frontend URL itself.
- **Anything more open than that**: don't enable it. Build the real Auth/Tenancy module first.

## Step 8 — Verify the whole thing end-to-end

```bash
# Backend health
curl https://<backend-domain>/health

# Security headers landed on both apps
curl -sI https://<backend-domain>/health | grep -iE "x-frame-options|strict-transport"
curl -sI https://<frontend-domain>/login  | grep -iE "x-frame-options|strict-transport"

# Full login -> dashboard flow (replace <tenant> with a real or seeded tenant id)
curl -sS -c /tmp/c.txt -X POST https://<frontend-domain>/api/session \
  -H "Content-Type: application/json" -d '{"tenantId":"<tenant>"}'
curl -sS -b /tmp/c.txt https://<frontend-domain>/dashboard | grep -o "Profitability overview"
```

This exact sequence (against `localhost`, not production) is what was actually run to validate this deployment before writing it down — see `docs/deployment-vercel-frontend.md` §5 for the full local verification transcript.

## Step 9 — Ongoing operations

- **Dependency audits**: `npm audit` in both `apps/api` and `apps/web` before every release; both are clean today (`docs/security-review.md`).
- **Secret rotation**: see `docs/deployment-vercel.md` §3. Rotating `DELIVERY_CREDENTIALS_ENCRYPTION_KEY` specifically requires re-encrypting stored credentials — don't rotate it casually.
- **Schema changes**: always `prisma migrate deploy` as a deliberate step (Step 3.4), never as an automatic part of a Vercel build.
- **Monitoring the Cron Jobs**: Vercel's dashboard shows recent invocations of `/api/delivery/internal/sync` and `/api/meta-ads/internal/sync` — check these after the first few hours live to confirm they're actually firing and succeeding.

## Quick-reference: every environment variable, by project

| Variable | Backend (`apps/api`) | Frontend (`apps/web`) |
|---|---|---|
| `DATABASE_URL` | ✅ required | — |
| `DELIVERY_CREDENTIALS_ENCRYPTION_KEY` | ✅ required | — |
| `JWT_SECRET` | ✅ required | — |
| `INTERNAL_API_TOKEN` | ✅ required | ✅ required (must match backend's) |
| `CRON_SECRET` | ✅ required (same value as `INTERNAL_API_TOKEN`) | — |
| `META_APP_ID` / `META_APP_SECRET` / `META_OAUTH_REDIRECT_URI` / `META_OAUTH_STATE_SECRET` | ✅ required | — |
| `CORS_ALLOWED_ORIGINS` | recommended (frontend's domain) | — |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | recommended before real traffic | — |
| `ENABLE_DEMO_AUTH` | only if you've read Step 7 | — |
| `BACKEND_API_URL` | — | ✅ required |

`DELIVERY_API_KEY` and `META_ACCESS_TOKEN` are **not** in this table on purpose — see the root `.env.example` for why: they aren't platform secrets in this system.
