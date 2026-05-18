import http from 'http';
import httpProxy from 'http-proxy';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logRequest } from '../logging/logger.js';

/**
 * Creates an HTTP reverse proxy server that forwards all requests to upstreamUrl.
 * Returns 502 if the upstream is unreachable.
 * @param {string} upstreamUrl - Full URL of the upstream API (e.g. "http://localhost:4000")
 * @returns {http.Server}
 */
export function createProxyServer(upstreamUrl) {
  const proxy = httpProxy.createProxyServer({ changeOrigin: false });

  proxy.on('error', (err, req, res) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway' }));
  });

  const server = http.createServer((req, res) => {
    const startTime = Date.now();

    res.on('finish', () => {
      logRequest({
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        status: res.statusCode,
        latencyMs: Date.now() - startTime,
        clientIp: req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
      });
    });

    proxy.web(req, res, { target: upstreamUrl });
  });

  return server;
}

// When invoked directly: start the proxy pointing at the configured API port
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const upstreamUrl = `http://localhost:${config.API_PORT}`;
  const server = createProxyServer(upstreamUrl);
  server.listen(config.PROXY_PORT, () => {
    console.log(`Proxy listening on port ${config.PROXY_PORT} → ${upstreamUrl}`);
  });
}
