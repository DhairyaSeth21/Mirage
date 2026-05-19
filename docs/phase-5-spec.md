# Phase 5 spec: Evaluation experiments + dashboard

## Goal
Run controlled experiments comparing Mirage's behavioral defense against baselines, compute the 5 research metrics from the proposal, run an ablation study on the 6 detection signals, and build a simple evaluation dashboard to visualize results. All previous tests must still pass.

## Task 1: Experiment runner framework

Create `scripts/eval/runExperiment.js`.

### What it does
A reusable framework that:
1. Starts the demo API server
2. Starts the proxy in a configurable mode (transparent, rate-limit-only, or full defense)
3. Runs a specific attacker model against the proxy
4. Collects all proxy logs
5. Computes metrics from the logs
6. Shuts everything down
7. Returns a structured results object

### Proxy modes
```js
const MODES = {
  'undefended':    { detection: false, response: false },           // transparent pass-through
  'ratelimit':     { detection: false, response: 'ratelimit-only' }, // token bucket at 100 req/min, returns 429
  'full-defense':  { detection: true,  response: true },             // Mirage fully active
};
```

For the rate-limit-only baseline, create a simple middleware in `src/response/rateLimit.js`:
- Token bucket: 100 tokens, refills at 100/min per client
- Returns 429 Too Many Requests when bucket is empty
- This is the "industry standard" baseline your system outperforms

### Parameters
```js
runExperiment({
  mode: 'full-defense',        // 'undefended' | 'ratelimit' | 'full-defense'
  attackerModel: 'model_b',    // 'model_a' | 'model_b' | 'model_c'
  outputDir: 'data/experiments/full-defense-model-b/',
})
```

### Output per experiment
- `requests.jsonl` — raw proxy logs for every request
- `metrics.json` — computed metrics (see Task 2)
- `summary.txt` — human-readable summary

### Tests
- Experiment runner starts and stops servers cleanly
- Undefended mode produces logs with no modifications
- Full defense mode produces logs with modifications at high pressure
- Rate limit mode produces 429 responses when threshold exceeded

## Task 2: Metrics calculator

Create `scripts/eval/computeMetrics.js`.

### What it computes from experiment logs

**Metric 1: Attack success rate (extraction accuracy)**
```js
// Count requests where the attacker got REAL data (not poisoned)
const realDataResponses = logs.filter(l => 
  l.client_type !== 'normal' && 
  l.sent_status === 200 && 
  !l.response_modified
);
const totalAttackerRequests = logs.filter(l => 
  l.client_type !== 'normal' && 
  l.sent_status === 200
);
const extractionAccuracy = realDataResponses.length / totalAttackerRequests.length;
// Target: reduce by 70-90% vs undefended
```

**Metric 2: Time to map**
```js
// How long until the attacker has hit 80% of all real routes?
const allRealRoutes = new Set(/* from the API schema */);
let coverageTimestamp = null;
const seenRoutes = new Set();
for (const log of attackerLogs) {
  seenRoutes.add(log.normalizedRoute);
  if (seenRoutes.size >= allRealRoutes.size * 0.8) {
    coverageTimestamp = log.timestamp;
    break;
  }
}
const timeToMap = coverageTimestamp - attackerLogs[0].timestamp;
// Target: 5-10x increase vs undefended
```

**Metric 3: Request cost**
```js
// Total requests the attacker needed
const requestCost = attackerLogs.length;
// Target: 10-20x increase vs undefended
```

**Metric 4: Decoy interaction rate**
```js
// What fraction of attacker requests were for decoy resources?
const decoyRequests = attackerLogs.filter(l => 
  l.modifications && l.modifications.includes('decoy_injection')
);
const decoyRate = decoyRequests.length / attackerLogs.length;
// Target: 20-40%
```

**Metric 5: False positive rate**
```js
// Run normal user traffic and check how many got modified responses
const normalLogs = logs.filter(l => l.client_type === 'normal');
const modifiedNormal = normalLogs.filter(l => l.response_modified);
const falsePositiveRate = modifiedNormal.length / normalLogs.length;
// Target: below 1%
```

### Output format
```json
{
  "mode": "full-defense",
  "attacker_model": "model_b",
  "extraction_accuracy": 0.23,
  "time_to_map_ms": 184000,
  "request_cost": 847,
  "decoy_interaction_rate": 0.31,
  "false_positive_rate": 0.0,
  "total_attacker_requests": 847,
  "total_normal_requests": 412,
  "max_pressure_score": 0.91,
  "avg_pressure_score": 0.67,
  "level_distribution": { "0": 12, "1": 45, "2": 189, "3": 580, "4": 21 }
}
```

### Tests
- Metrics calculator produces all required fields
- Extraction accuracy is 1.0 when no responses are modified (undefended)
- Extraction accuracy is < 1.0 when responses are modified
- False positive rate is 0.0 when no normal traffic is modified

## Task 3: Run the full experiment suite

Create `scripts/eval/runAll.js`.

### What it does
Runs 9 experiments (3 modes × 3 attacker models) plus a false-positive-only run:

```
Experiment matrix:
┌──────────────┬──────────┬──────────┬──────────┐
│              │ Model A  │ Model B  │ Model C  │
├──────────────┼──────────┼──────────┼──────────┤
│ Undefended   │ run 1    │ run 2    │ run 3    │
│ Rate-limit   │ run 4    │ run 5    │ run 6    │
│ Full defense │ run 7    │ run 8    │ run 9    │
└──────────────┴──────────┴──────────┴──────────┘

+ Run 10: Normal traffic only (full defense) → false positive measurement
```

Each run also includes 5 normal user sessions as background traffic.

### Output
- `data/experiments/` directory with subdirectories per run
- `data/experiments/comparison.json` — all 10 runs' metrics in one file
- `data/experiments/comparison.csv` — same data in CSV for easy import

### Console output during run
```
Running experiment suite...
[1/10] undefended + model_a ... done (14s, 423 requests)
[2/10] undefended + model_b ... done (18s, 612 requests)
...
[10/10] full-defense + normal-only ... done (22s, 187 requests)

Results saved to data/experiments/
```

## Task 4: Ablation study

Create `scripts/eval/ablation.js`.

### What it does
Tests the contribution of each detection signal by disabling them one at a time:

```
For each signal in [coverage, enumeration, errorAdaptation, traversal, timing, methodUniformity]:
  1. Set that signal's weight to 0 in config
  2. Re-normalize remaining weights to sum to 1.0
  3. Run full-defense experiment against Model B (the adaptive scraper)
  4. Compute metrics
  5. Restore weights
  
Also run with ALL signals enabled as the control.
```

### Output
```json
{
  "control": { "extraction_accuracy": 0.23, ... },
  "without_coverage": { "extraction_accuracy": 0.31, ... },
  "without_enumeration": { "extraction_accuracy": 0.45, ... },
  "without_errorAdaptation": { "extraction_accuracy": 0.28, ... },
  "without_traversal": { "extraction_accuracy": 0.25, ... },
  "without_timing": { "extraction_accuracy": 0.24, ... },
  "without_methodUniformity": { "extraction_accuracy": 0.23, ... }
}
```

This tells you which signals matter most. If removing enumeration causes a big accuracy jump, that signal is critical. If removing methodUniformity changes nothing, it's less important.

### Tests
- Ablation runs all 7 configurations (control + 6 signal removals)
- Each configuration produces valid metrics
- Weights are restored to original values after each run

## Task 5: Evaluation dashboard

Create `scripts/eval/dashboard.js` — a simple HTTP server that serves a single HTML page.

### What it shows
A web page at `http://localhost:5000` that reads from `data/experiments/comparison.json` and displays:

**Section 1: Comparison table**
- 3×3 grid showing extraction accuracy for each mode × attacker model combination
- Color-coded: green for low accuracy (defense working), red for high accuracy (defense failing)

**Section 2: Bar charts**
- Extraction accuracy by mode (grouped by attacker model)
- Time to map comparison
- Request cost comparison

**Section 3: Ablation results**
- Bar chart showing extraction accuracy for each "signal removed" configuration
- Highlights which signal's removal causes the biggest accuracy increase

**Section 4: False positive rate**
- Single number showing the false positive rate from Run 10
- Green if < 1%, yellow if 1-5%, red if > 5%

### Implementation
- Single HTML file served by a minimal Express server
- Use Chart.js (CDN) for charts
- Read JSON data files on server start
- No build step, no React, no complexity

### Tests
- Dashboard server starts and returns 200 on /
- /api/comparison returns valid JSON
- /api/ablation returns valid JSON

## Task 6: npm scripts

Add to package.json:
```json
"eval": "node scripts/eval/runAll.js",
"eval:single": "node scripts/eval/runExperiment.js",
"ablation": "node scripts/eval/ablation.js",
"dashboard": "node scripts/eval/dashboard.js"
```

## Running the full evaluation

```bash
npm run eval          # Run all 10 experiments (~5-10 minutes)
npm run ablation      # Run ablation study (~5 minutes)
npm run dashboard     # Start dashboard at localhost:5000
```

## Done criteria
- `npm test` passes ALL tests (Phase 1-4 + Phase 5)
- `npm run eval` runs all 10 experiments and produces comparison.json
- `npm run ablation` produces ablation results
- `npm run dashboard` serves a readable evaluation dashboard
- The numbers tell a clear story: full defense significantly outperforms baselines
- Rate limit baseline catches Model A but misses Model B and C
- Full defense catches all three models
- Ablation shows which signals are most discriminative
- False positive rate is below 1%
