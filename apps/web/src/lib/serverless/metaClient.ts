import { metaConfig } from './env';
import { ProviderApiError, isAbortError } from './providerError';

const AUTH_ERROR_CODES = new Set([190, 102, 200, 10]);
const RATE_LIMIT_ERROR_CODES = new Set([4, 17, 32, 613]);

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

/**
 * Direct, stateless call to Meta's Graph/Marketing API using a single
 * platform-level long-lived access token from META_ACCESS_TOKEN (no OAuth
 * dialog, no per-tenant token storage - see apps/api's MetaAdsProvider for
 * the DB-backed, multi-tenant OAuth version this mirrors). Graph API often
 * returns its error in the JSON body even on a 200/400 status, so the body
 * is inspected first.
 */
export async function metaGet(path: string, params: Record<string, string | undefined>): Promise<unknown> {
  const config = metaConfig();

  const url = new URL(`/${config.graphApiVersion}${path}`, config.graphApiBaseUrl);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: 'no-store', // always live - see the "no persistence" requirement
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new ProviderApiError('timeout', `Meta Graph API request to ${path} timed out after ${config.timeoutMs}ms`, err);
    }
    throw new ProviderApiError('upstream', `Meta Graph API request to ${path} failed (network error)`, err);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new ProviderApiError('upstream', `Meta Graph API response for ${path} was not valid JSON`, err);
  }

  const errorBody = body as GraphErrorBody;
  if (errorBody.error) {
    const { message, code, type } = errorBody.error;
    if ((code !== undefined && AUTH_ERROR_CODES.has(code)) || type === 'OAuthException') {
      throw new ProviderApiError('auth', message ?? 'Meta rejected the configured access token');
    }
    if ((code !== undefined && RATE_LIMIT_ERROR_CODES.has(code)) || response.status === 429) {
      throw new ProviderApiError('rate_limit', message ?? 'Meta Graph API rate limit exceeded');
    }
    throw new ProviderApiError('upstream', message ?? `Meta Graph API returned an error for ${path}`);
  }

  if (!response.ok) {
    throw new ProviderApiError('upstream', `Meta Graph API returned HTTP ${response.status} for ${path}`);
  }

  return body;
}

// Meta's own default page size is a small double-digit number, which for an
// account with enough campaigns/rows to need several pages means several
// sequential round-trips (cursor pagination can't be parallelized) - each
// bounded by META_API_TIMEOUT_MS, easily exceeding a route's maxDuration
// before maxPages is even reached. Asking for a large page explicitly keeps
// this to one round-trip for the overwhelming majority of accounts.
const DEFAULT_PAGE_SIZE = '500';

/** Follows paging.next cursors, capped to stay within one function invocation's timeout budget. */
export async function metaGetAllPages(
  path: string,
  params: Record<string, string | undefined>,
  maxPages = 10,
): Promise<unknown[]> {
  const results: unknown[] = [];
  let after: string | undefined;
  let page = 0;

  do {
    page += 1;
    const body = (await metaGet(path, { limit: DEFAULT_PAGE_SIZE, ...params, after })) as {
      data?: unknown[];
      paging?: { cursors?: { after?: string }; next?: string };
    };
    if (!Array.isArray(body.data)) {
      throw new ProviderApiError('upstream', `Expected Meta response for ${path} to contain a "data" array`);
    }
    results.push(...body.data);
    after = body.paging?.cursors?.after && body.paging?.next ? body.paging.cursors.after : undefined;
  } while (after && page < maxPages);

  return results;
}
