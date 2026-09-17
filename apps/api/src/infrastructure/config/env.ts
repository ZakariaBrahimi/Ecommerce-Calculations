import 'dotenv/config';

/**
 * Loads and validates process.env once at startup, so a missing/malformed
 * variable fails fast at boot rather than surfacing as a mystery error deep
 * inside a request. Nothing here is ever sent to the frontend - this module
 * is only imported by infrastructure/composition code.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  database: {
    url: string;
  };
  deliveryElogistia: {
    apiUrl: string;
    timeoutMs: number;
    rateLimitPerMinute: number;
  };
  metaAds: {
    graphApiBaseUrl: string;
    graphApiVersion: string;
    appId: string;
    appSecret: string;
    oauthRedirectUri: string;
    oauthStateSecret: string;
    rateLimitPerMinute: number;
    timeoutMs: number;
    syncIntervalCron: string;
  };
  credentialsEncryptionKeyBase64: string;
  jwtSecret: string;
  internalApiToken: string;
  syncIntervalCron: string;
}

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
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  cached = {
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    port: optionalInt('PORT', 3000),
    database: {
      url: required('DATABASE_URL'),
    },
    deliveryElogistia: {
      apiUrl: optional('DELIVERY_API_URL', 'https://api.elogistia.com'),
      timeoutMs: optionalInt('DELIVERY_API_TIMEOUT_MS', 10_000),
      rateLimitPerMinute: optionalInt('DELIVERY_RATE_LIMIT_PER_MINUTE', 100),
    },
    metaAds: {
      graphApiBaseUrl: optional('META_GRAPH_API_BASE_URL', 'https://graph.facebook.com'),
      graphApiVersion: optional('META_GRAPH_API_VERSION', 'v19.0'),
      // App id is not secret (it's embedded in the OAuth redirect URL the
      // browser is sent to) - but the app SECRET must never leave the
      // backend: it is required for both the code->token exchange and the
      // short-lived->long-lived token exchange, and is never sent to the
      // frontend or returned in any API response.
      appId: required('META_APP_ID'),
      appSecret: required('META_APP_SECRET'),
      oauthRedirectUri: required('META_OAUTH_REDIRECT_URI'),
      // Signs the OAuth `state` param so the callback can recover which
      // tenant started the flow without relying on a session cookie/header
      // (Meta's redirect is a plain browser GET with no auth of its own).
      oauthStateSecret: required('META_OAUTH_STATE_SECRET'),
      rateLimitPerMinute: optionalInt('META_ADS_RATE_LIMIT_PER_MINUTE', 200),
      timeoutMs: optionalInt('META_ADS_API_TIMEOUT_MS', 15_000),
      syncIntervalCron: optional('META_ADS_SYNC_CRON', '0 * * * *'),
    },
    // 32 bytes, base64-encoded, used for local/dev envelope encryption of
    // tenant delivery-provider credentials. In staging/production this
    // should be a *data key* unwrapped via a real KMS, not a static env var -
    // see docs/integrations/elogistia-api.md ("Where secrets are stored").
    credentialsEncryptionKeyBase64: required('DELIVERY_CREDENTIALS_ENCRYPTION_KEY'),
    jwtSecret: required('JWT_SECRET'),
    internalApiToken: required('INTERNAL_API_TOKEN'),
    syncIntervalCron: optional('DELIVERY_SYNC_CRON', '*/15 * * * *'),
  };

  return cached;
}

/** Test-only: clears the cached config so a test can reload with new env vars. */
export function resetConfigCache(): void {
  cached = undefined;
}
