import { createHash } from 'node:crypto';
import { RateLimiter } from '../../../domain/ports/RateLimiter';
import { Logger } from '../../../domain/ports/Logger';
import {
  DeliveryAuthenticationError,
  DeliveryProviderUnavailableError,
  DeliveryRateLimitError,
  DeliveryResponseValidationError,
} from '../../../domain/errors/DeliveryIntegrationErrors';

export interface ElogistiaHttpClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Low-level transport for the Elogistia API. Owns everything specific to how
 * this particular provider is called over HTTP: query-string auth (it takes
 * no headers at all - see docs/integrations/elogistia-api.md §1.3), the
 * `apiKey`/`key` param-naming inconsistency across endpoints, per-key rate
 * limiting, timeouts, and translating transport failures into the shared
 * DeliveryIntegrationError hierarchy.
 *
 * Deliberately never logs a constructed URL or raw query params - only the
 * path and outcome - since the API key travels in the query string.
 */
export class ElogistiaHttpClient {
  constructor(
    private readonly config: ElogistiaHttpClientConfig,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: Logger,
  ) {}

  async get(path: string, params: Record<string, string | undefined>, apiKey: string): Promise<unknown> {
    await this.rateLimiter.acquire(bucketKeyFor(apiKey));

    const url = new URL(path, this.config.baseUrl);
    // Both param names are sent because the documented endpoints disagree on
    // which one they expect for the same credential.
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('key', apiKey);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(name, value);
    }

    const log = this.logger.child({ provider: 'elogistia', path });
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err) {
      log.error('Elogistia request failed (network/timeout)', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new DeliveryProviderUnavailableError('Elogistia request failed (network/timeout)', err);
    }

    if (response.status === 401 || response.status === 403) {
      log.warn('Elogistia rejected the API key', { status: response.status });
      throw new DeliveryAuthenticationError('Elogistia rejected the provided API key');
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 60_000;
      log.warn('Elogistia rate limit hit', { retryAfterMs });
      throw new DeliveryRateLimitError('Elogistia rate limit exceeded', retryAfterMs);
    }

    if (!response.ok) {
      log.error('Elogistia returned a non-success status', { status: response.status });
      throw new DeliveryProviderUnavailableError(`Elogistia returned HTTP ${response.status}`);
    }

    try {
      return await response.json();
    } catch (err) {
      log.error('Elogistia response was not valid JSON', {});
      throw new DeliveryResponseValidationError('Elogistia response was not valid JSON', err);
    }
  }
}

function bucketKeyFor(apiKey: string): string {
  // Never keep the raw key resident as a long-lived Map key (rate limiter
  // buckets live for the process lifetime) - use a one-way hash instead.
  return createHash('sha256').update(apiKey).digest('hex');
}
