import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import { createProxyServer } from '../../src/proxy/server.js';
import { createTracker } from '../../src/tracking/tracker.js';

let mockApi;
let mockApiPort;

beforeAll(async () => {
  // Mock API that returns 200 for any /users/:id path
  mockApi = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise((resolve) => mockApi.listen(0, resolve));
  mockApiPort = mockApi.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => mockApi.close(resolve));
});

describe('proxy detection integration', () => {
  test('log entries include pressure, level, and signals fields', async () => {
    const logEntries = [];
    const testTracker = createTracker();
    const proxy = createProxyServer(`http://localhost:${mockApiPort}`, {
      clientTracker: testTracker,
      logger: (entry) => logEntries.push(entry),
    });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyUrl = `http://localhost:${proxy.address().port}`;

    await fetch(`${proxyUrl}/users/1`);

    expect(logEntries).toHaveLength(1);
    const entry = logEntries[0];
    expect(entry).toHaveProperty('pressure');
    expect(entry).toHaveProperty('level');
    expect(entry).toHaveProperty('signals');
    expect(entry).toHaveProperty('clientId');
    expect(typeof entry.pressure).toBe('number');
    expect(typeof entry.level).toBe('number');
    expect(entry.signals).toHaveProperty('coverage');
    expect(entry.signals).toHaveProperty('enumeration');

    await new Promise((resolve) => proxy.close(resolve));
  });

  test('5 normal requests through proxy → low enumeration score', async () => {
    const logEntries = [];
    const testTracker = createTracker();
    const proxy = createProxyServer(`http://localhost:${mockApiPort}`, {
      clientTracker: testTracker,
      logger: (entry) => logEntries.push(entry),
    });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyUrl = `http://localhost:${proxy.address().port}`;

    // 5 requests all to the same user ID — low enumeration
    await fetch(`${proxyUrl}/users/1`);
    await fetch(`${proxyUrl}/users/1/orders`);
    await fetch(`${proxyUrl}/users/1/profile`);
    await fetch(`${proxyUrl}/orders/1`);
    await fetch(`${proxyUrl}/items/1`);

    const lastEntry = logEntries[logEntries.length - 1];
    // Enumeration should be very low — only 1 unique ID per route
    expect(lastEntry.signals.enumeration).toBeLessThan(0.15);

    await new Promise((resolve) => proxy.close(resolve));
  });

  test('30 sequential /users/:id requests → high enumeration score', async () => {
    const logEntries = [];
    const testTracker = createTracker();
    const proxy = createProxyServer(`http://localhost:${mockApiPort}`, {
      clientTracker: testTracker,
      logger: (entry) => logEntries.push(entry),
    });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyUrl = `http://localhost:${proxy.address().port}`;

    for (let i = 1; i <= 30; i++) {
      await fetch(`${proxyUrl}/users/${i}`);
    }

    const lastEntry = logEntries[logEntries.length - 1];
    // 30 unique IDs on /users/:id — enumeration = min(30/ENUM_THRESHOLD, 1.0) = 1.0
    expect(lastEntry.signals.enumeration).toBeGreaterThan(0.5);
    expect(lastEntry.level).toBeGreaterThanOrEqual(1);

    await new Promise((resolve) => proxy.close(resolve));
  }, 30000); // latency injection at level 1+ makes this slow
});
