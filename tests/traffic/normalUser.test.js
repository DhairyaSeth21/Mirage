import { describe, test, expect } from '@jest/globals';
import { normalUser } from '../../scripts/traffic/normalUser.js';

/** HTTP mock that returns plausible API shapes. */
function makeHttpMock() {
  const calls = [];
  const client = async (method, url) => {
    calls.push({ method, url });
    const path = new URL(url).pathname;
    if (path.match(/\/users\/\d+\/orders$/)) {
      return { status: 200, body: { orders: [{ id: 101 }, { id: 102 }] }, size: 200 };
    }
    if (path.match(/\/orders\/\d+\/items$/)) {
      return { status: 200, body: { items: [{ id: 501 }, { id: 502 }] }, size: 150 };
    }
    return { status: 200, body: {}, size: 100 };
  };
  client.calls = calls;
  return client;
}

/** Sleep mock that records delay values without waiting. */
function makeSleepMock() {
  const delays = [];
  const sleep = async (ms) => { delays.push(ms); };
  sleep.delays = delays;
  return sleep;
}

function computeCV(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

describe('normalUser simulator', () => {
  test('only accesses own userId resources — no other user paths', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await normalUser({
      baseUrl: 'http://localhost:3000',
      userId: 42,
      sessionDuration: 30,
      httpClient: http,
      sleepFn: sleep,
    });

    const paths = http.calls.map(c => new URL(c.url).pathname);
    for (const path of paths) {
      const match = path.match(/^\/users\/(\d+)(?:\/|$)/);
      if (match) {
        expect(Number(match[1])).toBe(42);
      }
    }
  });

  test('session produces between 5 and 50 requests', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await normalUser({
      baseUrl: 'http://localhost:3000',
      userId: 7,
      sessionDuration: 30,
      httpClient: http,
      sleepFn: sleep,
    });
    expect(entries.length).toBeGreaterThanOrEqual(5);
    expect(entries.length).toBeLessThanOrEqual(50);
  });

  test('method distribution includes at least one non-GET request (POST /auth/login)', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await normalUser({
      baseUrl: 'http://localhost:3000',
      userId: 10,
      sessionDuration: 30,
      httpClient: http,
      sleepFn: sleep,
    });
    const methods = entries.map(e => e.method);
    expect(methods).toContain('POST');
  });

  test('request intervals have high coefficient of variation (CV > 0.5)', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await normalUser({
      baseUrl: 'http://localhost:3000',
      userId: 15,
      sessionDuration: 30,
      httpClient: http,
      sleepFn: sleep,
    });

    const delays = sleep.delays;
    expect(delays.length).toBeGreaterThan(1);
    const cv = computeCV(delays);
    expect(cv).toBeGreaterThan(0.5);
  });

  test('each entry has required JSONL fields', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await normalUser({
      baseUrl: 'http://localhost:3000',
      userId: 5,
      sessionDuration: 30,
      httpClient: http,
      sleepFn: sleep,
    });

    for (const entry of entries) {
      expect(entry).toHaveProperty('session_id');
      expect(entry).toHaveProperty('client_type', 'normal');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('method');
      expect(entry).toHaveProperty('path');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('latency_ms');
    }
  });
});
