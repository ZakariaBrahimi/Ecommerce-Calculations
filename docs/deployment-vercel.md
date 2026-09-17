# Deploying `apps/api` to Vercel

## Read this first: does Vercel actually fit this app?

Vercel runs your code as **serverless functions** — one HTTP request spins up (or reuses a warm) isolated instance, executes, and the instance is gone. There is no persistent background process. Two things in this codebase assumed a persistent process, and both had to change before this could deploy to Vercel correctly:

1. **`node-cron` schedulers** (`DeliverySyncScheduler`, `MetaAdsSyncScheduler`) — a `setInterval`-style in-process cron **does not run** on Vercel; the function that started it is torn down between requests. Fixed by: the schedulers are simply never started under `api/index.ts` (see below); **Vercel Cron Jobs** (configured in `vercel.json`) hit the existing `/internal/sync` routes on a schedule instead, which do the exact same work as a one-off HTTP call.
2. **In-memory rate limiting** (`TokenBucketRateLimiter`) — its token bucket lives in one process's memory. Under serverless, every invocation may be a different process, so the bucket doesn't actually track a shared count across your real traffic. Fixed by: `createRateLimiter()` automatically switches to `UpstashRedisRateLimiter` (a Redis-backed, HTTP-only limiter that works from a stateless function) once `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set — **set these before relying on this in production**; without them the app still runs, but logs a warning and under-enforces the limit per-instance rather than platform-wide.

If neither of those trade-offs is acceptable for your traffic pattern (e.g. you need sub-minute sync intervals, which Vercel Cron's minimum granularity and plan limits may not support), a normal long-running Node host (Render, Fly.io, a plain VM/ECS task) is the simpler choice and needs none of the above — `apps/api` still runs as a normal Express server via `npm start` either way. This doc covers the Vercel path because it's what was asked for; both are "correct" deployments of the same codebase.

## 1. Project setup on Vercel

This is a monorepo — the deployable backend lives in `apps/api/`, not the repo root.

1. Import the repository into a new Vercel project.
2. In **Project Settings → General → Root Directory**, set it to `apps/api`.
3. Framework preset: **Other** (this is a plain Node/Express app, not Next.js).
4. Build command: leave as `npm run vercel-build` (already set in `apps/api/package.json` and mirrored in `apps/api/vercel.json`) — it runs `prisma generate`. Install command: default (`npm install`), which also triggers `prisma generate` again via the `postinstall` script — harmless, it's idempotent.
5. Vercel auto-detects `apps/api/api/index.ts` as a serverless function and `apps/api/vercel.json`'s `rewrites` to route all paths to it, and its `crons` block to register the two scheduled sync triggers.

## 2. Environment variables — set every one of these before the first deploy

Set these in **Project Settings → Environment Variables**, scoped per environment (Production / Preview / Development — see §3). The full annotated list with generation commands lives in `apps/api/.env.example`; the summary:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | See §4 — use a **pooled** connection string, not a direct one. |
| `DELIVERY_CREDENTIALS_ENCRYPTION_KEY` | 32 random bytes, base64. Mark **Sensitive** (see §3). |
| `JWT_SECRET`, `META_OAUTH_STATE_SECRET`, `INTERNAL_API_TOKEN` | Three independent random secrets. Mark **Sensitive**. |
| `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` | From your Meta developer app. The redirect URI must exactly match your Vercel production domain's callback path. Mark `META_APP_SECRET` **Sensitive**. |
| `DELIVERY_API_URL`, `META_GRAPH_API_BASE_URL`, etc. | Non-secret config, safe as plain env vars. |
| `CORS_ALLOWED_ORIGINS` | Your frontend's real origin(s), comma-separated. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | See the intro above — required for correct rate limiting once you have real traffic. Mark the token **Sensitive**. |
| `CRON_SECRET` | Set this to **the same value as `INTERNAL_API_TOKEN`**. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when invoking your Cron Jobs — `requireInternalToken` accepts that header alongside the app's own `x-internal-token` convention specifically so this lines up with no extra code. Mark **Sensitive**. |

Never set `DELIVERY_API_KEY` or `META_ACCESS_TOKEN` here — as explained in `apps/api/.env.example`, those aren't platform-level secrets in this system; each seller supplies their own through the app itself, encrypted per tenant in the database.

## 3. How Vercel manages these secrets (and what that does and doesn't protect against)

- Environment variables are stored encrypted at rest by Vercel and are scoped independently to **Production**, **Preview**, and **Development** — a Preview deployment (e.g. from a pull request) does not automatically get your production secrets unless you explicitly assign the variable to that environment too. Keep production credentials (real Meta app secret, real database) out of Preview/Development scopes where practical.
- Marking a variable **Sensitive** (a checkbox when adding/editing it) hides its value from the dashboard and build logs after it's set — even from people with project access, it becomes write-only. Do this for every secret in the table above.
- Team **roles** control who can view/edit environment variables at all — restrict this to the people who actually need it, same principle as least-privilege on any other system.
- Variables are injected into the function's runtime environment; they are **never** bundled into client-side JavaScript unless a framework's own convention says otherwise (this project has no frontend build step that would do that — pure backend). Nothing here is served to the frontend, deliberately.
- `vercel env pull` fetches a project's env vars into a local `.env.local` for `vercel dev` — treat that file exactly like `.env` (already covered by `.gitignore`; never commit it).
- What this does **not** do: it doesn't rotate secrets for you, and it doesn't stop someone with dashboard access from setting a new value and viewing it before saving. Rotation is still a manual step (generate new value → update the variable → redeploy); for `DELIVERY_CREDENTIALS_ENCRYPTION_KEY` specifically, rotating it requires re-encrypting stored credentials first — see `docs/security-review.md` §4.

## 4. Database (Prisma + serverless)

- **Use a pooled connection string.** Each serverless invocation can open its own database connection; without pooling, moderate concurrent traffic exhausts Postgres's connection limit. Use a provider with a built-in pooler (Vercel Postgres / Neon / Supabase all offer one — the connection string usually has `-pooler` in the hostname or a `?pgbouncer=true` param) rather than a direct connection string.
- `prisma/schema.prisma` already declares `binaryTargets = ["native", "rhel-openssl-3.0.x"]` — the second target matches Vercel's Node.js serverless runtime (Amazon Linux), so the correct Prisma query engine binary is generated and bundled automatically at build time. No action needed unless Vercel changes its underlying runtime OS in the future.
- **Migrations are not run automatically on every deploy**, deliberately — auto-migrating a production database on every push is how you turn a bad migration into an incident. Run `npx prisma migrate deploy` yourself (locally against the production `DATABASE_URL`, or as a manual/reviewed CI step) when you actually intend to ship a schema change, separately from the app deploy itself.

## 5. Automatic synchronization on Vercel (Cron Jobs)

`vercel.json`'s `crons` block:

```json
"crons": [
  { "path": "/api/delivery/internal/sync", "schedule": "*/15 * * * *" },
  { "path": "/api/meta-ads/internal/sync", "schedule": "0 * * * *" }
]
```

Vercel Cron Jobs issue a **GET** request to the given path (both routes accept GET as an alias of the existing POST, specifically for this) and, when `CRON_SECRET` is set, automatically attach `Authorization: Bearer $CRON_SECRET` — which is why §2 says to set `CRON_SECRET` to the same value as `INTERNAL_API_TOKEN`.

Two things worth checking before relying on this:
- **Plan limits.** Vercel's Hobby plan caps how many Cron Jobs you can have and how frequently they can run (historically: fewer jobs, coarser minimum interval than Pro). If `*/15 * * * *` isn't accepted on your plan, either upgrade or widen the schedule — the sync logic itself doesn't care how often it's called, it just re-pulls whatever window it's configured for.
- **Function timeout.** A sync run that touches many tenants/campaigns needs to finish within your plan's max function duration. If a tenant base grows large enough that one Cron invocation can't finish in time, that's a sign to split the sync per-tenant across multiple invocations rather than one big loop — not a change needed at today's scale.

## 6. Local verification before you deploy

Everything in this doc was exercised locally before being written, not just described:

```bash
cd apps/api
npm install                 # triggers postinstall -> prisma generate
npm run typecheck           # includes api/index.ts
npm test                    # 112 tests
npx prisma migrate deploy   # against a real local Postgres, in this session
npm run db:seed             # seeds demo data, verified via raw SQL + the real use case
```

`api/index.ts` was also smoke-tested directly as a plain request handler (the same calling convention Vercel uses) — `/health` returns `200`, and `/api/delivery/internal/sync` / `/api/meta-ads/internal/sync` were confirmed to accept both `Authorization: Bearer <token>` and `x-internal-token` and to reject requests with neither.

`vercel dev` (Vercel CLI) will additionally exercise the actual rewrites/cron config locally if you want to confirm those before a real deploy — that step wasn't run in this session since it requires a linked Vercel project.
