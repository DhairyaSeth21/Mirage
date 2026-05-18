# Phase 3 spec: Response modifier + decoy generator

## Goal
Build the response modification engine that alters API responses based on the client's escalation level. By the end of this phase, Mirage actively disrupts attackers: injecting latency, throttling enumeration routes, poisoning data with decoys, and embedding attribution markers. All Phase 1 + Phase 2 tests must still pass.

## Task 1: Level 1 — Latency injection

Create `src/response/latency.js`.

### What it does
- Takes the current escalation level and returns a delay in milliseconds
- Level 0: 0ms (no delay)
- Level 1: random between LATENCY_MIN_MS and LATENCY_MAX_MS (default 50–200ms)
- Level 2+: also applies (stacks with other responses)
- The delay should feel like natural network jitter, not a fixed pause — use random values

### Implementation
```js
export function computeLatency(level) {
  if (level < 1) return 0;
  const { LATENCY_MIN_MS, LATENCY_MAX_MS } = config;
  return LATENCY_MIN_MS + Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS);
}
```

The proxy applies this delay using `setTimeout` before sending the response to the client.

### Tests
- Level 0 → 0ms delay
- Level 1 → delay between 50 and 200ms
- Level 3 → still returns a delay (latency applies at all elevated levels)
- Multiple calls produce different values (randomness check)

## Task 2: Level 2 — Targeted throttling

Create `src/response/throttle.js`.

### What it does
- At Level 2+, apply EXTRA delay specifically on routes the client is enumerating heavily
- Takes the client's metrics and the current request's normalized route
- If this route has the highest ID count in the client's window, add THROTTLE_DELAY_MS (default 1000ms) on top of the Level 1 latency
- Other routes from the same client flow at Level 1 speed

### Logic
```js
export function computeThrottle(level, metrics, currentRoute) {
  if (level < 2) return 0;
  // Find the route with the most enumerated IDs
  let maxRoute = null;
  let maxCount = 0;
  for (const [route, ids] of metrics.idsPerRoute.entries()) {
    if (ids.size > maxCount) {
      maxCount = ids.size;
      maxRoute = route;
    }
  }
  // Only throttle the hot route
  if (currentRoute === maxRoute && maxCount > 5) {
    return config.THROTTLE_DELAY_MS;
  }
  return 0;
}
```

### Tests
- Level 0 or 1 → 0ms throttle regardless of route
- Level 2, request on the most-enumerated route → THROTTLE_DELAY_MS
- Level 2, request on a different route → 0ms throttle
- Route with only 3 IDs → not throttled (threshold is 5)

## Task 3: Decoy data generator

Create `src/response/decoyGenerator.js`.

### What it does
- Generates plausible fake records that match the schema of real data
- Must be DETERMINISTIC per decoy ID: decoy user 201 always returns the same fake name, email, etc. This prevents the attacker from detecting inconsistency by requesting the same ID twice.
- Use a seeded random number generator (seed = decoy ID) for deterministic output

### Functions needed
```js
export function generateDecoyUser(decoyId)
// Returns: { id: decoyId, name: "...", email: "...", createdAt: "..." }

export function generateDecoyOrder(decoyId, userId)
// Returns: { id: decoyId, userId, total: ..., status: "...", createdAt: "..." }

export function generateDecoyItem(decoyId, orderId)
// Returns: { id: decoyId, orderId, name: "...", price: ..., quantity: ... }

export function generateDecoyProfile(userId)
// Returns: { userId, email: "...", phone: "...", address: "...", bio: "..." }
```

### Data quality requirements
- Names should come from realistic name arrays (same approach as the seed script)
- Emails follow the same pattern as real data: firstname.lastname@domain.com
- Phone numbers look real (555-XXX-XXXX format)
- Order totals in the same range as real orders ($10–$500)
- Product names from a realistic product name list
- Timestamps within the same range as real data

### Tests
- generateDecoyUser returns all required fields
- Same decoyId always produces identical output (deterministic)
- Different decoyIds produce different output
- Generated emails follow realistic format
- Generated order totals are within expected range

## Task 4: Level 3 — Structural poisoning

Create `src/response/poison.js`.

### What it does
This is the core of Mirage. At Level 3, the response modifier intercepts the real API response and alters it before sending to the client. Four types of modification:

#### 4a: Decoy injection into list responses
When the real API returns a list (e.g., GET /users returns 20 users), inject fake records:
- Calculate how many decoys: `Math.ceil(realCount * DECOY_INJECT_RATIO)` (default 15%)
- Generate decoy records using the decoy generator
- Insert them at random positions in the list (not all at the end — that's detectable)
- Decoy IDs should be outside the real ID range (e.g., if real IDs go up to 200, decoys start at 1001)

#### 4b: List reordering
Shuffle the order of items in list responses. If the real API returns users sorted by ID, the poisoned response has them in random order. This breaks position-based assumptions.

#### 4c: Field mutation
For individual record responses (e.g., GET /users/42), selectively modify non-critical fields:
- Swap the email domain (alice@company.com → alice@fakecorp.com)
- Alter phone numbers by changing 2 digits
- Modify the bio text slightly
- Do NOT mutate IDs, names, or structural fields — those would be too obvious

#### 4d: Status code manipulation
- When the real API returns 404 for a resource, sometimes (50% probability at Level 3) return 200 with a decoy record instead. This corrupts the attacker's boundary mapping.
- When the real API returns 200, occasionally (10% probability) return 404. This creates false boundaries.

### Implementation
```js
export function poisonResponse(level, requestInfo, realResponse, metrics) {
  if (level < 3) return realResponse;
  
  const body = JSON.parse(realResponse.body);
  let modified = { ...realResponse };
  
  // Detect response type: list vs individual
  if (body.data && Array.isArray(body.data)) {
    // List response: inject decoys + reorder
    body.data = injectDecoys(body.data, requestInfo.normalizedRoute);
    body.data = shuffleArray(body.data);
    modified.body = JSON.stringify(body);
  } else if (realResponse.status === 404) {
    // 404: sometimes return fake 200
    if (Math.random() < 0.5) {
      modified.status = 200;
      modified.body = JSON.stringify(generateDecoyForRoute(requestInfo));
    }
  } else if (typeof body === 'object' && body.id) {
    // Individual record: mutate fields
    modified.body = JSON.stringify(mutateFields(body));
  }
  
  return modified;
}
```

### Tests
- Level 0/1/2 → response passes through unchanged
- Level 3, list response → response contains extra records (decoys)
- Level 3, list response → order is different from original
- Level 3, individual record → email/phone fields are modified
- Level 3, individual record → id and name fields are NOT modified
- Level 3, 404 response → sometimes becomes 200 with fake data
- Decoy records have the same field structure as real records
- Injected decoys have IDs outside the real range

## Task 5: Deception-assisted attribution markers

Create `src/response/attribution.js`.

### What it does
At Level 3+, embed session-specific unique markers in poisoned responses. These are invisible "watermarks" in the data that let you trace leaked data back to the exact session that extracted it.

### Marker types
- **Unique field values**: add a plausible-looking but unique field value. E.g., a "dept" field with value "eng-7x3k" where "7x3k" is derived from the session ID.
- **Canary records**: specific decoy records with marker IDs that are logged. If decoy user 1042 shows up in a leaked database, you check the log: "user 1042 was only served to session abc123 on May 18 at 2:47 PM."

### Implementation
```js
export function generateMarker(sessionId) {
  // Create a short, unique, deterministic marker from the session ID
  const hash = crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 4);
  return `mrk_${hash}`;
}

export function embedMarker(responseBody, marker) {
  // Add marker as a plausible optional field
  if (typeof responseBody === 'object' && responseBody.id) {
    responseBody._ref = marker;  // looks like an internal reference field
  }
  return responseBody;
}
```

### Logging
Every time a marker is embedded, log:
```json
{
  "event": "attribution_marker",
  "marker": "mrk_7x3k",
  "sessionId": "abc123",
  "clientId": "fingerprint...",
  "path": "/users/42",
  "timestamp": "..."
}
```

### Tests
- Same sessionId always produces same marker (deterministic)
- Different sessionIds produce different markers
- embedMarker adds the _ref field without removing existing fields
- Marker format matches expected pattern (mrk_XXXX)

## Task 6: Wire response modification into the proxy

Update `src/proxy/server.js` to:

1. After receiving upstream response, check the client's escalation level
2. Compute total delay: `computeLatency(level) + computeThrottle(level, metrics, route)`
3. If level >= 3, run `poisonResponse()` on the response body
4. If level >= 3, run `embedMarker()` on the response body
5. Apply the delay via setTimeout
6. Send the (possibly modified) response to the client
7. Log everything: original status, sent status, modifications made, markers embedded, delay added

### Updated log entry shape
```json
{
  "timestamp": "...",
  "clientId": "...",
  "method": "GET",
  "path": "/users/42",
  "normalizedRoute": "/users/:id",
  "pressure": 0.87,
  "level": 3,
  "signals": { ... },
  "upstream_status": 200,
  "sent_status": 200,
  "response_modified": true,
  "modifications": ["field_mutation", "marker_embedded"],
  "marker": "mrk_7x3k",
  "latency_added_ms": 163,
  "total_latency_ms": 185
}
```

### Tests
- Level 0 request → response body identical to upstream, no delay
- Level 1 request → response body identical, delay present in log
- Level 3 request to list endpoint → response contains decoys, log shows modifications
- Level 3 request to individual endpoint → fields mutated, marker embedded
- All Phase 1 and Phase 2 tests still pass

## Done criteria
- `npm test` passes ALL tests (Phase 1 + Phase 2 + Phase 3)
- Proxy applies latency at Level 1+
- Proxy throttles enumeration-heavy routes at Level 2+
- Proxy poisons responses at Level 3+ (decoy injection, reordering, field mutation, status manipulation)
- Proxy embeds attribution markers at Level 3+
- All modifications are logged with full detail
- Manual test: rapid sequential `curl localhost:3000/users/1` through `/users/50` shows:
  - Early requests: fast, clean responses
  - Mid requests: slight delays appear
  - Late requests: responses contain modified data, decoy IDs, mutated fields
