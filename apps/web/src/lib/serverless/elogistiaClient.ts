import { elogistiaConfig } from './env';
import { getOrdersPageInfo } from './elogistiaNormalize';
import { ProviderApiError, isAbortError } from './providerError';

/**
 * Direct, stateless call to Elogistia - no rate limiter, no retry queue, no
 * credential storage (see apps/api/src/infrastructure/providers/elogistia
 * for the DB-backed version this mirrors). Elogistia takes its API key as a
 * query-string param (no headers at all, and endpoints disagree on
 * `apiKey` vs `key`, so both are sent - see docs/integrations/elogistia-api.md
 * §1.2-1.3) which is exactly why this must run server-side only: the key
 * would otherwise end up in browser history/Referer headers. This function
 * never logs the constructed URL, only the path.
 */
export async function elogistiaGet(path: string, params: Record<string, string | undefined>): Promise<unknown> {
  const config = elogistiaConfig();

  const url = new URL(path, config.apiUrl);
  url.searchParams.set('apiKey', config.apiKey);
  url.searchParams.set('key', config.apiKey);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: 'no-store', // always live - see the "no persistence" requirement
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new ProviderApiError('timeout', `Elogistia request to ${path} timed out after ${config.timeoutMs}ms`, err);
    }
    throw new ProviderApiError('upstream', `Elogistia request to ${path} failed (network error)`, err);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderApiError('auth', 'Elogistia rejected the configured API key');
  }
  if (response.status === 429) {
    throw new ProviderApiError('rate_limit', 'Elogistia rate limit exceeded (100 req/min)');
  }
  if (!response.ok) {
    throw new ProviderApiError('upstream', `Elogistia returned HTTP ${response.status} for ${path}`);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new ProviderApiError('upstream', `Elogistia response for ${path} was not valid JSON`, err);
  }
}

// Caps how many pages one request pulls, so a growing order history can't
// blow past a route's maxDuration or Elogistia's 100 req/min cap.
const MAX_ORDER_PAGES = 20; // 20 * 100/page = up to 2,000 orders per load

// Generating a full page of order detail is slow on Elogistia's end for an
// account with a large order history (observed timing out entirely at a
// too-tight budget) - fetching every remaining page in one big Promise.all
// would fire that many simultaneous heavy queries at once, likely making
// each one slower still. Bounded concurrency keeps the win from
// parallelizing pages without hammering their server all at once.
const PAGE_FETCH_CONCURRENCY = 5;

/**
 * Fetches every page of Elogistia's full-detail order shape (tracking
 * number, name, status) and returns the raw page bodies, unmerged and
 * unnormalized - callers (routes) decide how to shape the result. See
 * elogistiaNormalize.ts's doc comment on normalizeOrderDetailRows for why
 * `tracking: ''` (present but empty) is what triggers this shape instead of
 * the sparse one.
 */
export async function fetchAllElogistiaOrderPages(): Promise<unknown[]> {
  const firstPage = await elogistiaGet('/getOrders/', { tracking: '', page: '1' });
  const pageInfo = getOrdersPageInfo(firstPage);
  const totalPages = pageInfo ? Math.min(pageInfo.totalPages, MAX_ORDER_PAGES) : 1;

  const remainingPageNumbers = Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 2);
  const pages: unknown[] = [firstPage];
  for (let i = 0; i < remainingPageNumbers.length; i += PAGE_FETCH_CONCURRENCY) {
    const batch = remainingPageNumbers.slice(i, i + PAGE_FETCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((page) => elogistiaGet('/getOrders/', { tracking: '', page: String(page) })),
    );
    pages.push(...batchResults);
  }
  return pages;
}
