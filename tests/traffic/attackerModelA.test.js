import { describe, test, expect } from '@jest/globals';
import { attackerModelA } from '../../scripts/traffic/attackerModelA.js';

/** HTTP mock that returns 200 for IDs 1–200, 404 otherwise. */
function makeHttpMock() {
  const calls = [];
  const client = async (method, url) => {
    calls.push({ method, url });
    const idMatch = url.match(/\/users\/(\d+)/);
    const id = idMatch ? Number(idMatch[1]) : null;
    const status = id !== null && id <= 200 ? 200 : 404;
    return { status, body: status === 200 ? { id } : { error: 'not found' }, size: 100 };
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
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

describe('attackerModelA simulator', () => {
  test('all requests are GET', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await attackerModelA({
      baseUrl: 'http://localhost:3000',
      startId: 1,
      endId: 20,
      intervalMs: 120,
      httpClient: http,
      sleepFn: sleep,
    });

    for (const call of http.calls) {
      expect(call.method).toBe('GET');
    }
  });

  test('paths follow sequential pattern /users/1, /users/2, ...', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await attackerModelA({
      baseUrl: 'http://localhost:3000',
      startId: 1,
      endId: 10,
      intervalMs: 120,
      httpClient: http,
      sleepFn: sleep,
    });

    const paths = http.calls.map(c => new URL(c.url).pathname);
    expect(paths.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(paths[i]).toBe(`/users/${i + 1}`);
    }
  });

  test('intervals are nearly uniform (CV < 0.1)', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await attackerModelA({
      baseUrl: 'http://localhost:3000',
      startId: 1,
      endId: 20,
      intervalMs: 120,
      httpClient: http,
      sleepFn: sleep,
    });

    const delays = sleep.delays;
    expect(delays.length).toBeGreaterThan(0);
    const cv = computeCV(delays);
    expect(cv).toBeLessThan(0.1);
  });

  test('hits at least 100 unique IDs when range spans 200 users', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    await attackerModelA({
      baseUrl: 'http://localhost:3000',
      startId: 1,
      endId: 200,
      intervalMs: 120,
      httpClient: http,
      sleepFn: sleep,
    });

    const paths = http.calls.map(c => new URL(c.url).pathname);
    const uniqueIds = new Set(paths.map(p => p.split('/').pop()));
    expect(uniqueIds.size).toBeGreaterThanOrEqual(100);
  });

  test('no error adaptation — completes all IDs even when every response is 404', async () => {
    const calls = [];
    const allNotFound = async (method, url) => {
      calls.push({ method, url });
      return { status: 404, body: { error: 'not found' }, size: 50 };
    };
    const sleep = makeSleepMock();

    await attackerModelA({
      baseUrl: 'http://localhost:3000',
      startId: 1,
      endId: 10,
      intervalMs: 120,
      httpClient: allNotFound,
      sleepFn: sleep,
    });

    expect(calls.length).toBe(10);
  });

  test('each entry has required JSONL fields with client_type model_a', async () => {
    const http = makeHttpMock();
    const sleep = makeSleepMock();
    const entries = await attackerModelA({
      baseUrl: 'http://localhost:3000',
      startId: 1,
      endId: 5,
      intervalMs: 120,
      httpClient: http,
      sleepFn: sleep,
    });

    expect(entries.length).toBe(5);
    for (const entry of entries) {
      expect(entry).toHaveProperty('session_id');
      expect(entry).toHaveProperty('client_type', 'model_a');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('method', 'GET');
      expect(entry).toHaveProperty('path');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('latency_ms');
    }
  });
});
