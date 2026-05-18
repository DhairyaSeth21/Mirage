import { describe, test, expect } from '@jest/globals';
import { computeTiming } from '../../src/detection/timing.js';

function makeMetrics(intervals) {
  return { intervals };
}

describe('computeTiming', () => {
  test('no intervals (single request) → score 0.0', () => {
    expect(computeTiming(makeMetrics([]))).toBe(0.0);
  });

  test('highly regular intervals → high suspicion score (~0.97)', () => {
    const score = computeTiming(makeMetrics([120, 118, 122, 119, 121]));
    expect(score).toBeGreaterThan(0.9);
  });

  test('highly irregular intervals → score 0.0 (human-like)', () => {
    const score = computeTiming(makeMetrics([50, 2000, 300, 5000, 100]));
    expect(score).toBe(0.0);
  });

  test('two requests → one interval, still computable', () => {
    // Single interval has CV = 0 (no variation), so timing score = 1.0
    const score = computeTiming(makeMetrics([500]));
    // std_dev of single value treated as 0 → CV = 0 → score = 1.0
    expect(score).toBe(1.0);
  });

  test('moderately regular intervals → intermediate score', () => {
    // Mean ~500, some variation
    const score = computeTiming(makeMetrics([400, 500, 600, 500, 450]));
    expect(score).toBeGreaterThan(0.0);
    expect(score).toBeLessThan(1.0);
  });

  test('zero mean intervals → score 1.0 (machine-like simultaneous requests)', () => {
    const score = computeTiming(makeMetrics([0, 0, 0, 0]));
    expect(score).toBe(1.0);
  });
});
