import { describe, test, expect } from '@jest/globals';
import { createTracker } from '../../src/tracking/tracker.js';

/** Builds a minimal request entry for the tracker. */
function makeRequest({
  timestamp = Date.now(),
  method = 'GET',
  path = '/users/1',
  normalizedRoute = '/users/:id',
  extractedIds = [1],
  responseStatus = 200,
} = {}) {
  return { timestamp, method, path, normalizedRoute, extractedIds, responseStatus };
}

describe('addRequest / getState', () => {
  test('stores a request and it appears in getState', () => {
    const tracker = createTracker();
    tracker.addRequest('client-1', makeRequest());
    const state = tracker.getState('client-1');
    expect(state).not.toBeNull();
    expect(state.requests).toHaveLength(1);
    expect(state.clientId).toBe('client-1');
  });

  test('getState returns null for unknown client', () => {
    const tracker = createTracker();
    expect(tracker.getState('nobody')).toBeNull();
  });

  test('firstSeen is set on first request, lastSeen updates on subsequent', () => {
    const tracker = createTracker();
    const t1 = Date.now();
    tracker.addRequest('c1', makeRequest({ timestamp: t1 }));
    const t2 = t1 + 1000;
    tracker.addRequest('c1', makeRequest({ timestamp: t2 }));
    const state = tracker.getState('c1');
    expect(state.firstSeen).toBe(t1);
    expect(state.lastSeen).toBe(t2);
  });

  test('multiple clients are tracked independently', () => {
    const tracker = createTracker();
    tracker.addRequest('client-A', makeRequest({ path: '/users/1', normalizedRoute: '/users/:id', extractedIds: [1] }));
    tracker.addRequest('client-B', makeRequest({ path: '/orders/5', normalizedRoute: '/orders/:id', extractedIds: [5] }));
    expect(tracker.getState('client-A').requests[0].path).toBe('/users/1');
    expect(tracker.getState('client-B').requests[0].path).toBe('/orders/5');
  });

  test('requests older than WINDOW_SIZE_MS are evicted on next addRequest', () => {
    const tracker = createTracker({ windowSizeMs: 1000 });
    const oldTimestamp = Date.now() - 2000; // 2 seconds ago — outside window
    tracker.addRequest('c1', makeRequest({ timestamp: oldTimestamp }));

    // Add a new request to trigger eviction
    tracker.addRequest('c1', makeRequest({ timestamp: Date.now() }));

    const state = tracker.getState('c1');
    expect(state.requests).toHaveLength(1); // old one evicted
  });
});

describe('computeMetrics', () => {
  test('correctly counts unique routes', () => {
    const tracker = createTracker();
    tracker.addRequest('c1', makeRequest({ normalizedRoute: '/users/:id' }));
    tracker.addRequest('c1', makeRequest({ normalizedRoute: '/users/:id' })); // same route
    tracker.addRequest('c1', makeRequest({ normalizedRoute: '/orders/:id' }));
    const metrics = tracker.computeMetrics('c1');
    expect(metrics.uniqueRoutes.size).toBe(2);
    expect(metrics.totalRequests).toBe(3);
  });

  test('correctly groups IDs per route', () => {
    const tracker = createTracker();
    tracker.addRequest('c1', makeRequest({ normalizedRoute: '/users/:id', extractedIds: [1] }));
    tracker.addRequest('c1', makeRequest({ normalizedRoute: '/users/:id', extractedIds: [2] }));
    tracker.addRequest('c1', makeRequest({ normalizedRoute: '/users/:id', extractedIds: [3] }));
    tracker.addRequest('c1', makeRequest({ normalizedRoute: '/orders/:id', extractedIds: [10] }));
    const metrics = tracker.computeMetrics('c1');
    expect(metrics.idsPerRoute.get('/users/:id').size).toBe(3);
    expect(metrics.idsPerRoute.get('/orders/:id').size).toBe(1);
  });

  test('correctly computes intervals between consecutive requests', () => {
    const tracker = createTracker();
    const base = Date.now();
    tracker.addRequest('c1', makeRequest({ timestamp: base }));
    tracker.addRequest('c1', makeRequest({ timestamp: base + 100 }));
    tracker.addRequest('c1', makeRequest({ timestamp: base + 300 }));
    const metrics = tracker.computeMetrics('c1');
    expect(metrics.intervals).toEqual([100, 200]);
  });

  test('returns correct method counts', () => {
    const tracker = createTracker();
    tracker.addRequest('c1', makeRequest({ method: 'GET' }));
    tracker.addRequest('c1', makeRequest({ method: 'GET' }));
    tracker.addRequest('c1', makeRequest({ method: 'POST' }));
    const metrics = tracker.computeMetrics('c1');
    expect(metrics.methodCounts.GET).toBe(2);
    expect(metrics.methodCounts.POST).toBe(1);
  });

  test('includes raw requests array in metrics', () => {
    const tracker = createTracker();
    tracker.addRequest('c1', makeRequest({ path: '/users/1' }));
    tracker.addRequest('c1', makeRequest({ path: '/users/2' }));
    const metrics = tracker.computeMetrics('c1');
    expect(Array.isArray(metrics.requests)).toBe(true);
    expect(metrics.requests).toHaveLength(2);
  });

  test('returns empty metrics for unknown client', () => {
    const tracker = createTracker();
    const metrics = tracker.computeMetrics('nobody');
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.uniqueRoutes.size).toBe(0);
    expect(metrics.intervals).toEqual([]);
    expect(metrics.requests).toEqual([]);
  });

  test('single request produces no intervals', () => {
    const tracker = createTracker();
    tracker.addRequest('c1', makeRequest());
    const metrics = tracker.computeMetrics('c1');
    expect(metrics.intervals).toEqual([]);
  });
});
