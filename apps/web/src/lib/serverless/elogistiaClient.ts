import { elogistiaConfig } from './env';
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
