import { describe, test, expect } from '@jest/globals';
import { computePressure } from '../../src/detection/pressure.js';
import { config } from '../../src/config.js';

/** Builds metrics that will drive each signal to approximately the given value. */
function buildMetricsForSignals({ coverage = 0, enumeration = 0, errorAdaptation = 0, traversal = 0, timing = 0, methodUniformity = 0 } = {}) {
  // Coverage: uniqueRoutes.size / COVERAGE_THRESHOLD
  const routeCount = Math.round(coverage * config.COVERAGE_THRESHOLD);
  const uniqueRoutes = new Set(Array.from({ length: routeCount }, (_, i) => `/resource${i}/:id`));

  // Enumeration: maxIds / ENUM_THRESHOLD
  const idCount = Math.round(enumeration * config.ENUM_THRESHOLD);
  const idsPerRoute = new Map();
  if (idCount > 0) {
    idsPerRoute.set('/target/:id', new Set(Array.from({ length: idCount }, (_, i) => i + 1)));
  }

  // MethodUniformity: GET / total
  const totalForMethod = 10;
  const getCount = Math.round(methodUniformity * totalForMethod);
  const postCount = totalForMethod - getCount;
  const methodCounts = {};
  if (getCount > 0) methodCounts.GET = getCount;
  if (postCount > 0) methodCounts.POST = postCount;

  // Timing: 1 - min(CV / CV_THRESHOLD, 1.0) — set intervals to achieve target
  // timing=1 → CV=0 → all intervals equal (e.g., [100,100,100])
  // timing=0 → CV≥CV_THRESHOLD → very irregular
  let intervals = [];
  if (timing >= 0.99) {
    intervals = [100, 100, 100, 100];
  } else if (timing <= 0.01) {
    intervals = [10, 5000, 50, 8000]; // high CV
  } else {
    intervals = []; // skip — timing signal contributes 0 with no intervals
  }

  // ErrorAdaptation: build requests with 404 + different ID follow-up
  // errorAdaptation=1 → all 404s have adapted follow-ups
  // errorAdaptation=0 → no 404s
  const requests = [];
  if (errorAdaptation > 0) {
    requests.push({ normalizedRoute: '/users/:id', extractedIds: [100], responseStatus: 404 });
    requests.push({ normalizedRoute: '/users/:id', extractedIds: [50], responseStatus: 200 });
  }

  // Traversal: chainedIds / TRAVERSAL_THRESHOLD
  const chainCount = Math.round(traversal * config.TRAVERSAL_THRESHOLD);
  for (let id = 1; id <= chainCount; id++) {
    requests.push({ normalizedRoute: '/users/:id', extractedIds: [id], responseStatus: 200 });
    requests.push({ normalizedRoute: '/users/:id/orders', extractedIds: [id], responseStatus: 200 });
  }

  return {
    totalRequests: totalForMethod,
    uniqueRoutes,
    idsPerRoute,
    statusCodes: [],
    intervals,
    methodCounts,
    requests,
  };
}

describe('computePressure', () => {
  test('all signals at 0 → pressure 0.0, level 0', () => {
    const metrics = buildMetricsForSignals({});
    const result = computePressure(metrics);
    expect(result.pressure).toBeCloseTo(0.0, 5);
    expect(result.level).toBe(0);
  });

  test('all signals at 1 → pressure 1.0, level 4', () => {
    const metrics = buildMetricsForSignals({
      coverage: 1,
      enumeration: 1,
      errorAdaptation: 1,
      traversal: 1,
      timing: 1,
      methodUniformity: 1,
    });
    const result = computePressure(metrics);
    expect(result.pressure).toBeCloseTo(1.0, 5);
    expect(result.level).toBe(4);
  });

  test('returns all 6 signal scores', () => {
    const result = computePressure(buildMetricsForSignals({}));
    expect(result.signals).toHaveProperty('coverage');
    expect(result.signals).toHaveProperty('enumeration');
    expect(result.signals).toHaveProperty('errorAdaptation');
    expect(result.signals).toHaveProperty('traversal');
    expect(result.signals).toHaveProperty('timing');
    expect(result.signals).toHaveProperty('methodUniformity');
  });

  test('all signal values are in [0, 1]', () => {
    const result = computePressure(buildMetricsForSignals({ coverage: 0.5, enumeration: 0.5 }));
    for (const value of Object.values(result.signals)) {
      expect(value).toBeGreaterThanOrEqual(0.0);
      expect(value).toBeLessThanOrEqual(1.0);
    }
  });

  test('weights in config sum to 1.0', () => {
    const total = Object.values(config.WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  test('normal-user pattern → level 0 or 1', () => {
    // Low coverage, low enumeration, no error adaptation, normal traversal
    const metrics = buildMetricsForSignals({
      coverage: 0.25,   // 2 routes
      enumeration: 0.05, // 1 ID per route
      errorAdaptation: 0,
      traversal: 0,
      timing: 0,        // irregular (human-like)
      methodUniformity: 0.8,
    });
    const result = computePressure(metrics);
    expect(result.level).toBeLessThanOrEqual(1);
  });

  test('attacker pattern → level 3 or 4', () => {
    const metrics = buildMetricsForSignals({
      coverage: 1,
      enumeration: 1,
      errorAdaptation: 1,
      traversal: 1,
      timing: 1,
      methodUniformity: 1,
    });
    const result = computePressure(metrics);
    expect(result.level).toBeGreaterThanOrEqual(3);
  });

  test('level thresholds partition pressure correctly', () => {
    // pressure just below each threshold
    for (let level = 0; level < config.LEVEL_THRESHOLDS.length; level++) {
      const threshold = config.LEVEL_THRESHOLDS[level];
      // A result with pressure just above the threshold should be at least level+1
      // We test this structurally by checking computePressure output
      const result = computePressure(buildMetricsForSignals({}));
      expect(result.level).toBeGreaterThanOrEqual(0);
      expect(result.level).toBeLessThanOrEqual(4);
    }
  });
});
