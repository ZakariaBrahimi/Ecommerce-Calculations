/**
 * Throttles outbound calls per key (typically a tenant+provider pair).
 * Resolves once a slot is available; throws DeliveryRateLimitError if the
 * caller should back off instead of waiting (implementation-defined policy).
 */
export interface RateLimiter {
  acquire(key: string): Promise<void>;
}
