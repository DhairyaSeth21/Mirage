import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import { createProxyServer } from '../../src/proxy/server.js';

// Pre-built metrics that yield level 3 pressure (~0.65)
// With LEVEL_THRESHOLDS [0.25, 0.4, 0.55, 0.8]:
// coverage(1.0)*0.20 + enum(1.0)*0.25 + timing(1.0)*0.10 + methodUniformity(1.0)*0.10 = 0.65 → level 3
function buildLevel3Metrics() {
  const requests = Array.from({ length: 20 }, (_, i) => ({
    normalizedRoute: '/users/:id',
    extractedIds: [i + 1],
    responseStatus: 200,
  }));
  return {
    totalRequests: 20,
    uniqueRoutes: new Set([
      '/users', '/users/:id', '/users/:id/orders', '/users/:id/profile',
      '/orders/:id', '/orders/:id/items', '/items/:id', '/auth/login',
    ]),
    idsPerRoute: new Map([
      ['/users/:id', new Set(Array.from({ length: 10 }, (_, i) => i + 1))],
    ]),
    statusCodes: requests.map((r) => r.responseStatus),
    intervals: Array(requests.length - 1).fill(100), // regular → timing = 1.0
    methodCounts: { GET: requests.length },
    requests,
  };
}

function buildLevel0Metrics() {
  return {
    totalRequests: 1,
    uniqueRoutes: new Set(['/users/:id']),
    idsPerRoute: new Map([['/users/:id', new Set([1])]]),
    statusCodes: [200],
    intervals: [],
    methodCounts: { GET: 1 },
    requests: [{ normalizedRoute: '/users/:id', extractedIds: [1], responseStatus: 200 }],
  };
}

function buildLevel1Metrics() {
  // With LEVEL_THRESHOLDS [0.25, 0.4, 0.55, 0.8]: target pressure in [0.25, 0.40) → level 1
  // enum(3/10=0.3)*0.25 + coverage(2/5=0.4)*0.20 + timing(1.0)*0.10 + method(1.0)*0.10 = 0.355
  return {
    totalRequests: 10,
    uniqueRoutes: new Set(['/users/:id', '/orders/:id']),
    idsPerRoute: new Map([['/users/:id', new Set([1, 2, 3])]]),
    statusCodes: Array(10).fill(200),
    intervals: Array(9).fill(100), // regular timing → score 1.0
    methodCounts: { GET: 10 },
    requests: Array.from({ length: 10 }, (_, i) => ({
      normalizedRoute: '/users/:id',
      extractedIds: [(i % 3) + 1],
      responseStatus: 200,
    })),
  };
}

function createFixedTracker(metrics) {
  return {
    addRequest() {},
    computeMetrics() { return metrics; },
  };
}

let mockApi;
let mockApiPort;

beforeAll(async () => {
  mockApi = http.createServer((req, res) => {
    if (req.url === '/users') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const users = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1, name: `User ${i + 1}`, email: `user${i + 1}@example.com`, createdAt: '2024-01-01T00:00:00.000Z',
      }));
      res.end(JSON.stringify({ data: users }));
    } else if (req.url === '/users/42') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 42, name: 'Alice Smith', email: 'alice@company.com', createdAt: '2024-01-01T00:00:00.000Z' }));
    } else if (req.url === '/users/999') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }
  });
  await new Promise((resolve) => mockApi.listen(0, resolve));
  mockApiPort = mockApi.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => mockApi.close(resolve));
});

describe('proxy response modification', () => {
  test('level 0 → response body identical to upstream, no delay in log', async () => {
    const logEntries = [];
    const proxy = createProxyServer(`http://localhost:${mockApiPort}`, {
      clientTracker: createFixedTracker(buildLevel0Metrics()),
      logger: (entry) => logEntries.push(entry),
    });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyUrl = `http://localhost:${proxy.address().port}`;

    const res = await fetch(`${proxyUrl}/users/42`);
    const body = await res.json();

    expect(body.id).toBe(42);
    expect(body.name).toBe('Alice Smith');

    const entry = logEntries.find((e) => !e.event);
    expect(entry.response_modified).toBe(false);
    expect(entry.latency_added_ms).toBe(0);
    expect(entry.level).toBe(0);

    await new Promise((resolve) => proxy.close(resolve));
  });

  test('level 1 → body identical to upstream, latency_added_ms > 0 in log', async () => {
    const logEntries = [];
    const proxy = createProxyServer(`http://localhost:${mockApiPort}`, {
      clientTracker: createFixedTracker(buildLevel1Metrics()),
      logger: (entry) => logEntries.push(entry),
    });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyUrl = `http://localhost:${proxy.address().port}`;

    const res = await fetch(`${proxyUrl}/users/42`);
    const body = await res.json();

    expect(body.id).toBe(42);
    expect(body.name).toBe('Alice Smith'); // body unchanged

    const entry = logEntries.find((e) => !e.event);
    expect(entry.level).toBe(1);
    expect(entry.latency_added_ms).toBeGreaterThan(0);
    expect(entry.response_modified).toBe(false);

    await new Promise((resolve) => proxy.close(resolve));
  }, 10000);

  test('level 3, list endpoint → response contains decoys, log shows modifications', async () => {
    const logEntries = [];
    const proxy = createProxyServer(`http://localhost:${mockApiPort}`, {
      clientTracker: createFixedTracker(buildLevel3Metrics()),
      logger: (entry) => logEntries.push(entry),
    });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyUrl = `http://localhost:${proxy.address().port}`;

    const res = await fetch(`${proxyUrl}/users`);
    const body = await res.json();

    // Should have more records than the original 5
    expect(body.data.length).toBeGreaterThan(5);

    const entry = logEntries.find((e) => !e.event);
    expect(entry.level).toBe(3);
    expect(entry.response_modified).toBe(true);
    expect(entry.modifications).toContain('decoy_injection');

    await new Promise((resolve) => proxy.close(resolve));
  }, 10000);

  test('level 3, individual endpoint → fields mutated, marker embedded', async () => {
    const logEntries = [];
    const proxy = createProxyServer(`http://localhost:${mockApiPort}`, {
      clientTracker: createFixedTracker(buildLevel3Metrics()),
      logger: (entry) => logEntries.push(entry),
    });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyUrl = `http://localhost:${proxy.address().port}`;

    const res = await fetch(`${proxyUrl}/users/42`);
    const body = await res.json();

    // id and name unchanged
    expect(body.id).toBe(42);
    expect(body.name).toBe('Alice Smith');
    // email mutated
    expect(body.email).not.toBe('alice@company.com');
    // attribution marker embedded
    expect(body._ref).toMatch(/^mrk_[0-9a-f]{4}$/);

    const entry = logEntries.find((e) => !e.event);
    expect(entry.response_modified).toBe(true);
    expect(entry.modifications).toContain('field_mutation');
    expect(entry.modifications).toContain('marker_embedded');
    expect(entry.marker).toMatch(/^mrk_[0-9a-f]{4}$/);

    // Attribution marker event logged separately
    const markerEvent = logEntries.find((e) => e.event === 'attribution_marker');
    expect(markerEvent).toBeTruthy();
    expect(markerEvent.marker).toBe(entry.marker);

    await new Promise((resolve) => proxy.close(resolve));
  }, 10000);
});
