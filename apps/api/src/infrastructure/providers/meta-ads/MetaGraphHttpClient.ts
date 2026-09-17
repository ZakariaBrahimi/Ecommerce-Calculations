import { createHash } from 'node:crypto';
import { RateLimiter } from '../../../domain/ports/RateLimiter';
import { Logger } from '../../../domain/ports/Logger';
import {
  MetaApiUnavailableError,
  MetaAuthenticationError,
  MetaRateLimitError,
  MetaResponseValidationError,
} from '../../../domain/errors/MetaAdsIntegrationErrors';

export interface MetaGraphHttpClientConfig {
  baseUrl: string; // e.g. https://graph.facebook.com
  apiVersion: string; // e.g. v19.0
  timeoutMs: number;
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

interface GraphListResponse {
  data?: unknown[];
  paging?: { cursors?: { after?: string }; next?: string };
}

const AUTH_ERROR_CODES = new Set([190, 102, 200, 10]);
const RATE_LIMIT_ERROR_CODES = new Set([4, 17, 32, 613]);
const MAX_PAGES = 20;

/**
 * Low-level transport for Meta's Graph/Marketing API. Unlike Elogistia,
 * Meta accepts a standard `Authorization: Bearer <token>` header, so the
 * access token never has to travel in a logged URL - still, this client
 * never logs full URLs or query params, only the path, as a matter of
 * consistent policy across providers.
 *
 * Graph API frequently returns an `error` object in the JSON body even
 * with the "wrong" HTTP status (expired tokens commonly come back as
 * HTTP 400, not 401) - error classification below inspects the body first,
 * falling back to the HTTP status only when no error body is present.
 */
export class MetaGraphHttpClient {
  constructor(
    private readonly config: MetaGraphHttpClientConfig,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: Logger,
  ) {}

  async get(path: string, params: Record<string, string | undefined>, accessToken: string): Promise<unknown> {
    return this.request(path, params, { Authorization: `Bearer ${accessToken}` }, bucketKeyFor(accessToken));
  }

  /**
   * For the two OAuth endpoints called before a user access token exists
   * (the initial code->token exchange, and the short->long-lived exchange).
   * The app secret travels in the query string for these calls specifically
   * because that is Meta's documented contract for `/oauth/access_token` -
   * every other endpoint uses the Bearer header via `get()` above.
   */
  async getPublic(path: string, params: Record<string, string | undefined>): Promise<unknown> {
    return this.request(path, params, {}, 'oauth-exchange');
  }

  private async request(
    path: string,
    params: Record<string, string | undefined>,
    headers: Record<string, string>,
    rateLimitKey: string,
  ): Promise<unknown> {
    await this.rateLimiter.acquire(rateLimitKey);

    const url = new URL(`/${this.config.apiVersion}${path}`, this.config.baseUrl);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(name, value);
    }

    const log = this.logger.child({ provider: 'meta', path });
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err) {
      log.error('Meta Graph API request failed (network/timeout)', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new MetaApiUnavailableError('Meta Graph API request failed (network/timeout)', err);
    }

    return this.parseResponse(response, log);
  }

  /** Follows `paging.next` cursors until exhausted (capped at MAX_PAGES) and returns the concatenated `data`. */
  async getAllPages(
    path: string,
    params: Record<string, string | undefined>,
    accessToken: string,
  ): Promise<unknown[]> {
    const log = this.logger.child({ provider: 'meta', path });
    const results: unknown[] = [];
    let after: string | undefined;
    let page = 0;

    do {
      page += 1;
      const body = (await this.get(path, { ...params, after }, accessToken)) as GraphListResponse;
      if (!Array.isArray(body.data)) {
        throw new MetaResponseValidationError(`Expected Meta response for ${path} to contain a "data" array`);
      }
      results.push(...body.data);
      after = body.paging?.cursors?.after && body.paging?.next ? body.paging.cursors.after : undefined;

      if (page >= MAX_PAGES && after) {
        log.warn('Meta pagination cap reached - stopping early', { pages: page });
        after = undefined;
      }
    } while (after);

    return results;
  }

  private async parseResponse(response: Response, log: Logger): Promise<unknown> {
    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      if (response.ok) {
        throw new MetaResponseValidationError('Meta Graph API response was not valid JSON', err);
      }
      log.error('Meta Graph API returned a non-JSON error response', { status: response.status });
      throw new MetaApiUnavailableError(`Meta Graph API returned HTTP ${response.status}`);
    }

    const errorBody = body as GraphErrorBody;
    if (errorBody.error) {
      const { message, type, code } = errorBody.error;
      if ((code !== undefined && AUTH_ERROR_CODES.has(code)) || type === 'OAuthException') {
        log.warn('Meta rejected the access token', { code, type });
        throw new MetaAuthenticationError(message ?? 'Meta rejected the access token');
      }
      if ((code !== undefined && RATE_LIMIT_ERROR_CODES.has(code)) || response.status === 429) {
        log.warn('Meta rate limit hit', { code });
        throw new MetaRateLimitError(message ?? 'Meta Graph API rate limit exceeded', 60_000);
      }
      log.error('Meta Graph API returned an error', { code, type, message });
      throw new MetaApiUnavailableError(message ?? 'Meta Graph API returned an error');
    }

    if (!response.ok) {
      log.error('Meta Graph API returned a non-success status with no error body', { status: response.status });
      throw new MetaApiUnavailableError(`Meta Graph API returned HTTP ${response.status}`);
    }

    return body;
  }
}

function bucketKeyFor(accessToken: string): string {
  return createHash('sha256').update(accessToken).digest('hex');
}
