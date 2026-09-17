import { MetaGraphHttpClient } from '../../../src/infrastructure/providers/meta-ads/MetaGraphHttpClient';
import { RateLimiter } from '../../../src/domain/ports/RateLimiter';
import { Logger, LogMeta } from '../../../src/domain/ports/Logger';
import { MetaRateLimitError } from '../../../src/domain/errors/MetaAdsIntegrationErrors';

class NoopLogger implements Logger {
  debug(_m: string, _meta?: LogMeta): void {}
  info(_m: string, _meta?: LogMeta): void {}
  warn(_m: string, _meta?: LogMeta): void {}
  error(_m: string, _meta?: LogMeta): void {}
  child(): Logger {
    return this;
  }
}

class ThrowingRateLimiter implements RateLimiter {
  async acquire(): Promise<void> {
    throw new Error('redis unreachable');
  }
}

describe('MetaGraphHttpClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('wraps a raw rate-limiter failure into MetaRateLimitError instead of an unhandled error', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const client = new MetaGraphHttpClient(
      { baseUrl: 'https://graph.facebook.com', apiVersion: 'v19.0', timeoutMs: 1000 },
      new ThrowingRateLimiter(),
      new NoopLogger(),
    );

    await expect(client.get('/me/adaccounts', {}, 'test-token')).rejects.toThrow(MetaRateLimitError);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
