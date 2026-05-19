import { describe, test, expect } from '@jest/globals';
import { computeEnumeration } from '../../src/detection/enumeration.js';
import { config } from '../../src/config.js';

function makeMetrics(idsPerRouteObj) {
  const idsPerRoute = new Map();
  for (const [route, ids] of Object.entries(idsPerRouteObj)) {
    idsPerRoute.set(route, new Set(ids));
  }
  return { idsPerRoute };
}

describe('computeEnumeration', () => {
  test('no IDs at all → score 0.0', () => {
    expect(computeEnumeration(makeMetrics({}))).toBe(0.0);
  });

  test('3 unique IDs on one route → score = 3 / ENUM_THRESHOLD', () => {
    const score = computeEnumeration(makeMetrics({ '/users/:id': [1, 2, 3] }));
    expect(score).toBeCloseTo(3 / config.ENUM_THRESHOLD, 2);
  });

  test('20+ unique IDs on one route → score 1.0', () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const score = computeEnumeration(makeMetrics({ '/users/:id': ids }));
    expect(score).toBe(1.0);
  });

  test('more than threshold IDs still caps at 1.0', () => {
    const ids = Array.from({ length: 50 }, (_, i) => i + 1);
    const score = computeEnumeration(makeMetrics({ '/users/:id': ids }));
    expect(score).toBe(1.0);
  });

  test('multiple routes — score reflects the route with max IDs', () => {
    const score = computeEnumeration(makeMetrics({
      '/users/:id': [1, 2, 3],             // 3 IDs
      '/orders/:id': Array.from({ length: 15 }, (_, i) => i + 1), // 15 IDs
    }));
    expect(score).toBeCloseTo(Math.min(15 / config.ENUM_THRESHOLD, 1.0), 2); // driven by orders route
  });

  test('only one route with IDs — uses that route', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    const score = computeEnumeration(makeMetrics({ '/items/:id': ids }));
    expect(score).toBeCloseTo(Math.min(10 / config.ENUM_THRESHOLD, 1.0), 2);
  });
});
