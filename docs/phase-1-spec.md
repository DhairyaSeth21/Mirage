# Phase 1 spec: Demo API + basic proxy

## Goal
Build a working demo REST API and a transparent reverse proxy in front of it. By the end of this phase, requests to localhost:3000 should be forwarded to the API at localhost:4000 and responses returned to the client. No detection or modification yet — just prove the proxy pipeline works.

## Task 1: Demo API

Build an Express.js REST API at src/api/server.js.

### Database
- SQLite via better-sqlite3
- Database file: data/mirage.db
- Create a seed script at src/api/seed/seedDatabase.js that:
  - Creates tables: users, profiles, orders, items
  - Inserts 200 users with realistic fake names and emails (generate them, don't use a library like faker — just arrays of first/last names)
  - Inserts a profile for each user (phone, address, bio)
  - Inserts 2–6 orders per user (random total between $10–$500, status: pending/shipped/delivered)
  - Inserts 2–4 items per order (product name, price, quantity)
  - IDs are sequential integers starting at 1

### Endpoints
All return JSON. Use proper HTTP status codes.

```
GET /users              → { data: [...], page, totalPages, total }
GET /users/:id          → { id, name, email, createdAt } or 404
GET /users/:id/orders   → { data: [...] } or 404 if user doesn't exist
GET /users/:id/profile  → { userId, email, phone, address, bio } or 404
GET /orders/:id         → { id, userId, total, status, createdAt } or 404
GET /orders/:id/items   → { data: [...] } or 404 if order doesn't exist
GET /items/:id          → { id, orderId, name, price, quantity } or 404
POST /auth/login        → accepts { username, password }, returns { token: <uuid> }
```

### Tests (write these FIRST)
- Test each endpoint returns 200 with correct shape
- Test 404 for nonexistent IDs
- Test pagination on /users (page=1, page=2)
- Test /users/:id/orders returns only that user's orders

## Task 2: Transparent proxy

Build a reverse proxy at src/proxy/server.js.

### What it does
- Listens on port 3000
- Forwards ALL requests to localhost:4000
- Returns the response from the API unchanged
- Logs each request to console as JSON: { timestamp, method, path, status, latencyMs }

### Implementation
- Use the http-proxy npm module
- Handle errors: if API is down, return 502

### Tests
- Proxy forwards a GET request and returns the same response as hitting the API directly
- Proxy returns 502 when upstream is unreachable
- Proxy preserves response headers and status codes

## Task 3: Structured logger (basic version)

Create src/logging/logger.js.

### What it does
- Exports a function: logRequest({ timestamp, method, path, status, latencyMs, clientIp, userAgent })
- Writes JSON lines to logs/requests.jsonl (one JSON object per line)
- Also logs to console in development mode

### Tests
- Logger creates the log file if it doesn't exist
- Logger appends a valid JSON line per call
- Logger includes all required fields

## Done criteria
- `npm run seed` creates a populated database
- `npm run api` starts the API on port 4000
- `npm run proxy` starts the proxy on port 3000
- `npm run dev` starts both
- `npm test` passes all tests
- Hitting localhost:3000/users returns the same data as localhost:4000/users
