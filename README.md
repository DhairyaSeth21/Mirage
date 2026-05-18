# Mirage

**Adaptive API defense** — detects API learning behavior and disrupts attacker models through inline adaptive deception.

## What it does

Mirage is a reverse proxy that sits between clients and your API. It watches behavioral patterns across request sequences to detect when a client is systematically mapping your API structure. Instead of blocking detected attackers (which reveals detection), Mirage graduates its response from latency injection through structural data poisoning — corrupting the attacker's learned model without them knowing.

## Quick start

```bash
npm install
npm run seed    # Create and populate the demo database
npm run dev     # Start both the API server and the proxy
```

- Proxy listens on `http://localhost:3000`
- API server listens on `http://localhost:4000`

All traffic through port 3000 is analyzed and potentially modified. Direct traffic to port 4000 bypasses Mirage.

## Architecture

```
Client → [Mirage Proxy :3000] → [Demo API :4000] → [SQLite DB]
              ↓
    [Client Tracker] → [Detection Engine] → [Response Modifier]
              ↓
       [Structured Logger]
```

## Detection signals

| Signal | What it detects |
|--------|----------------|
| Coverage | Client touching many different endpoint patterns |
| Enumeration | Client sweeping through IDs on a single endpoint |
| Error adaptation | Client adjusting behavior based on 404 responses |
| Traversal | Client following resource relationships systematically |
| Timing regularity | Machine-like request spacing (low variance) |
| Method uniformity | Pure GET traffic (read-only = scraping) |

## Response levels

| Level | Trigger | Response |
|-------|---------|----------|
| 0 | Score < 0.3 | Transparent forwarding |
| 1 | Score 0.3–0.5 | Random latency injection |
| 2 | Score 0.5–0.7 | Targeted route throttling |
| 3 | Score 0.7–0.9 | Decoy injection + data poisoning |
| 4 | Score > 0.9 | Containment |

## Testing

```bash
npm test
```

## License

MIT
