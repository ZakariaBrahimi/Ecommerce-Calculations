# ProfitFlow AI — Security Review

Scope: the whole `apps/api` backend (Elogistia delivery integration + Meta Ads integration) and the repository as a whole. This is a point-in-time review — re-run the checks in §5 whenever dependencies change or before a production deploy.

## 1. What must never be exposed, and where it actually lives

| Secret | Where it lives | Who/what can read the plaintext |
|---|---|---|
| **A seller's Elogistia API key** | `delivery_provider_connections.encrypted_api_key` — AES-256-GCM ciphertext, one row per tenant | Only `TenantCredentialsService`, in memory, for the duration of one sync/API call. Never logged, never returned by any endpoint, never in a URL query string that could reach a log or a `Referer` header. |
| **A seller's Meta access token** | `meta_ad_account_connections.encrypted_access_token` — same AES-256-GCM scheme | Only `MetaConnectionResolver`, in memory, per call. Sent to Meta only via an `Authorization: Bearer` header, never a query string. |
| **Database password** | Embedded in `DATABASE_URL`, an environment variable | Only `PrismaClient` at connection time. Never logged (no query logging is enabled — see §3). |
| **Encryption master key** (`DELIVERY_CREDENTIALS_ENCRYPTION_KEY`) | Environment variable, decodes to 32 random bytes | Only `AesGcmCredentialsCipher` at process start. Decrypts every row above — the single most sensitive value in the system (see §6 for why this shouldn't stay a static env var in production). |
| **Meta app secret** (`META_APP_SECRET`) | Environment variable | Only `MetaAdsProvider`, used exclusively server-side during the OAuth code→token exchange. Never sent to the frontend, never logged. |
| **JWT signing secret**, **OAuth state secret**, **internal API token** | Environment variables | Signing/verifying tenant sessions, signing the OAuth `state` param, and gating the internal sync-trigger routes, respectively. Three separate secrets on purpose — a leak of one never compromises the others. |

None of the above is ever hardcoded in source. Verified by grepping the full git history (`git log --all -p`) for key/token/password-shaped literals — every match is a type declaration, a parameter name, or a test fixture using an obviously fake value (`'tok_abc'`, `'valid-key'`), never a real credential.

## 2. Findings from this pass, and what was fixed

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | `RateLimiter.acquire()` was called *outside* the `try/catch` in both `ElogistiaHttpClient` and `MetaGraphHttpClient` — a limiter failure (e.g. Redis unreachable) would throw a raw, untyped `Error` past the app's error boundary instead of the expected `DeliveryRateLimitError`/`MetaRateLimitError`. | Medium (availability/correctness, not a leak) | Both clients now wrap the acquire call and re-throw as the correct typed error. Covered by new tests (`ElogistiaHttpClient.test.ts`, `MetaGraphHttpClient.test.ts`). |
| 2 | `requireInternalToken`'s comparison used `!==` on strings — a timing side-channel (however marginal) for a secret comparison. | Low | Switched to `crypto.timingSafeEqual` with a length check first (`constantTimeEquals`). |
| 3 | No inbound rate limiting on the HTTP API itself — only outbound calls to Elogistia/Meta were throttled. A caller could hammer `/oauth/callback` or `/connections` with no limit. | Medium | Added `express-rate-limit`: a 300 req/min baseline on all of `/api/*`, and a stricter 20 req/min limit on `/connections`, `/oauth/callback`, and `/ad-account` (the endpoints that trigger an external OAuth exchange or write a credential). |
| 4 | No CORS policy — fine as a default-deny (browsers can't call it cross-origin at all), but also no path to actually allow the real frontend once one exists, other than editing code. | Low (hardening) | Added `cors()` restricted to an explicit `CORS_ALLOWED_ORIGINS` allowlist (never `*`), empty by default (blocks all cross-origin browser access until configured). |
| 5 | No standard security headers (`X-Content-Type-Options`, disabled `X-Powered-By`, etc.). | Low (defense in depth) | Added `helmet()` and `app.disable('x-powered-by')`. |
| 6 | `uuid@9` (direct dependency) and `node-cron@3` (transitively depends on a vulnerable `uuid`) both carried a moderate advisory (GHSA-w5hq-g745-h8pq). | Medium | The `uuid` package was **entirely unused** — every entity already generates ids with Node's built-in `crypto.randomUUID()` — so it was deleted outright. `node-cron` was upgraded to `^4.6.0`, which dropped the vulnerable dependency. `npm audit` now reports **0 vulnerabilities**. |
| 7 | `TokenBucketRateLimiter` (both integrations) is in-memory — correct only within a single long-lived process. Silently deploying this as-is to a horizontally-scaled or serverless environment would under-enforce the real provider's rate limit without any error or warning. | Medium (surfaced, not fully closed — see §6) | Added `UpstashRedisRateLimiter` (Upstash's REST API, so it works from a stateless serverless function) implementing the same `RateLimiter` port, selected automatically via `createRateLimiter()` when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set; falls back to the in-memory limiter otherwise and **logs a warning** if it detects it's running serverless (`VERCEL=1`) without Redis configured, rather than failing silently. |

Everything above was verified with the existing test suite plus new tests, not just by inspection — `npm test` is 112/112 passing, `npm run typecheck` is clean, `npm audit` is clean.

## 3. Protections already in place before this review (verified, not just asserted)

- **Encryption at rest**: every tenant secret (Elogistia key, Meta token) is AES-256-GCM encrypted before it touches Postgres, via `AesGcmCredentialsCipher`. Decrypted only in memory, only for the call that needs it.
- **Logging redaction**: `PinoLogger` redacts `apiKey`, `key`, `token`, `password`, `encryptedApiKey`, `authorization` and their nested equivalents (`*.apiKey`, `*.key`, `*.token`) at the logger level — defense in depth on top of application code that already avoids passing secrets into log metadata.
- **No secret ever travels in a logged URL.** Elogistia's API is query-string-authenticated (not our choice — that's how the provider works); `ElogistiaHttpClient` never logs the constructed URL, only the path and outcome. Meta's client uses a header, so this class of risk doesn't apply there at all.
- **Central error boundary**: `errorHandler` only ever returns a typed `code`/`message` pair for known `DeliveryIntegrationError`/`MetaAdsIntegrationError` subclasses; anything else becomes a generic `500` with no stack trace, no provider payload, and no credential material in the response body — full detail goes to the server-side log only.
- **No SQL injection surface**: 100% Prisma (parameterized) — no raw SQL anywhere in the codebase.
- **Frontend never sees a provider secret.** The only credential the browser ever holds is its own ProfitFlow AI session JWT. A seller's Elogistia key is submitted once and never returned by any response (verified: `ConnectDeliveryProviderUseCase`'s result type has no key field); the Meta token similarly never leaves the backend after OAuth completes.
- **Distinct secrets for distinct trust boundaries**: tenant JWT ≠ OAuth state secret ≠ internal API token ≠ encryption master key. A compromise of one doesn't cascade into the others.
- **`.gitignore`** excludes `.env`/`.env.local` at the repo root, and git history has been checked (§1) to confirm no real secret was ever committed.

## 4. Recommendations not yet implemented (honest gaps)

- **KMS-backed envelope encryption.** `DELIVERY_CREDENTIALS_ENCRYPTION_KEY` is currently a single static env var. That's fine for this stage, but it means anyone with read access to the production environment's variables can decrypt every tenant secret in the database. Production should move to a real KMS (AWS KMS / GCP KMS): the app holds only a *reference* to a key, and encryption/decryption calls go through the KMS API, which can be access-controlled and audited independently of the app's own env vars. `CredentialsCipher` is already an interface for exactly this reason — swapping the implementation doesn't touch any use case.
- **Secret scanning in CI.** Nothing currently runs `gitleaks`/`trufflehog` on pull requests. Recommended before this repo takes outside contributions.
- **Distributed rate limiting isn't the default** — it activates only when Upstash is configured (see finding #7). Before real production traffic on a horizontally-scaled or serverless deployment, set `UPSTASH_REDIS_REST_URL`/`_TOKEN`; otherwise the limiter under-enforces (not over-enforces) the real Elogistia/Meta limits, which risks the *provider* rate-limiting or suspending the account, not a security leak per se, but a real availability risk.
- **Secret rotation isn't automated.** Rotating the JWT secret, OAuth state secret, or encryption key today means: generate a new value, update the env var, redeploy. For the encryption key specifically, rotating it requires re-encrypting every stored credential with the new key (a migration script, not yet written) — flag this before actually rotating it in production.
- **No dependency-vulnerability CI gate.** `npm audit` is clean today; nothing stops a future dependency bump from reintroducing a vulnerability unnoticed. Recommend adding `npm audit --audit-level=high` (or Dependabot/Snyk) as a CI check.

## 5. How to re-run this review

```bash
cd apps/api
npm audit                        # dependency vulnerabilities
npm test                         # 112 tests, includes the rate-limiter/error-wrapping fixes above
npm run typecheck
git log --all -p | grep -iE "api[_-]?key\s*[:=]\s*['\"a-z0-9]|password\s*[:=]\s*['\"]"   # spot-check for leaked literals
```

## 6. Deployment secrets management

See `docs/deployment-vercel.md` for how these same secrets are provisioned, scoped, and rotated once this runs on Vercel.
