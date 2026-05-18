import { describe, test, expect } from '@jest/globals';
import { computeCoverage } from '../../src/detection/coverage.js';

function makeMetrics(routeList) {
  return { uniqueRoutes: new Set(routeList) };
}

describe('computeCoverage', () => {
  test('0 routes → score 0.0', () => {
    expect(computeCoverage(makeMetrics([]))).toBe(0.0);
  });

  test('2 unique routes → score ~0.25 (below suspicious)', () => {
    const score = computeCoverage(makeMetrics(['/users/:id', '/orders/:id']));
    expect(score).toBeCloseTo(0.25, 2);
    expect(score).toBeLessThan(0.4);
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

  test('4 routes → score 0.5', () => {
    const routes = ['/users', '/users/:id', '/orders/:id', '/items/:id'];
    expect(computeCoverage(makeMetrics(routes))).toBeCloseTo(0.5, 2);
  });
});
