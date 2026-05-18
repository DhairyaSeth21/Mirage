# Phase 2 spec: Client tracking + detection engine

## Goal
Build the client identification system, sliding-window state tracker, all 6 detection signals, and the pressure score calculator. By the end of this phase, every request through the proxy should produce a pressure score and escalation level in the logs.

## Task 1: Route normalizer

Create `src/detection/routeNormalizer.js`.

### What it does
- Takes a raw path like `/users/42/orders` and returns:
  - `normalizedRoute`: `/users/:id/orders`
  - `extractedIds`: `[42]`
- Handles nested IDs: `/users/42/orders/7/items` → `/users/:id/orders/:id/items`, IDs: `[42, 7]`
- Treats any purely numeric path segment as an ID
- Treats UUID-format segments as IDs too (regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-/`)

### Tests (write FIRST)
- `/users` → route: `/users`, ids: `[]`
- `/users/42` → route: `/users/:id`, ids: `[42]`
- `/users/42/orders` → route: `/users/:id/orders`, ids: `[42]`
- `/users/42/orders/7/items` → route: `/users/:id/orders/:id/items`, ids: `[42, 7]`
- `/items/100` → route: `/items/:id`, ids: `[100]`
- `/auth/login` → route: `/auth/login`, ids: `[]`

## Task 2: Client identifier

Create `src/tracking/identifier.js`.

### What it does
- Takes a request object (or its headers + IP)
- Returns a composite fingerprint string: hash of `ip + userAgent + acceptLanguage + acceptEncoding`
- Use a simple hash (e.g., a fast string hash or crypto.createHash('sha256').update(...).digest('hex').slice(0,16))
- Same client = same fingerprint across requests

### Tests
- Same IP + same headers → same fingerprint
- Different IP + same headers → different fingerprint
- Same IP + different User-Agent → different fingerprint
- Missing headers don't crash (use empty string defaults)

## Task 3: Sliding-window state tracker

Create `src/tracking/tracker.js`.

### What it does
- Maintains an in-memory Map: `clientId → clientState`
- `clientState` shape:
```js
{
  clientId: string,
  requests: [
    { timestamp, method, path, normalizedRoute, extractedIds, responseStatus }
  ],
  firstSeen: timestamp,
  lastSeen: timestamp,
}
```
- `addRequest(clientId, requestData)` — appends to the client's request array and evicts entries older than WINDOW_SIZE_MS
- `getState(clientId)` — returns the client's current state (or null if not tracked)
- `computeMetrics(clientId)` — returns derived metrics from the current window:
```js
{
  totalRequests: number,
  uniqueRoutes: Set<string>,
  idsPerRoute: Map<string, Set<number>>,
  statusCodes: number[],
  intervals: number[],        // ms between consecutive requests
  methodCounts: { GET: n, POST: n, ... },
}
```
- Window eviction runs on every `addRequest` call — remove entries where `now - timestamp > WINDOW_SIZE_MS`

### Tests
- addRequest stores the request and it appears in getState
- Requests older than WINDOW_SIZE_MS are evicted
- computeMetrics correctly counts unique routes
- computeMetrics correctly groups IDs per route
- computeMetrics correctly computes intervals between requests
- computeMetrics returns correct method counts
- getState returns null for unknown client
- Multiple clients are tracked independently

## Task 4: Detection signals (6 files)

Each signal is a pure function: takes `metrics` (from computeMetrics), returns a number 0.0–1.0.
Import thresholds from `src/config.js`.

### 4a: Coverage signal — `src/detection/coverage.js`
```js
export function computeCoverage(metrics) {
  return Math.min(metrics.uniqueRoutes.size / config.COVERAGE_THRESHOLD, 1.0);
}
```
Tests:
- 2 unique routes → score ~0.25 (well below suspicious)
- 8+ unique routes → score 1.0
- 0 routes → score 0.0

### 4b: Enumeration signal — `src/detection/enumeration.js`
```js
export function computeEnumeration(metrics) {
  let maxIds = 0;
  for (const ids of metrics.idsPerRoute.values()) {
    maxIds = Math.max(maxIds, ids.size);
  }
  return Math.min(maxIds / config.ENUM_THRESHOLD, 1.0);
}
```
Tests:
- 3 unique IDs on one route → score 0.15
- 20+ unique IDs on one route → score 1.0
- No IDs at all → score 0.0
- Multiple routes, only one with high ID count → score reflects the max

### 4c: Error adaptation signal — `src/detection/errorAdaptation.js`

Logic: look at pairs of consecutive requests where the first got a 404. If the second request has a *different* ID that narrows the search range, count it as "adapted."

```js
export function computeErrorAdaptation(metrics) {
  const requests = metrics.requests; // need the raw request list for this
  let totalErrors = 0;
  let adaptedPairs = 0;
  
  for (let i = 0; i < requests.length - 1; i++) {
    if (requests[i].responseStatus === 404) {
      totalErrors++;
      const currentId = requests[i].extractedIds[0];
      const nextId = requests[i + 1].extractedIds[0];
      if (currentId !== undefined && nextId !== undefined && nextId !== currentId) {
        // Check if the next ID is "between" previous attempts (binary search behavior)
        adaptedPairs++;
      }
    }
  }
  
  return totalErrors === 0 ? 0 : adaptedPairs / totalErrors;
}
```

Note: `computeMetrics` needs to also include the raw `requests` array for this signal. Update the tracker accordingly.

Tests:
- No 404s → score 0.0
- 404 at ID 100, next request at ID 50 → adapted (score > 0)
- 404 at ID 100, next request at same ID 100 (retry) → not adapted
- Sequence mimicking binary search: [100→404, 50→200, 75→404, 62→200] → high score
- Normal browsing with occasional 404s followed by unrelated requests → low score

### 4d: Traversal signal — `src/detection/traversal.js`

Logic: find cases where the same base ID appears in multiple sub-resource routes. E.g., requests to `/users/1`, `/users/1/orders`, `/users/1/profile` = a traversal chain of depth 3 for ID 1. Count how many IDs have chains of depth 2+.

Tests:
- Single request to `/users/1` → score 0.0 (no sub-resource traversal)
- Requests to `/users/1` + `/users/1/orders` + `/users/1/profile` → chain for ID 1
- Same pattern for 5+ different IDs → score 1.0
- Normal user accessing only their own ID with sub-resources → score 0.2

### 4e: Timing regularity signal — `src/detection/timing.js`

Logic: compute coefficient of variation (std_dev / mean) of request intervals. Low CV = machine-like. High CV = human-like. Invert so that low CV → high suspicion score.

Tests:
- Intervals [120, 118, 122, 119, 121] (CV ≈ 0.013) → score ~0.97 (very suspicious)
- Intervals [50, 2000, 300, 5000, 100] (CV ≈ 1.2) → score 0.0 (human-like)
- Single request (no intervals) → score 0.0
- Two requests → one interval, still computable

### 4f: Method uniformity signal — `src/detection/methodUniformity.js`

Logic: fraction of GET requests out of total.

Tests:
- 100% GET → score 1.0
- 70% GET, 30% POST → score 0.7
- 50% GET, 50% POST → score 0.5
- No requests → score 0.0

## Task 5: Pressure score calculator

Create `src/detection/pressure.js`.

### What it does
- Takes `metrics` (from computeMetrics)
- Computes all 6 signals
- Returns:
```js
{
  signals: {
    coverage: 0.75,
    enumeration: 0.90,
    errorAdaptation: 0.60,
    traversal: 0.40,
    timing: 0.85,
    methodUniformity: 1.0,
  },
  pressure: 0.77,   // weighted sum
  level: 3,          // based on LEVEL_THRESHOLDS
}
```

### Tests
- All signals at 0 → pressure 0, level 0
- All signals at 1 → pressure 1, level 4
- Signals matching a "normal user" pattern → level 0 or 1
- Signals matching an "attacker" pattern → level 3 or 4
- Weights sum to 1.0 (validate from config)

## Task 6: Wire detection into the proxy

Update `src/proxy/server.js` to:
1. On each request, call `identifier.getFingerprint(req)`
2. After receiving upstream response, call `tracker.addRequest(clientId, { ...requestData, responseStatus })`
3. Call `tracker.computeMetrics(clientId)`
4. Call `pressure.computePressure(metrics)`
5. Include pressure score and level in the log entry

The proxy still forwards everything transparently — no response modification yet (that's Phase 3). But every request now gets scored.

### Tests
- Send 5 normal-looking requests through proxy → log entries show low pressure scores
- Send 30 sequential GET /users/1 through /users/30 through proxy → log entries show high enumeration score

## Done criteria
- `npm test` passes all tests (Phase 1 tests still pass + all new Phase 2 tests)
- Proxy logs include `pressure`, `level`, and `signals` fields
- A manual test: `curl localhost:3000/users/1` through `/users/30` in quick succession shows escalating pressure scores in the logs
