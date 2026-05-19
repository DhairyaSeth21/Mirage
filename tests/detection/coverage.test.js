import { describe, test, expect } from '@jest/globals';
import { computeCoverage } from '../../src/detection/coverage.js';
import { config } from '../../src/config.js';

function makeMetrics(routeList) {
  return { uniqueRoutes: new Set(routeList) };
}

describe('computeCoverage', () => {
  test('0 routes → score 0.0', () => {
    expect(computeCoverage(makeMetrics([]))).toBe(0.0);
  });

  test('2 unique routes → score = 2 / COVERAGE_THRESHOLD', () => {
    const score = computeCoverage(makeMetrics(['/users/:id', '/orders/:id']));
    expect(score).toBeCloseTo(2 / config.COVERAGE_THRESHOLD, 2);
  });

  test('8 unique routes → score 1.0', () => {
    const routes = [
      '/users', '/users/:id', '/users/:id/orders', '/users/:id/profile',
      '/orders/:id', '/orders/:id/items', '/items/:id', '/auth/login',
    ];
    expect(computeCoverage(makeMetrics(routes))).toBe(1.0);
  });

  test('more than threshold routes still caps at 1.0', () => {
    const routes = Array.from({ length: 20 }, (_, i) => `/resource${i}/:id`);
    expect(computeCoverage(makeMetrics(routes))).toBe(1.0);
  });

  test('4 routes → score = 4 / COVERAGE_THRESHOLD (capped at 1.0)', () => {
    const routes = ['/users', '/users/:id', '/orders/:id', '/items/:id'];
    expect(computeCoverage(makeMetrics(routes))).toBeCloseTo(Math.min(4 / config.COVERAGE_THRESHOLD, 1.0), 2);
  });
});
