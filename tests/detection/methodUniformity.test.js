import { describe, test, expect } from '@jest/globals';
import { computeMethodUniformity } from '../../src/detection/methodUniformity.js';

function makeMetrics(methodCounts) {
  const total = Object.values(methodCounts).reduce((s, n) => s + n, 0);
  return { methodCounts, totalRequests: total };
}

describe('computeMethodUniformity', () => {
  test('no requests → score 0.0', () => {
    expect(computeMethodUniformity({ methodCounts: {}, totalRequests: 0 })).toBe(0.0);
  });

  test('100% GET → score 1.0', () => {
    expect(computeMethodUniformity(makeMetrics({ GET: 10 }))).toBe(1.0);
  });

  test('70% GET, 30% POST → score 0.7', () => {
    const score = computeMethodUniformity(makeMetrics({ GET: 7, POST: 3 }));
    expect(score).toBeCloseTo(0.7, 5);
  });

  test('50% GET, 50% POST → score 0.5', () => {
    const score = computeMethodUniformity(makeMetrics({ GET: 5, POST: 5 }));
    expect(score).toBeCloseTo(0.5, 5);
  });

  test('no GET requests → score 0.0', () => {
    expect(computeMethodUniformity(makeMetrics({ POST: 5, DELETE: 3 }))).toBe(0.0);
  });

  test('mixed methods including GET — fraction computed correctly', () => {
    const score = computeMethodUniformity(makeMetrics({ GET: 3, POST: 1, DELETE: 1, PATCH: 1 }));
    expect(score).toBeCloseTo(3 / 6, 5);
  });
});
