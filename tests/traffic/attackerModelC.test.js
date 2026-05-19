import { describe, test, expect } from '@jest/globals';
import {
  generateInterval,
  buildTraversalChain,
  attackerModelC,
  MODEL_C_USER_AGENT,
} from '../../scripts/traffic/attackerModelC.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function computeCV(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * HTTP mock factory for Model C.
 * Page 1 returns 3 users (totalPages: 1).
 * Each user has one order; each order has one item.
 * history[] records { method, url, options, status } for every call.
 */
function makeHttpMock() {
  const history = [];
  const client = async (method, url, options) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    let status, body;

    if (/\/orders\/\d+\/items$/.test(path)) {
      status = 200; body = { data: [{ id: 200, name: 'Widget' }] };
    } else if (/\/users\/\d+\/profile$/.test(path)) {
      const id = Number(path.match(/\/users\/(\d+)\/profile$/)[1]);
      status = 200; body = { userId: id };
    } else if (/\/users\/\d+\/orders$/.test(path)) {
      const id = Number(path.match(/\/users\/(\d+)\/orders$/)[1]);
      status = 200; body = { data: [{ id: 100 + id }] };
    } else if (/\/users\/\d+$/.test(path)) {
      const id = Number(path.match(/\/users\/(\d+)$/)[1]);
      status = 200; body = { id, name: `User ${id}` };
    } else {
      // /users list (with optional ?page= query)
      status = 200;
      body = { data: [{ id: 1 }, { id: 2 }, { id: 3 }], totalPages: 1 };
    }

    history.push({ method, url, options, status });
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

describe('Model C — generateInterval', () => {
  test('values are within 200–2000ms range', () => {
    for (let i = 0; i < 200; i++) {
      const v = generateInterval();
      expect(v).toBeGreaterThanOrEqual(200);
      expect(v).toBeLessThanOrEqual(2000);
    }
  });

  test('CV is between 0.3 and 0.7 (moderate variance timing)', () => {
    const samples = Array.from({ length: 2000 }, () => generateInterval());
    const cv = computeCV(samples);
    expect(cv).toBeGreaterThan(0.3);
    expect(cv).toBeLessThan(0.7);
  });
});

// ─── buildTraversalChain (pure helper) ───────────────────────────────────────

describe('Model C — buildTraversalChain', () => {
  test('first path is the user detail path', () => {
    const chain = buildTraversalChain(42, [100]);
    expect(chain[0]).toBe('/users/42');
  });

  test('chain includes profile and orders paths', () => {
    const chain = buildTraversalChain(42, [100]);
    expect(chain).toContain('/users/42/profile');
    expect(chain).toContain('/users/42/orders');
  });

  test('chain includes items path when order IDs provided', () => {
    const chain = buildTraversalChain(42, [100]);
    expect(chain).toContain('/orders/100/items');
  });

  test('chain omits items path when no order IDs given', () => {
    const chain = buildTraversalChain(42, []);
    expect(chain.every((p) => !p.includes('/items'))).toBe(true);
  });

  test('traversal order is user → profile → orders → items', () => {
    const chain = buildTraversalChain(7, [55]);
    const userIdx = chain.indexOf('/users/7');
    const profileIdx = chain.indexOf('/users/7/profile');
    const ordersIdx = chain.indexOf('/users/7/orders');
    const itemsIdx = chain.indexOf('/orders/55/items');
    expect(userIdx).toBeLessThan(profileIdx);
    expect(profileIdx).toBeLessThan(ordersIdx);
    expect(ordersIdx).toBeLessThan(itemsIdx);
  });
});

// ─── full run via mock HTTP client ────────────────────────────────────────────

describe('Model C — full run (mock server)', () => {
  test('first request is to /users (discovery via pagination)', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await attackerModelC({
      baseUrl: 'http://localhost:3000',
      maxUsers: 3,
      httpClient: http,
      sleepFn: sleep,
    });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].path).toMatch(/^\/users/);
  });

  test('multiple users are traversed (> 1 unique user detail path)', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await attackerModelC({
      baseUrl: 'http://localhost:3000',
      maxUsers: 3,
      httpClient: http,
      sleepFn: sleep,
    });
    const userDetailPaths = entries
      .map((e) => e.path)
      .filter((p) => /^\/users\/\d+$/.test(p));
    const uniqueIds = new Set(userDetailPaths.map((p) => p.split('/')[2]));
    expect(uniqueIds.size).toBeGreaterThan(1);
  });

  test('request pattern shows user → profile → orders → items chain for first user', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await attackerModelC({
      baseUrl: 'http://localhost:3000',
      maxUsers: 1,
      httpClient: http,
      sleepFn: sleep,
    });
    const paths = entries.map((e) => e.path);
    const userIdx = paths.findIndex((p) => p === '/users/1');
    const profileIdx = paths.findIndex((p) => p === '/users/1/profile');
    const ordersIdx = paths.findIndex((p) => p === '/users/1/orders');
    const itemsIdx = paths.findIndex((p) => /\/orders\/\d+\/items/.test(p));
    expect(userIdx).toBeGreaterThanOrEqual(0);
    expect(profileIdx).toBeGreaterThan(userIdx);
    expect(ordersIdx).toBeGreaterThan(profileIdx);
    expect(itemsIdx).toBeGreaterThan(ordersIdx);
  });

  test('User-Agent header is a realistic browser string (Mozilla + browser engine)', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await attackerModelC({
      baseUrl: 'http://localhost:3000',
      maxUsers: 1,
      httpClient: http,
      sleepFn: sleep,
    });
    const ua = http.history[0].options?.headers?.['User-Agent'];
    expect(typeof ua).toBe('string');
    expect(ua).toMatch(/Mozilla\/5\.0/);
    expect(ua).toMatch(/Chrome|Firefox|Safari|Edge/);
  });

  test('every request includes Accept and Accept-Language headers', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await attackerModelC({
      baseUrl: 'http://localhost:3000',
      maxUsers: 1,
      httpClient: http,
      sleepFn: sleep,
    });
    for (const call of http.history) {
      expect(call.options?.headers).toHaveProperty('Accept');
      expect(call.options?.headers).toHaveProperty('Accept-Language');
    }
  });

  test('User-Agent in requests matches exported MODEL_C_USER_AGENT constant', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await attackerModelC({
      baseUrl: 'http://localhost:3000',
      maxUsers: 1,
      httpClient: http,
      sleepFn: sleep,
    });
    const ua = http.history[0].options?.headers?.['User-Agent'];
    expect(ua).toBe(MODEL_C_USER_AGENT);
  });

  test('all entries have client_type "model_c"', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await attackerModelC({
      baseUrl: 'http://localhost:3000',
      maxUsers: 2,
      httpClient: http,
      sleepFn: sleep,
    });
    expect(entries.every((e) => e.client_type === 'model_c')).toBe(true);
  });

  test('all entries have required JSONL fields', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await attackerModelC({
      baseUrl: 'http://localhost:3000',
      maxUsers: 1,
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
