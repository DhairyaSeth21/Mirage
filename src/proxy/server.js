import http from 'http';
import httpProxy from 'http-proxy';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logRequest as defaultLogRequest } from '../logging/logger.js';
import { getFingerprint } from '../tracking/identifier.js';
import { tracker as defaultTracker } from '../tracking/tracker.js';
import { normalizeRoute } from '../detection/routeNormalizer.js';
import { computePressureWith } from '../detection/pressure.js';
import { computeLatency } from '../response/latency.js';
import { computeThrottle } from '../response/throttle.js';
import { poisonResponse } from '../response/poison.js';
import { generateMarker, embedMarker } from '../response/attribution.js';
import { createRateLimiter } from '../response/rateLimit.js';

/**
 * Creates an HTTP reverse proxy supporting three operation modes:
 *   - 'undefended'   — transparent pass-through, no detection or modification
 *   - 'ratelimit'    — token-bucket at 100 req/min per client; returns 429 when exceeded
 *   - 'full-defense' — (default) full Mirage: detection, latency, throttling, poisoning, markers
 *
 * All modes log a structured JSON entry per request (includes user_agent for client-type analysis).
 *
 * @param {string} upstreamUrl - Full URL of the upstream API (e.g. "http://localhost:4000")
 * @param {{
 *   mode?: 'undefended' | 'ratelimit' | 'full-defense',
 *   logger?: function,
 *   clientTracker?: { addRequest: function, computeMetrics: function },
 *   weights?: object,
 * }} [options]
 * @returns {http.Server}
 */
export function createProxyServer(upstreamUrl, options = {}) {
  const mode = options.mode ?? 'full-defense';
  const logger = options.logger ?? defaultLogRequest;
  const clientTracker = options.clientTracker ?? defaultTracker;
  const weights = options.weights ?? config.WEIGHTS;
  const rateLimiter = createRateLimiter();

  // selfHandleResponse: true — we buffer and send responses ourselves
  const proxy = httpProxy.createProxyServer({ selfHandleResponse: true });

  // Tell upstream not to compress — we need to read the raw JSON body
  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('accept-encoding', 'identity');
  });

  proxy.on('error', (_err, req, res) => {
    const startTime = req._mirageStartTime ?? Date.now();
    const clientId = req._mirageClientId ?? '';
    const normalizedRoute = req._mirageNormalizedRoute ?? req.url ?? '/';

    if (clientId && mode === 'full-defense') {
      clientTracker.addRequest(clientId, {
        timestamp: startTime,
        method: req.method,
        path: req.url,
        normalizedRoute,
        extractedIds: req._mirageExtractedIds ?? [],
        responseStatus: 502,
      });
    }

    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway' }));

    logger({
      timestamp: new Date(startTime).toISOString(),
      clientId,
      user_agent: req.headers['user-agent'] ?? '',
      method: req.method,
      path: req.url,
      normalizedRoute,
      pressure: 0,
      level: 0,
      signals: {},
      upstream_status: 502,
      sent_status: 502,
      response_modified: false,
      modifications: [],
      marker: null,
      latency_added_ms: 0,
      total_latency_ms: Date.now() - startTime,
    });
  });

  proxy.on('proxyRes', (proxyRes, req, res) => {
    const chunks = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));

    proxyRes.on('end', async () => {
      const startTime = req._mirageStartTime;
      const clientId = req._mirageClientId;
      const normalizedRoute = req._mirageNormalizedRoute;
      const extractedIds = req._mirageExtractedIds;
      const userAgent = req.headers['user-agent'] ?? '';

      const rawBody = Buffer.concat(chunks).toString('utf-8');
      let sentStatus = proxyRes.statusCode;
      let responseBody = rawBody;
      const modifications = [];
      let marker = null;
      let pressure = 0;
      let level = 0;
      let signals = {};
      let totalDelay = 0;

      if (mode === 'full-defense') {
        clientTracker.addRequest(clientId, {
          timestamp: startTime,
          method: req.method,
          path: req.url,
          normalizedRoute,
          extractedIds,
          responseStatus: proxyRes.statusCode,
        });

        const metrics = clientTracker.computeMetrics(clientId);
        ({ signals, pressure, level } = computePressureWith(metrics, weights));

        const latencyDelay = computeLatency(level);
        const throttleDelay = computeThrottle(level, metrics, normalizedRoute);
        totalDelay = Math.round(latencyDelay + throttleDelay);

        if (level >= 3) {
          // Structural poisoning
          try {
            const requestInfo = { normalizedRoute, extractedIds, clientId };
            const poisoned = poisonResponse(level, requestInfo, { status: proxyRes.statusCode, body: rawBody }, metrics);
            responseBody = poisoned.body;
            sentStatus = poisoned.status;
            modifications.push(...poisoned.modifications);
          } catch {
            // Non-JSON or unexpected body — pass through
          }

          // Attribution marker embedding
          try {
            const parsedBody = JSON.parse(responseBody);
            if (parsedBody && typeof parsedBody === 'object') {
              marker = generateMarker(clientId);
              const markedBody = embedMarker(parsedBody, marker);
              responseBody = JSON.stringify(markedBody);
              modifications.push('marker_embedded');

              logger({
                event: 'attribution_marker',
                marker,
                sessionId: clientId,
                clientId,
                path: req.url,
                timestamp: new Date(startTime).toISOString(),
              });
            }
          } catch {
            // Non-JSON — skip marker
          }
        }
      }

      // Apply delay before sending
      if (totalDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, totalDelay));
      }

      // Copy upstream headers, stripping encoding headers that no longer apply
      const responseHeaders = {};
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        const lower = key.toLowerCase();
        if (lower === 'transfer-encoding' || lower === 'content-encoding') continue;
        responseHeaders[key] = value;
      }
      const bodyBuffer = Buffer.from(responseBody, 'utf-8');
      responseHeaders['content-length'] = String(bodyBuffer.length);

      const totalLatencyMs = Date.now() - startTime;

      res.writeHead(sentStatus, responseHeaders);
      res.end(bodyBuffer);

      logger({
        timestamp: new Date(startTime).toISOString(),
        clientId,
        user_agent: userAgent,
        method: req.method,
        path: req.url,
        normalizedRoute,
        pressure,
        level,
        signals,
        upstream_status: proxyRes.statusCode,
        sent_status: sentStatus,
        response_modified: modifications.length > 0,
        modifications,
        marker,
        latency_added_ms: totalDelay,
        total_latency_ms: totalLatencyMs,
      });
    });
  });

  const server = http.createServer((req, res) => {
    const startTime = Date.now();
    const clientId = getFingerprint(req);
    const { normalizedRoute, extractedIds } = normalizeRoute(req.url ?? '/');

    req._mirageStartTime = startTime;
    req._mirageClientId = clientId;
    req._mirageNormalizedRoute = normalizedRoute;
    req._mirageExtractedIds = extractedIds;

    // Rate-limit mode: check token bucket before forwarding to upstream
    if (mode === 'ratelimit') {
      if (!rateLimiter.isAllowed(clientId)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too Many Requests' }));
        logger({
          timestamp: new Date(startTime).toISOString(),
          clientId,
          user_agent: req.headers['user-agent'] ?? '',
          method: req.method,
          path: req.url,
          normalizedRoute,
          pressure: 0,
          level: 0,
          signals: {},
          upstream_status: 429,
          sent_status: 429,
          response_modified: false,
          modifications: [],
          marker: null,
          latency_added_ms: 0,
          total_latency_ms: Date.now() - startTime,
        });
        return;
      }
    }

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
