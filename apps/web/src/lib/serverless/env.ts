/**
 * Env vars for the stateless, no-DB integration (src/app/api/elogistia/*,
 * src/app/api/meta/*). Deliberately separate from lib/backendClient.ts's
 * env vars (BACKEND_API_URL/INTERNAL_API_TOKEN, which proxy to apps/api) -
 * this module calls Elogistia/Meta directly from a Vercel Function, with no
 * database and no per-tenant credential storage. Every value here is read
 * server-side only; none is prefixed NEXT_PUBLIC_, so none reaches the browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function elogistiaConfig() {
  return {
    apiKey: required('ELOGISTIA_API_KEY'),
    apiUrl: optional('ELOGISTIA_API_URL', 'https://api.elogistia.com'),
    timeoutMs: optionalInt('ELOGISTIA_API_TIMEOUT_MS', 10_000),
  };
}

export function metaConfig() {
  return {
    accessToken: required('META_ACCESS_TOKEN'),
    adAccountId: required('META_AD_ACCOUNT_ID'),
    graphApiBaseUrl: optional('META_GRAPH_API_BASE_URL', 'https://graph.facebook.com'),
    graphApiVersion: optional('META_GRAPH_API_VERSION', 'v19.0'),
    timeoutMs: optionalInt('META_API_TIMEOUT_MS', 15_000),
  };
}
