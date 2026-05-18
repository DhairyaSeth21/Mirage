import http from 'http';
import httpProxy from 'http-proxy';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logRequest as defaultLogRequest } from '../logging/logger.js';
import { getFingerprint } from '../tracking/identifier.js';
import { tracker as defaultTracker } from '../tracking/tracker.js';
import { normalizeRoute } from '../detection/routeNormalizer.js';
import { computePressure } from '../detection/pressure.js';

/**
 * Creates an HTTP reverse proxy that:
 *   - Forwards every request transparently to upstreamUrl
 *   - Identifies each client by composite fingerprint
 *   - Tracks per-client request history in a sliding window
 *   - Scores every request with the 6-signal pressure model
 *   - Logs a structured JSON entry per request including pressure, level, and signals
 *   - Returns 502 if the upstream is unreachable
 *
 * @param {string} upstreamUrl - Full URL of the upstream API (e.g. "http://localhost:4000")
 * @param {{
 *   logger?: function,
 *   clientTracker?: { addRequest: function, computeMetrics: function },
 * }} [options] - Optional overrides for testability
 * @returns {http.Server}
 */
export function createProxyServer(upstreamUrl, options = {}) {
  const logger = options.logger ?? defaultLogRequest;
  const clientTracker = options.clientTracker ?? defaultTracker;

  const proxy = httpProxy.createProxyServer({ changeOrigin: false });

  proxy.on('error', (err, req, res) => {
    req._mirageResponseStatus = 502;
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway' }));
  });

  proxy.on('proxyRes', (proxyRes, req) => {
    req._mirageResponseStatus = proxyRes.statusCode;
  });

  const server = http.createServer((req, res) => {
    const startTime = Date.now();
    const clientId = getFingerprint(req);
    const { normalizedRoute, extractedIds } = normalizeRoute(req.url ?? '/');

    res.on('finish', () => {
      const responseStatus = req._mirageResponseStatus ?? res.statusCode;

      clientTracker.addRequest(clientId, {
        timestamp: startTime,
        method: req.method,
        path: req.url,
        normalizedRoute,
        extractedIds,
        responseStatus,
      });

      const metrics = clientTracker.computeMetrics(clientId);
      const { signals, pressure, level } = computePressure(metrics);

      logger({
        timestamp: new Date(startTime).toISOString(),
        method: req.method,
        path: req.url,
        status: responseStatus,
        latencyMs: Date.now() - startTime,
        clientIp: req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        clientId,
        pressure,
        level,
        signals,
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
