/**
 * Token-bucket rate limiter, one bucket per client ID.
 * Tokens refill continuously at refillRatePerMin tokens per minute.
 *
 * @param {object} [options]
 * @param {number} [options.maxTokens=100]         - Bucket capacity
 * @param {number} [options.refillRatePerMin=100]  - Tokens added per minute
 * @returns {{ isAllowed: (clientId: string) => boolean }}
 */
export function createRateLimiter({ maxTokens = 100, refillRatePerMin = 100 } = {}) {
  // clientId → { tokens: number, lastRefillMs: number }
  const buckets = new Map();

  function getOrCreate(clientId) {
    if (!buckets.has(clientId)) {
      buckets.set(clientId, { tokens: maxTokens, lastRefillMs: Date.now() });
    }
    return buckets.get(clientId);
  }

  function refill(bucket) {
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefillMs;
    const tokensToAdd = (elapsedMs / 60_000) * refillRatePerMin;
    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefillMs = now;
  }

  /**
   * Returns true and consumes one token if the client is within the rate limit.
   * Returns false if the bucket is empty.
   *
   * @param {string} clientId
   * @returns {boolean}
   */
  function isAllowed(clientId) {
    const bucket = getOrCreate(clientId);
    refill(bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  return { isAllowed };
}
