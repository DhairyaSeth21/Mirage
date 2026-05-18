# Mirage — Adaptive API Defense System

## What this project is

Mirage is a reverse proxy that detects API learning behavior (enumeration, traversal, probing) and disrupts it through graduated response strategies — from latency injection to structural data poisoning. Instead of blocking attackers (which reveals detection), Mirage corrupts their learned model of the API so they leave with bad data and don't know it.

## Architecture overview

```
Client request
       ↓
[TLS termination + request parser]     → src/proxy/server.js
       ↓
[Client identifier]                     → src/tracking/identifier.js
       ↓
[Client state tracker]                  → src/tracking/tracker.js
       ↓
[Detection engine — 6 signals]          → src/detection/
       ↓
[Decision engine — pressure → level]    → src/detection/pressure.js
       ↓
[Upstream forwarder]                    → src/proxy/forwarder.js
       ↓
[Response modifier + decoy generator]   → src/response/
       ↓
[Structured logger]                     → src/logging/logger.js
       ↓
Response to client
```

## Module boundaries — STRICT

Each directory owns its domain. Never put detection logic in the proxy module or response logic in the tracking module.

- `src/api/` — The demo REST API that Mirage protects. Express server with users, orders, items, profiles. This is the "real server" behind the proxy. Has its own database.
- `src/proxy/` — The reverse proxy. TLS termination, request parsing, upstream forwarding. Thin layer — it calls into tracking and detection but contains no business logic itself.
- `src/tracking/` — Client identification (composite fingerprint) and sliding-window state management. Stores per-client request history and computed metrics.
- `src/detection/` — The 6 behavioral signals and pressure score computation. Each signal is its own file. The pressure module combines them.
- `src/response/` — Response modification engine and decoy data generator. Operates on the real server's response based on the escalation level.
- `src/logging/` — Structured JSON logging. Every request produces one log entry with request data, detection state, and response data.
- `tests/` — Mirrors src/ structure. Every module has tests. Tests run with Jest.
- `scripts/` — Traffic generators (normal users + 3 attacker models), evaluation runners, dataset export.

## Tech stack

- **Runtime**: Node.js (v20+)
- **Demo API**: Express.js + SQLite (via better-sqlite3)
- **Proxy**: Node.js http-proxy module
- **Tests**: Jest
- **No frontend framework needed** for MVP. Dashboard will be a simple HTML page reading from log files.

## Coding conventions

- ES modules (`import/export`), not CommonJS (`require`)
- All functions that can fail return explicit errors, no silent swallowing
- Config values (thresholds, weights, window sizes) live in `src/config.js`, never hardcoded
- Every public function has a JSDoc comment explaining what it does
- Variable names are descriptive: `uniqueRoutesInWindow` not `urw`
- No classes unless genuinely needed. Prefer plain functions and objects.
- Async/await everywhere, no raw promises or callbacks

## Testing requirements

- **Write tests BEFORE implementation**. This is mandatory, not optional.
- Each detection signal has at minimum:
  - A test with clearly-normal traffic that should score below 0.2
  - A test with clearly-suspicious traffic that should score above 0.8
  - An edge case test (empty window, single request, etc.)
- Integration tests verify the full pipeline: request in → score computed → response modified
- Run `npm test` before every commit. All tests must pass.

## The 6 detection signals

Each signal takes a client's sliding window state and returns a score from 0.0 to 1.0.

| Signal | File | Formula |
|--------|------|---------|
| Coverage | `src/detection/coverage.js` | `min(unique_normalized_routes / COVERAGE_THRESHOLD, 1.0)` |
| Enumeration | `src/detection/enumeration.js` | `min(max_unique_ids_per_route / ENUM_THRESHOLD, 1.0)` |
| Error adaptation | `src/detection/errorAdaptation.js` | `adapted_pairs / max(total_404s, 1)` |
| Traversal | `src/detection/traversal.js` | `min(repeated_chains / TRAVERSAL_THRESHOLD, 1.0)` |
| Timing regularity | `src/detection/timing.js` | `1.0 - min(coefficient_of_variation / CV_THRESHOLD, 1.0)` |
| Method uniformity | `src/detection/methodUniformity.js` | `get_count / total_requests` (only suspicious if > 0.95) |

## Pressure score and escalation

```
pressure = (coverage * 0.20) + (enumeration * 0.25) + (errorAdaptation * 0.20)
         + (traversal * 0.15) + (timing * 0.10) + (methodUniformity * 0.10)

Level 0 (0.0–0.3): Transparent forwarding
Level 1 (0.3–0.5): Latency injection (50–200ms random)
Level 2 (0.5–0.7): Targeted throttling on enumeration-heavy routes
Level 3 (0.7–0.9): Structural poisoning (decoy injection, reordering, field mutation)
Level 4 (0.9–1.0): Containment (heavy throttling or block)
```

## Config defaults (src/config.js)

```
WINDOW_SIZE_MS: 300000        (5 minutes)
COVERAGE_THRESHOLD: 8         (8 unique routes = score 1.0)
ENUM_THRESHOLD: 20            (20 unique IDs on one route = score 1.0)
TRAVERSAL_THRESHOLD: 5        (5 repeated chains = score 1.0)
CV_THRESHOLD: 0.5             (coefficient of variation)
WEIGHTS: [0.20, 0.25, 0.20, 0.15, 0.10, 0.10]
LEVEL_THRESHOLDS: [0.3, 0.5, 0.7, 0.9]
PROXY_PORT: 3000
API_PORT: 4000
```

## Demo API schema

### Resources
- `GET /users` — list all users (paginated)
- `GET /users/:id` — single user
- `GET /users/:id/orders` — user's orders
- `GET /users/:id/profile` — user's extended profile (email, phone, address)
- `GET /orders/:id` — single order
- `GET /orders/:id/items` — items in an order
- `GET /items/:id` — single item
- `POST /auth/login` — returns a session token

### Data volume
- 200 users (IDs 1–200)
- ~800 orders (2–6 per user)
- ~2400 items (2–4 per order)
- Each user has a profile with email, phone, address

## Git conventions

- Commit messages: `feat: add coverage signal` / `test: add enumeration edge cases` / `fix: sliding window eviction bug`
- Branch per phase: `phase-1-api-proxy`, `phase-2-detection`, etc.
- Merge to main only when phase tests pass

## What NOT to do

- Don't install unnecessary dependencies. This project should have minimal deps.
- Don't build a React frontend. The dashboard is simple HTML + vanilla JS reading log files.
- Don't use TypeScript for the MVP. Plain JS with JSDoc is faster to iterate.
- Don't optimize prematurely. Get it working first, profile later.
- Don't add ML. The MVP is rules-based and explainable. ML comes after the paper.
