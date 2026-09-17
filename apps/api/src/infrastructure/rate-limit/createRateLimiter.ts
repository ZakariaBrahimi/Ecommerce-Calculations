import { RateLimiter } from '../../domain/ports/RateLimiter';
import { Logger } from '../../domain/ports/Logger';
import { TokenBucketRateLimiter } from './TokenBucketRateLimiter';
import { UpstashRedisRateLimiter } from './UpstashRedisRateLimiter';

/**
 * Picks the right RateLimiter for how this process is actually running.
 * TokenBucketRateLimiter's in-memory bucket is only correct within a single
 * long-lived process - once this runs as more than one instance (or as a
 * serverless function, which is many short-lived instances), a shared store
 * is required for the limit to mean anything platform-wide. See
 * docs/deployment-vercel.md for why this matters specifically on Vercel.
 */
export function createRateLimiter(params: {
  upstashRedis: { url: string; token: string } | null;
  capacityPerMinute: number;
  isServerless: boolean;
  logger: Logger;
  keyPrefix: string;
}): RateLimiter {
  if (params.upstashRedis) {
    return new UpstashRedisRateLimiter(
      `${params.upstashRedis.url}`,
      params.upstashRedis.token,
      params.capacityPerMinute,
      60,
    );
  }

  if (params.isServerless) {
    params.logger.warn(
      `Running serverless with no UPSTASH_REDIS_REST_URL/TOKEN configured - the ${params.keyPrefix} rate ` +
        'limiter is in-memory and only correct within a single function instance, not across the fleet. ' +
        'Configure Upstash Redis before relying on this limit in production - see docs/deployment-vercel.md.',
    );
  }

  return new TokenBucketRateLimiter(params.capacityPerMinute);
}
