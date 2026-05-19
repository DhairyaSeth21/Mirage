import { describe, it, expect } from '@jest/globals';
import { computeMetrics } from '../../scripts/eval/computeMetrics.js';

// Helper — builds a minimal log entry
function makeEntry(overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    clientId: 'abc123',
    method: 'GET',
    path: '/users/1',
    normalizedRoute: '/users/:id',
    user_agent: 'Go-http-client/1.1',
    pressure: 0.8,
    level: 3,
    signals: {},
    upstream_status: 200,
    sent_status: 200,
    response_modified: false,
    modifications: [],
    marker: null,
    latency_added_ms: 0,
    total_latency_ms: 10,
    ...overrides,
  };
}

describe('computeMetrics', () => {
  it('returns all required fields', () => {
    const logs = [makeEntry()];
    const result = computeMetrics(logs);
    // time_to_map_ms is null when 80% route coverage has not been reached — that's correct
    expect(result).toMatchObject({
      extraction_accuracy: expect.any(Number),
      request_cost: expect.any(Number),
      decoy_interaction_rate: expect.any(Number),
      false_positive_rate: expect.any(Number),
      total_attacker_requests: expect.any(Number),
      total_normal_requests: expect.any(Number),
      max_pressure_score: expect.any(Number),
      avg_pressure_score: expect.any(Number),
      level_distribution: expect.any(Object),
    });
    expect('time_to_map_ms' in result).toBe(true);
    expect(result.time_to_map_ms === null || typeof result.time_to_map_ms === 'number').toBe(true);
  });

  it('extraction_accuracy is 1.0 when no responses are modified (undefended)', () => {
    const logs = [
      makeEntry({ sent_status: 200, response_modified: false }),
      makeEntry({ sent_status: 200, response_modified: false, path: '/users/2', normalizedRoute: '/users/:id' }),
    ];
    const result = computeMetrics(logs);
    expect(result.extraction_accuracy).toBe(1.0);
  });

  it('extraction_accuracy < 1.0 when responses are modified', () => {
    const logs = [
      makeEntry({ sent_status: 200, response_modified: false }),
      makeEntry({ sent_status: 200, response_modified: true, modifications: ['field_mutation'] }),
    ];
    const result = computeMetrics(logs);
    expect(result.extraction_accuracy).toBeLessThan(1.0);
    expect(result.extraction_accuracy).toBeGreaterThanOrEqual(0.0);
  });

  it('false_positive_rate is 0.0 when no normal traffic is modified', () => {
    const normalEntry = makeEntry({
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      response_modified: false,
    });
    const logs = [normalEntry, makeEntry()];
    const result = computeMetrics(logs);
    expect(result.false_positive_rate).toBe(0.0);
  });

  it('false_positive_rate > 0.0 when normal traffic is modified', () => {
    const logs = [
      makeEntry({
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        response_modified: true,
        modifications: ['field_mutation'],
      }),
    ];
    const result = computeMetrics(logs);
    expect(result.false_positive_rate).toBeGreaterThan(0.0);
  });

  it('decoy_interaction_rate counts decoy_injection modifications', () => {
    const logs = [
      makeEntry({ response_modified: true, modifications: ['decoy_injection'] }),
      makeEntry({ response_modified: false, modifications: [] }),
    ];
    const result = computeMetrics(logs);
    // 1 out of 2 attacker requests had decoy_injection
    expect(result.decoy_interaction_rate).toBeCloseTo(0.5, 2);
  });

  it('handles empty log array without throwing', () => {
    const result = computeMetrics([]);
    expect(result.extraction_accuracy).toBe(1.0);
    expect(result.request_cost).toBe(0);
    expect(result.false_positive_rate).toBe(0.0);
    expect(result.max_pressure_score).toBe(0);
    expect(result.avg_pressure_score).toBe(0);
  });

  it('counts level_distribution correctly', () => {
    const logs = [
      makeEntry({ level: 0 }),
      makeEntry({ level: 1 }),
      makeEntry({ level: 2 }),
      makeEntry({ level: 3 }),
      makeEntry({ level: 3 }),
    ];
    const result = computeMetrics(logs);
    expect(result.level_distribution[0]).toBe(1);
    expect(result.level_distribution[1]).toBe(1);
    expect(result.level_distribution[2]).toBe(1);
    expect(result.level_distribution[3]).toBe(2);
  });

  it('time_to_map_ms is null when 80% of routes are never hit', () => {
    // Only 1 unique route — well below 80% threshold of 8 routes
    const logs = [makeEntry()];
    const result = computeMetrics(logs);
    expect(result.time_to_map_ms).toBeNull();
  });

  it('time_to_map_ms is measured once attacker hits 80% of all routes', () => {
    const ts = new Date('2026-01-01T00:00:00.000Z');
    const routes = [
      '/users', '/users/:id', '/users/:id/orders', '/users/:id/profile',
      '/orders/:id', '/orders/:id/items', '/items/:id',
    ];
    const logs = routes.map((normalizedRoute, i) => makeEntry({
      normalizedRoute,
      timestamp: new Date(ts.getTime() + i * 1000).toISOString(),
    }));
    // 7 routes ≥ 80% of 8 (6.4 → 7 needed)
    const result = computeMetrics(logs);
    expect(result.time_to_map_ms).toBeGreaterThanOrEqual(0);
  });
});
