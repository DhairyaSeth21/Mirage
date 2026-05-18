import { describe, test, expect } from '@jest/globals';
import { computeErrorAdaptation } from '../../src/detection/errorAdaptation.js';

function makeRequest(id, status, route = '/users/:id') {
  return {
    normalizedRoute: route,
    extractedIds: id !== null ? [id] : [],
    responseStatus: status,
  };
}

function makeMetrics(requests) {
  return { requests };
}

describe('computeErrorAdaptation', () => {
  test('no 404s → score 0.0', () => {
    const metrics = makeMetrics([
      makeRequest(1, 200),
      makeRequest(2, 200),
      makeRequest(3, 200),
    ]);
    expect(computeErrorAdaptation(metrics)).toBe(0.0);
  });

  test('empty requests → score 0.0', () => {
    expect(computeErrorAdaptation(makeMetrics([]))).toBe(0.0);
  });

  test('404 at ID 100, next request at ID 50 → adapted (score > 0)', () => {
    const metrics = makeMetrics([
      makeRequest(100, 404),
      makeRequest(50, 200),
    ]);
    expect(computeErrorAdaptation(metrics)).toBeGreaterThan(0);
  });

  test('404 at ID 100, next request at same ID 100 (retry) → not adapted', () => {
    const metrics = makeMetrics([
      makeRequest(100, 404),
      makeRequest(100, 404),
    ]);
    expect(computeErrorAdaptation(metrics)).toBe(0.0);
  });

  test('binary search sequence → high score', () => {
    // [100→404, 50→200, 75→404, 62→200]
    const metrics = makeMetrics([
      makeRequest(100, 404),
      makeRequest(50, 200),
      makeRequest(75, 404),
      makeRequest(62, 200),
    ]);
    // 2 adapted out of 2 errors = 1.0
    expect(computeErrorAdaptation(metrics)).toBeCloseTo(1.0, 5);
  });

  test('normal browsing: 404 followed by request with no ID → low score', () => {
    const metrics = makeMetrics([
      makeRequest(999, 404),
      makeRequest(null, 200, '/users'), // /users has no ID
    ]);
    expect(computeErrorAdaptation(metrics)).toBe(0.0);
  });

  test('404 as last request (no following request) → not counted as adapted', () => {
    const metrics = makeMetrics([
      makeRequest(1, 200),
      makeRequest(999, 404), // last — no pair to check
    ]);
    // totalErrors = 1, but no pair to evaluate → adaptedPairs = 0
    expect(computeErrorAdaptation(metrics)).toBe(0.0);
  });

  test('mixed: some adapted, some retried', () => {
    const metrics = makeMetrics([
      makeRequest(100, 404),
      makeRequest(50, 200),   // adapted
      makeRequest(200, 404),
      makeRequest(200, 404),  // retry — not adapted
    ]);
    // 1 adapted / 2 errors = 0.5
    expect(computeErrorAdaptation(metrics)).toBeCloseTo(0.5, 5);
  });
});
