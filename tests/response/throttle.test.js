import { describe, test, expect } from '@jest/globals';
import { computeThrottle } from '../../src/response/throttle.js';
import { config } from '../../src/config.js';

function makeMetrics(idsPerRouteObj) {
  const idsPerRoute = new Map();
  for (const [route, ids] of Object.entries(idsPerRouteObj)) {
    idsPerRoute.set(route, new Set(ids));
  }
  return { idsPerRoute };
}

describe('computeThrottle', () => {
  test('level 0 → 0ms throttle regardless of route', () => {
    const metrics = makeMetrics({ '/users/:id': Array.from({ length: 20 }, (_, i) => i + 1) });
    expect(computeThrottle(0, metrics, '/users/:id')).toBe(0);
  });

  test('level 1 → 0ms throttle regardless of route', () => {
    const metrics = makeMetrics({ '/users/:id': Array.from({ length: 20 }, (_, i) => i + 1) });
    expect(computeThrottle(1, metrics, '/users/:id')).toBe(0);
  });

  test('level 2, request on most-enumerated route with >5 IDs → THROTTLE_DELAY_MS', () => {
    const metrics = makeMetrics({
      '/users/:id': Array.from({ length: 15 }, (_, i) => i + 1),
    });
    expect(computeThrottle(2, metrics, '/users/:id')).toBe(config.THROTTLE_DELAY_MS);
  });

  test('level 2, request on a different route → 0ms throttle', () => {
    const metrics = makeMetrics({
      '/users/:id': Array.from({ length: 15 }, (_, i) => i + 1),
      '/orders/:id': [1, 2, 3],
    });
    expect(computeThrottle(2, metrics, '/orders/:id')).toBe(0);
  });

  test('route with only 3 IDs → not throttled (threshold is 5)', () => {
    const metrics = makeMetrics({ '/users/:id': [1, 2, 3] });
    expect(computeThrottle(2, metrics, '/users/:id')).toBe(0);
  });

  test('route with exactly 5 IDs → not throttled (threshold is strictly > 5)', () => {
    const metrics = makeMetrics({ '/users/:id': [1, 2, 3, 4, 5] });
    expect(computeThrottle(2, metrics, '/users/:id')).toBe(0);
  });

  test('level 3 also throttles (throttle applies at level 2+)', () => {
    const metrics = makeMetrics({
      '/users/:id': Array.from({ length: 20 }, (_, i) => i + 1),
    });
    expect(computeThrottle(3, metrics, '/users/:id')).toBe(config.THROTTLE_DELAY_MS);
  });

  test('empty idsPerRoute → 0ms throttle', () => {
    expect(computeThrottle(2, makeMetrics({}), '/users/:id')).toBe(0);
  });
});
