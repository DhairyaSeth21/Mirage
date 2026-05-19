import { describe, it, expect, beforeEach } from '@jest/globals';
import { createRateLimiter } from '../../src/response/rateLimit.js';

describe('createRateLimiter', () => {
  let limiter;

  beforeEach(() => {
    // 5 tokens max, refill at 60/min = 1/s — easy to reason about in tests
    limiter = createRateLimiter({ maxTokens: 5, refillRatePerMin: 60 });
  });

  it('allows requests up to the token limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed('client-a')).toBe(true);
    }
  });

  it('blocks requests once the bucket is empty', () => {
    for (let i = 0; i < 5; i++) limiter.isAllowed('client-a');
    expect(limiter.isAllowed('client-a')).toBe(false);
  });

  it('separate clients have independent buckets', () => {
    // Drain client-a
    for (let i = 0; i < 5; i++) limiter.isAllowed('client-a');
    expect(limiter.isAllowed('client-a')).toBe(false);
    // client-b is unaffected
    expect(limiter.isAllowed('client-b')).toBe(true);
  });

  it('refills tokens over time', async () => {
    // Drain bucket completely
    for (let i = 0; i < 5; i++) limiter.isAllowed('client-a');
    expect(limiter.isAllowed('client-a')).toBe(false);

    // High refill rate limiter: 600 tokens/min = 10/s so ~1 token per 100ms
    const fastLimiter = createRateLimiter({ maxTokens: 5, refillRatePerMin: 600 });
    for (let i = 0; i < 5; i++) fastLimiter.isAllowed('client-x');
    expect(fastLimiter.isAllowed('client-x')).toBe(false);

    await new Promise((r) => setTimeout(r, 110)); // wait ~1 token refill
    expect(fastLimiter.isAllowed('client-x')).toBe(true);
  });

  it('defaults to 100 max tokens and 100/min refill', () => {
    const defaultLimiter = createRateLimiter();
    for (let i = 0; i < 100; i++) {
      expect(defaultLimiter.isAllowed('c')).toBe(true);
    }
    expect(defaultLimiter.isAllowed('c')).toBe(false);
  });

  it('never exceeds maxTokens when refilling past the cap', async () => {
    // Start with a full bucket (5 tokens), wait for potential over-refill
    const lim = createRateLimiter({ maxTokens: 5, refillRatePerMin: 600 });
    await new Promise((r) => setTimeout(r, 200));
    // Should still have at most 5 tokens — drain them all
    let allowed = 0;
    while (lim.isAllowed('c')) allowed++;
    expect(allowed).toBe(5);
  });
});
