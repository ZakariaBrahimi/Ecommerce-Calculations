import { UpstashRedisRateLimiter } from '../../../src/infrastructure/rate-limit/UpstashRedisRateLimiter';

describe('UpstashRedisRateLimiter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockFetchReturning(counts: number[]) {
    let call = 0;
    global.fetch = jest.fn(async () => {
      const result = counts[Math.min(call, counts.length - 1)];
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => [{ result }],
      } as Response;
    }) as unknown as typeof fetch;
  }

  it('resolves immediately when the window count is under capacity', async () => {
    mockFetchReturning([1]);
    const limiter = new UpstashRedisRateLimiter('https://example.upstash.io', 'token', 100);

    await expect(limiter.acquire('tenant-1')).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends an INCR + EXPIRE pipeline with the Authorization header', async () => {
    mockFetchReturning([1]);
    const limiter = new UpstashRedisRateLimiter('https://example.upstash.io', 'secret-token', 100, 60);

    await limiter.acquire('tenant-1');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://example.upstash.io/pipeline');
    expect(options.headers.Authorization).toBe('Bearer secret-token');
    const body = JSON.parse(options.body);
    expect(body[0][0]).toBe('INCR');
    expect(body[1]).toEqual(['EXPIRE', body[1][1], '60']);
  });

  it('throws once maxWaitMs is exceeded while consistently over capacity', async () => {
    mockFetchReturning([101, 101, 101, 101, 101, 101]);
    const limiter = new UpstashRedisRateLimiter('https://example.upstash.io', 'token', 100, 60, 100);

    await expect(limiter.acquire('tenant-1')).rejects.toThrow(/Rate limit slot not available/);
  });

  it('throws a clear error when the Upstash request itself fails', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch;
    const limiter = new UpstashRedisRateLimiter('https://example.upstash.io', 'token', 100);

    await expect(limiter.acquire('tenant-1')).rejects.toThrow(/Upstash rate limiter request failed/);
  });
});
