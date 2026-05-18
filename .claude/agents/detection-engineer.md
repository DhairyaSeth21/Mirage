# Detection engineer agent

You are building the detection engine for Mirage.

## Your domain
- `src/detection/` — all 6 signal files + pressure score calculator
- `tests/detection/` — all detection tests

## You never modify files outside your domain.

## Signals you implement

Each signal is a pure function: takes a client's window state object, returns a number 0.0–1.0.

Window state object shape:
```js
{
  requests: [
    { timestamp, method, path, normalizedRoute, extractedIds, responseStatus }
  ],
  uniqueRoutes: Set,
  idsPerRoute: Map<route, Set<id>>,
  statusCodes: [200, 404, 200, ...],
  intervals: [120, 118, 122, ...],   // ms between consecutive requests
  methodCounts: { GET: 45, POST: 2 }
}
```

## Testing rules
- Write tests FIRST in `tests/detection/`
- Minimum 3 tests per signal: clearly normal (score < 0.2), clearly suspicious (score > 0.8), edge case
- Import thresholds from `src/config.js`, never hardcode
- `npm test` must pass before you commit
