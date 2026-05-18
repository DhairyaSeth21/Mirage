import { describe, test, expect } from '@jest/globals';
import { computeLatency } from '../../src/response/latency.js';
import { config } from '../../src/config.js';

describe('computeLatency', () => {
  test('level 0 → 0ms delay', () => {
    expect(computeLatency(0)).toBe(0);
  });

  test('level 1 → delay between LATENCY_MIN_MS and LATENCY_MAX_MS', () => {
    const delay = computeLatency(1);
    expect(delay).toBeGreaterThanOrEqual(config.LATENCY_MIN_MS);
    expect(delay).toBeLessThanOrEqual(config.LATENCY_MAX_MS);
  });

  test('level 2 → also returns a delay (latency applies at all elevated levels)', () => {
    const delay = computeLatency(2);
    expect(delay).toBeGreaterThanOrEqual(config.LATENCY_MIN_MS);
    expect(delay).toBeLessThanOrEqual(config.LATENCY_MAX_MS);
  });

  test('level 3 → still returns a delay', () => {
    const delay = computeLatency(3);
    expect(delay).toBeGreaterThanOrEqual(config.LATENCY_MIN_MS);
    expect(delay).toBeLessThanOrEqual(config.LATENCY_MAX_MS);
  });

  test('multiple calls at level 1 produce different values (randomness)', () => {
    const results = new Set(Array.from({ length: 20 }, () => computeLatency(1)));
    // With 20 samples from a continuous distribution, extremely unlikely to be all the same
    expect(results.size).toBeGreaterThan(1);
  });
});
