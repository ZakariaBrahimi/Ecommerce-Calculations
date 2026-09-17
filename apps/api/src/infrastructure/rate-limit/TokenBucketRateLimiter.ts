import { RateLimiter } from '../../domain/ports/RateLimiter';

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

/**
 * In-process token-bucket limiter, keyed per caller (tenant+provider).
 * Waits (rather than rejecting) for a free slot, since delivery-status
 * polling is a background job, not a user-facing request.
 *
 * Production note: this is per-instance state. Once the worker runs on more
 * than one node, swap this for a Redis-backed limiter (INCR + EXPIRE, or a
 * sliding-window library) so the 100 req/min cap is enforced across the
 * whole fleet, not per-process - see docs/integrations/elogistia-api.md
 * §3.3. The RateLimiter port is unchanged either way.
 */
export class TokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillWindowMs: number = 60_000,
  ) {}

  async acquire(key: string): Promise<void> {
    for (;;) {
      const bucket = this.getOrCreateBucket(key);
      this.refill(bucket);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }

      const msPerToken = this.refillWindowMs / this.capacity;
      await sleep(Math.ceil(msPerToken));
    }
  }

  private getOrCreateBucket(key: string): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefillAt: Date.now() };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefillAt;
    if (elapsed <= 0) return;
    const refillRate = this.capacity / this.refillWindowMs; // tokens per ms
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * refillRate);
    bucket.lastRefillAt = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
