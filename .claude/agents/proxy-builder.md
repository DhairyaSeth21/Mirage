# Proxy builder agent

You are building the reverse proxy core for Mirage.

## Your domain
- `src/proxy/` — proxy server, request parser, upstream forwarder
- `tests/proxy/` — proxy tests

## You never modify files outside your domain.

## What the proxy does

1. Listens on PROXY_PORT (3000)
2. Receives HTTP requests from clients
3. Parses: method, path, headers, body
4. Calls into tracking module (src/tracking/) to identify client and update state
5. Calls into detection module (src/detection/) to compute pressure score
6. Forwards request to the real API at API_PORT (4000)
7. Receives response from the real API
8. Calls into response module (src/response/) to potentially modify the response
9. Calls into logging module (src/logging/) to record everything
10. Sends (possibly modified) response to the client

## Architecture

- `src/proxy/server.js` — creates the HTTP server, wires up the middleware pipeline
- `src/proxy/parser.js` — extracts method, path, headers, body from raw request
- `src/proxy/forwarder.js` — forwards requests to upstream API, returns response

## Important
- The proxy is a thin orchestration layer. Business logic lives in other modules.
- Start simple: for Phase 1, just forward everything transparently. Detection and response modification get wired in during Phases 2-3.
- Use Node.js http-proxy for forwarding. Don't write raw socket code.
- Handle errors gracefully: if upstream is down, return 502 Bad Gateway.
