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
