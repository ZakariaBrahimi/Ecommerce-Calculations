import { ElogistiaHttpClient } from '../../../src/infrastructure/providers/elogistia/ElogistiaHttpClient';
import { RateLimiter } from '../../../src/domain/ports/RateLimiter';
import { Logger, LogMeta } from '../../../src/domain/ports/Logger';
import { DeliveryRateLimitError } from '../../../src/domain/errors/DeliveryIntegrationErrors';

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

describe('ElogistiaHttpClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('wraps a raw rate-limiter failure into DeliveryRateLimitError instead of an unhandled error', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const client = new ElogistiaHttpClient(
      { baseUrl: 'https://api.elogistia.com', timeoutMs: 1000 },
      new ThrowingRateLimiter(),
      new NoopLogger(),
    );

    await expect(client.get('/getOrders/', {}, 'test-key')).rejects.toThrow(DeliveryRateLimitError);
    // The request should never have been attempted once the rate limiter itself failed.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
