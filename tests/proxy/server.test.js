import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import { createProxyServer } from '../../src/proxy/server.js';

let mockApi;
let proxy;
let proxyBaseUrl;

beforeAll(async () => {
  // Start a minimal mock upstream API
  mockApi = http.createServer((req, res) => {
    if (req.url === '/test') {
      res.setHeader('x-upstream-header', 'present');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world' }));
    } else if (req.url === '/notfound') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }
  });

  await new Promise((resolve) => mockApi.listen(0, resolve));
  const apiPort = mockApi.address().port;

  proxy = createProxyServer(`http://localhost:${apiPort}`);
  await new Promise((resolve) => proxy.listen(0, resolve));
  proxyBaseUrl = `http://localhost:${proxy.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => proxy.close(resolve));
  await new Promise((resolve) => mockApi.close(resolve));
});

describe('transparent forwarding', () => {
  test('forwards GET request and returns same response as upstream', async () => {
    const res = await fetch(`${proxyBaseUrl}/test`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hello: 'world' });
  });

  test('preserves upstream status codes', async () => {
    const res = await fetch(`${proxyBaseUrl}/notfound`);
    expect(res.status).toBe(404);
  });

  test('preserves upstream response headers', async () => {
    const res = await fetch(`${proxyBaseUrl}/test`);
    expect(res.headers.get('x-upstream-header')).toBe('present');
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});

describe('error handling', () => {
  test('returns 502 when upstream is unreachable', async () => {
    // Find a free port then close it so we have an unused port number
    const tempServer = http.createServer();
    await new Promise((resolve) => tempServer.listen(0, resolve));
    const unusedPort = tempServer.address().port;
    await new Promise((resolve) => tempServer.close(resolve));

    const deadProxy = createProxyServer(`http://localhost:${unusedPort}`);
    await new Promise((resolve) => deadProxy.listen(0, resolve));
    const deadProxyUrl = `http://localhost:${deadProxy.address().port}`;

    const res = await fetch(`${deadProxyUrl}/test`);
    expect(res.status).toBe(502);

    await new Promise((resolve) => deadProxy.close(resolve));
  });
});
