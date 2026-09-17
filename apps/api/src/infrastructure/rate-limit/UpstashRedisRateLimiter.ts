import { RateLimiter } from '../../domain/ports/RateLimiter';

interface UpstashPipelineResult {
  result: number;
}

/**
 * Distributed fixed-window rate limiter backed by Upstash Redis's REST API
 * (HTTP-based, so it works from a serverless function with no persistent
 * connection). This is the limiter to use once this service runs as more
 * than one process/instance - a serverless deployment (Vercel) included -
 * since TokenBucketRateLimiter's in-memory bucket is only correct within a
 * single long-lived process. See docs/deployment-vercel.md.
 *
 * Unlike TokenBucketRateLimiter, this never waits indefinitely: a
 * serverless function has a hard execution-time budget, so acquire()
 * gives up after `maxWaitMs` and throws, letting the caller's existing
 * per-batch/per-tenant error handling retry on the next invocation rather
 * than burning the rest of the function's time budget in a wait loop.
 */
export class UpstashRedisRateLimiter implements RateLimiter {
  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    private readonly capacityPerWindow: number,
    private readonly windowSeconds: number = 60,
    private readonly maxWaitMs: number = 15_000,
  ) {}

  async acquire(key: string): Promise<void> {
    const startedAt = Date.now();

    for (;;) {
      const windowStartSec = Math.floor(Date.now() / 1000 / this.windowSeconds) * this.windowSeconds;
      const redisKey = `ratelimit:${key}:${windowStartSec}`;
      const count = await this.incrementAndExpire(redisKey);

      if (count <= this.capacityPerWindow) return;

      if (Date.now() - startedAt >= this.maxWaitMs) {
        throw new Error(
          `Rate limit slot not available within ${this.maxWaitMs}ms (window count ${count}/${this.capacityPerWindow})`,
        );
      }

      const msIntoWindow = (Date.now() / 1000 - windowStartSec) * 1000;
      const msUntilWindowResets = this.windowSeconds * 1000 - msIntoWindow;
      await sleep(Math.max(50, Math.min(msUntilWindowResets, 1000)));
    }
  }

  private async incrementAndExpire(redisKey: string): Promise<number> {
    // One pipelined call: INCR the window's counter, then (re-)apply its TTL
    // so an abandoned key doesn't linger in Redis past its own window.
    const response = await fetch(`${this.restUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['EXPIRE', redisKey, String(this.windowSeconds)],
      ]),
    });

    if (!response.ok) {
      throw new Error(`Upstash rate limiter request failed: HTTP ${response.status}`);
    }

    const results = (await response.json()) as UpstashPipelineResult[];
    return results[0]?.result ?? 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
