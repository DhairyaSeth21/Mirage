# Phase 4 spec: Traffic generators + dataset creation

## Goal
Build normal user simulators and three attacker bots of increasing sophistication. Run them against the Mirage proxy to generate a labeled dataset of 10,000+ request sequences. All previous tests must still pass.

## Task 1: Normal user traffic simulator

Create `scripts/traffic/normalUser.js`.

### What it does
Simulates realistic human API usage. Each simulated user:
- Logs in via POST /auth/login
- Views their own profile (GET /users/:ownId/profile)
- Checks their own orders (GET /users/:ownId/orders)
- Maybe clicks into one or two specific orders (GET /orders/:id/items)
- Maybe browses a few products (GET /items/:id)
- Has VARIABLE timing between requests: gaps of 1–15 seconds, with occasional long pauses (20–60s, simulating reading)
- Uses a mix of methods (mostly GET, occasional POST)
- Accesses a NARROW scope: only their own data plus a few random items
- Session lasts 1–10 minutes
- Sends realistic headers (User-Agent from a list of real browsers, Accept, etc.)

### Parameters
```js
normalUser({
  baseUrl: 'http://localhost:3000',
  userId: 42,           // which user they "are"
  sessionDuration: 300,  // seconds (randomized per profile)
  verbose: false,        // log each request to console
})
```

### Output
Each request is logged to a JSONL file with:
```json
{
  "session_id": "normal_001",
  "client_type": "normal",
  "timestamp": "...",
  "method": "GET",
  "path": "/users/42/orders",
  "status": 200,
  "latency_ms": 45
}
```

### Tests
- Simulator only accesses its own userId's resources (not other users)
- Request intervals have high coefficient of variation (CV > 0.5)
- Method distribution includes at least one non-GET request
- Session produces between 5 and 50 requests (realistic range)

## Task 2: Model A — Naive sequential enumerator

Create `scripts/traffic/attackerModelA.js`.

### Behavior
The dumbest bot. It:
- Sweeps GET /users/1, /users/2, /users/3 ... /users/200 sequentially
- Fixed interval between requests (100–150ms)
- 100% GET requests
- No error adaptation — when it hits a 404, it keeps incrementing
- No traversal — only hits /users/:id, never explores sub-resources
- Single User-Agent: "python-requests/2.28.0"
- No authentication

### Parameters
```js
attackerModelA({
  baseUrl: 'http://localhost:3000',
  startId: 1,
  endId: 200,
  intervalMs: 120,
  verbose: false,
})
```

### Output
Same JSONL format with `"client_type": "model_a"`

### Tests
- All requests are GET
- Paths follow sequential pattern
- Intervals are nearly uniform (CV < 0.1)
- Hits at least 100 unique IDs

## Task 3: Model B — Adaptive binary-search scraper

Create `scripts/traffic/attackerModelB.js`.

### Behavior
A smarter bot that:
- Starts with GET /users to discover the list endpoint exists
- Uses binary search to find the max valid user ID (tries /users/200, gets 404 or 200, narrows)
- Once boundary is found, sweeps all valid IDs
- After getting a user, explores sub-resources: /users/:id/orders, /users/:id/profile
- Adapts to 404s: if an ID returns 404, it adjusts its range
- Randomized but LOW-variance timing (80–200ms, CV ≈ 0.2)
- User-Agent: "Go-http-client/1.1"
- No authentication

### Phases
1. Discovery: GET /users (learn the list exists)
2. Boundary: binary search on /users/:id to find max valid ID
3. Extraction: sweep all valid IDs
4. Traversal: for each valid user, hit /orders and /profile

### Parameters
```js
attackerModelB({
  baseUrl: 'http://localhost:3000',
  maxProbeId: 500,    // upper bound for binary search
  verbose: false,
})
```

### Output
Same JSONL format with `"client_type": "model_b"`

### Tests
- First request is to /users (discovery)
- Binary search pattern: 404 followed by narrowed ID range
- Eventually hits sub-resources (/users/:id/orders, /users/:id/profile)
- Timing variance is low but not zero (CV between 0.1 and 0.3)
- Total unique routes touched > 3 (coverage signal should fire)

## Task 4: Model C — Graph-walking traversal bot

Create `scripts/traffic/attackerModelC.js`.

### Behavior
The most sophisticated bot. It:
- Starts at GET /users to discover user IDs
- For each discovered user, follows the resource graph: user → orders → items
- Completes the full chain for one user before moving to the next
- Has HIGHER timing variance than Model B (200–2000ms, CV ≈ 0.5) — tries to mimic human browsing
- Uses a realistic browser User-Agent
- Sends realistic Accept and Accept-Language headers
- Adapts to 404s by skipping and moving on
- Does NOT do binary search — it works through the list page by page

### Traversal pattern for each user
```
GET /users?page=1                   (discover user IDs)
GET /users/1                        (get user details)
GET /users/1/profile                (get profile)
GET /users/1/orders                 (get orders)
GET /orders/{first_order_id}/items  (get items for first order)
... repeat for user 2, 3, etc.
```

### Parameters
```js
attackerModelC({
  baseUrl: 'http://localhost:3000',
  maxUsers: 50,        // how many users to traverse
  verbose: false,
})
```

### Output
Same JSONL format with `"client_type": "model_c"`

### Tests
- Request pattern shows user → profile → orders → items chains
- Multiple users are traversed
- Timing variance is moderate (CV between 0.3 and 0.7)
- User-Agent is a realistic browser string
- Headers include Accept and Accept-Language

## Task 5: Traffic orchestrator

Create `scripts/traffic/orchestrator.js`.

### What it does
Runs all traffic generators simultaneously to create realistic mixed traffic:
- 50 normal user sessions (different user IDs, staggered start times)
- 5 Model A sessions (different IP simulation via custom header)
- 5 Model B sessions
- 5 Model C sessions
- Staggers start times randomly over a 5-minute window so traffic overlaps naturally

### Output
A single combined JSONL file: `data/dataset.jsonl`
Each line includes the session_id, client_type, and all request details.

### Summary statistics printed at end:
```
Dataset generated:
  Total requests: 14,832
  Normal sessions: 50 (8,421 requests)
  Model A sessions: 5 (2,103 requests)
  Model B sessions: 5 (2,487 requests)
  Model C sessions: 5 (1,821 requests)
  Duration: 7m 23s
  Output: data/dataset.jsonl
```

## Task 6: Dataset export script

Create `scripts/traffic/exportDataset.js`.

### What it does
Reads the raw JSONL from the orchestrator and exports a clean labeled dataset:
- CSV format for compatibility
- Fields: timestamp, session_id, client_type, method, path, normalized_route, extracted_ids, response_status, response_size, user_agent
- Also exports a session-level summary CSV:
  - session_id, client_type, total_requests, unique_routes, max_ids_per_route, avg_interval_ms, cv_interval, pct_get, duration_s
- Both files go in `data/`

### Tests
- Export produces valid CSV with correct headers
- Every row has all required fields
- Session summary has one row per session
- client_type values are only: normal, model_a, model_b, model_c

## Running it

### Generate the dataset
```bash
npm run traffic          # runs the orchestrator
npm run export-dataset   # exports to CSV
```

### Add to package.json scripts:
```json
"traffic": "node scripts/traffic/orchestrator.js",
"export-dataset": "node scripts/traffic/exportDataset.js"
```

## Done criteria
- `npm test` passes ALL tests (Phase 1 + 2 + 3 + Phase 4)
- `npm run traffic` generates 10,000+ requests across 65 sessions
- `npm run export-dataset` produces clean CSV files in data/
- Each attacker model exhibits distinct behavioral patterns that should trigger different detection signals
- Normal user traffic should NOT trigger high pressure scores (validates false positive rate)
- data/dataset.jsonl and data/dataset.csv are gitignored (too large for repo) but data/ directory structure is documented
