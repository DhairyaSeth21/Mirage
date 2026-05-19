import { describe, test, expect } from '@jest/globals';
import {
  generateInterval,
  computeBinarySearchSequence,
  attackerModelB,
} from '../../scripts/traffic/attackerModelB.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function computeCV(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * HTTP mock factory for Model B.
 * IDs 1–maxValidId return 200; above that return 404.
 * Sub-paths (/orders, /profile) always return 200.
 * history[] records { method, url, status } for every call made.
 */
function makeHttpMock(maxValidId = 5) {
  const history = [];
  const client = async (method, url) => {
    const path = new URL(url).pathname;
    let status, body;
    if (/\/users\/\d+\/orders$/.test(path)) {
      status = 200; body = { data: [{ id: 100 }] };
    } else if (/\/users\/\d+\/profile$/.test(path)) {
      status = 200; body = { userId: 1 };
    } else if (/\/users\/(\d+)$/.test(path)) {
      const id = Number(path.match(/\/users\/(\d+)$/)[1]);
      status = id <= maxValidId ? 200 : 404;
      body = status === 200 ? { id } : { error: 'not found' };
    } else {
      // /users list endpoint
      status = 200; body = { data: [], totalPages: 1 };
    }
    history.push({ method, url, status });
    return { status, body, size: 100, latencyMs: 0 };
  };
  client.history = history;
  return client;
}

/** Sleep mock that records delay values without waiting. */
function makeSleepMock() {
  const delays = [];
  const sleep = async (ms) => { delays.push(ms); };
  sleep.delays = delays;
  return sleep;
}

// ─── generateInterval ────────────────────────────────────────────────────────

describe('Model B — generateInterval', () => {
  test('values are within 80–200ms range', () => {
    for (let i = 0; i < 200; i++) {
      const v = generateInterval();
      expect(v).toBeGreaterThanOrEqual(80);
      expect(v).toBeLessThanOrEqual(200);
    }
  });

  test('CV is between 0.1 and 0.3 (low but non-zero variance)', () => {
    const samples = Array.from({ length: 2000 }, () => generateInterval());
    const cv = computeCV(samples);
    expect(cv).toBeGreaterThan(0.1);
    expect(cv).toBeLessThan(0.3);
  });
});

// ─── computeBinarySearchSequence (pure algorithm) ────────────────────────────

describe('Model B — computeBinarySearchSequence', () => {
  test('terminates with the correct max valid ID as highest hit', () => {
    const probes = computeBinarySearchSequence(5, 10);
    const maxHit = probes.filter((p) => p.hit).reduce((m, p) => Math.max(m, p.id), 0);
    expect(maxHit).toBe(5);
  });

  test('after a miss, the immediately following probe has a strictly lower ID', () => {
    const probes = computeBinarySearchSequence(5, 10);
    let checkedAtLeastOne = false;
    for (let i = 0; i + 1 < probes.length; i++) {
      if (!probes[i].hit) {
        expect(probes[i + 1].id).toBeLessThan(probes[i].id);
        checkedAtLeastOne = true;
      }
    }
    // There must be at least one miss when maxValidId < maxProbeId
    expect(checkedAtLeastOne).toBe(true);
  });

  test('produces multiple probes for a large search space', () => {
    const probes = computeBinarySearchSequence(200, 500);
    expect(probes.length).toBeGreaterThan(5);
  });

  test('every probe ID is between 1 and maxProbeId', () => {
    const probes = computeBinarySearchSequence(10, 50);
    for (const p of probes) {
      expect(p.id).toBeGreaterThanOrEqual(1);
      expect(p.id).toBeLessThanOrEqual(50);
    }
  });
});

// ─── full run via mock HTTP client ────────────────────────────────────────────

describe('Model B — full run (mock server)', () => {
  test('first request path is /users (discovery phase)', async () => {
    const http = makeHttpMock(5);
    const sleep = makeSleepMock();
    const entries = await attackerModelB({
      baseUrl: 'http://localhost:3000',
      maxProbeId: 10,
      httpClient: http,
      sleepFn: sleep,
    });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].path).toBe('/users');
  });

  test('hits /users/:id/orders sub-resource during traversal', async () => {
    const http = makeHttpMock(5);
    const sleep = makeSleepMock();
    const entries = await attackerModelB({
      baseUrl: 'http://localhost:3000',
      maxProbeId: 10,
      httpClient: http,
      sleepFn: sleep,
    });
    expect(entries.some((e) => /\/users\/\d+\/orders$/.test(e.path))).toBe(true);
  });

  test('hits /users/:id/profile sub-resource during traversal', async () => {
    const http = makeHttpMock(5);
    const sleep = makeSleepMock();
    const entries = await attackerModelB({
      baseUrl: 'http://localhost:3000',
      maxProbeId: 10,
      httpClient: http,
      sleepFn: sleep,
    });
    expect(entries.some((e) => /\/users\/\d+\/profile$/.test(e.path))).toBe(true);
  });

  test('unique normalized routes > 3 (coverage signal should fire)', async () => {
    const http = makeHttpMock(5);
    const sleep = makeSleepMock();
    const entries = await attackerModelB({
      baseUrl: 'http://localhost:3000',
      maxProbeId: 10,
      httpClient: http,
      sleepFn: sleep,
    });
    const normalizedRoutes = new Set(
      entries.map((e) => e.path.replace(/\/\d+/g, '/:id')),
    );
    expect(normalizedRoutes.size).toBeGreaterThan(3);
  });

  test('binary search: a 404 probe is followed by a lower-ID /users/:id probe', async () => {
    const http = makeHttpMock(5);
    const sleep = makeSleepMock();
    await attackerModelB({
      baseUrl: 'http://localhost:3000',
      maxProbeId: 10,
      httpClient: http,
      sleepFn: sleep,
    });

    // Filter down to /users/:id calls only (not sub-resource paths)
    const userIdCalls = http.history.filter((c) =>
      /\/users\/\d+$/.test(new URL(c.url).pathname),
    );

    const firstMissIndex = userIdCalls.findIndex((c) => c.status === 404);
    expect(firstMissIndex).toBeGreaterThanOrEqual(0); // must have at least one miss

    const missId = Number(new URL(userIdCalls[firstMissIndex].url).pathname.split('/').pop());
    const nextId = Number(
      new URL(userIdCalls[firstMissIndex + 1].url).pathname.split('/').pop(),
    );
    expect(nextId).toBeLessThan(missId);
  });

  test('all entries have client_type "model_b"', async () => {
    const http = makeHttpMock(5);
    const sleep = makeSleepMock();
    const entries = await attackerModelB({
      baseUrl: 'http://localhost:3000',
      maxProbeId: 10,
      httpClient: http,
      sleepFn: sleep,
    });
    expect(entries.every((e) => e.client_type === 'model_b')).toBe(true);
  });

  test('all entries have required JSONL fields', async () => {
    const http = makeHttpMock(5);
    const sleep = makeSleepMock();
    const entries = await attackerModelB({
      baseUrl: 'http://localhost:3000',
      maxProbeId: 10,
      httpClient: http,
      sleepFn: sleep,
    });
    for (const entry of entries) {
      expect(entry).toHaveProperty('session_id');
      expect(entry).toHaveProperty('client_type');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('method');
      expect(entry).toHaveProperty('path');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('latency_ms');
    }
  });
});
