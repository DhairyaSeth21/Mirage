import { describe, test, expect } from '@jest/globals';
import { computeTraversal } from '../../src/detection/traversal.js';
import { config } from '../../src/config.js';

function makeRequest(firstId, route) {
  return {
    normalizedRoute: route,
    extractedIds: firstId !== null ? [firstId] : [],
    responseStatus: 200,
  };
}

function makeMetrics(requests) {
  return { requests };
}

describe('computeTraversal', () => {
  test('no requests → score 0.0', () => {
    expect(computeTraversal(makeMetrics([]))).toBe(0.0);
  });

  test('single request to /users/1 → no sub-resource traversal → score 0.0', () => {
    const metrics = makeMetrics([makeRequest(1, '/users/:id')]);
    expect(computeTraversal(makeMetrics([makeRequest(1, '/users/:id')]))).toBe(0.0);
  });

  test('requests with no IDs do not contribute to chains', () => {
    const metrics = makeMetrics([
      makeRequest(null, '/users'),
      makeRequest(null, '/auth/login'),
    ]);
    expect(computeTraversal(metrics)).toBe(0.0);
  });

  test('ID 1 appearing in 3 routes (user + sub-resources) → 1 chained ID', () => {
    const metrics = makeMetrics([
      makeRequest(1, '/users/:id'),
      makeRequest(1, '/users/:id/orders'),
      makeRequest(1, '/users/:id/profile'),
    ]);
    // 1 chained ID / TRAVERSAL_THRESHOLD
    expect(computeTraversal(metrics)).toBeCloseTo(1 / config.TRAVERSAL_THRESHOLD, 5);
  });

  test('normal user: one ID with sub-resources → score below suspicious', () => {
    const metrics = makeMetrics([
      makeRequest(42, '/users/:id'),
      makeRequest(42, '/users/:id/orders'),
      makeRequest(42, '/users/:id/profile'),
    ]);
    const score = computeTraversal(metrics);
    expect(score).toBeCloseTo(1 / config.TRAVERSAL_THRESHOLD, 5);
    expect(score).toBeLessThan(0.5);
  });

  test('5 different IDs each with sub-resources → score 1.0', () => {
    const requests = [];
    for (let id = 1; id <= 5; id++) {
      requests.push(makeRequest(id, '/users/:id'));
      requests.push(makeRequest(id, '/users/:id/orders'));
      requests.push(makeRequest(id, '/users/:id/profile'));
    }
    expect(computeTraversal(makeMetrics(requests))).toBe(1.0);
  });

  test('more than threshold chained IDs still caps at 1.0', () => {
    const requests = [];
    for (let id = 1; id <= 10; id++) {
      requests.push(makeRequest(id, '/users/:id'));
      requests.push(makeRequest(id, '/users/:id/orders'));
    }
    expect(computeTraversal(makeMetrics(requests))).toBe(1.0);
  });

  test('IDs appearing in only one route do not count as traversal chains', () => {
    const metrics = makeMetrics([
      makeRequest(1, '/users/:id'),
      makeRequest(2, '/users/:id'),
      makeRequest(3, '/users/:id'),
    ]);
    // Each ID appears in only one route — no traversal
    expect(computeTraversal(metrics)).toBe(0.0);
  });
});
