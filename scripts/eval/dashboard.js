/**
 * Evaluation dashboard — minimal Express server serving a single HTML page
 * that visualises experiment results from data/experiments/.
 *
 * Run with: npm run dashboard
 * Then open: http://localhost:5000
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import { createServer } from 'node:http';
import express from 'express';

const __dirname = join(fileURLToPath(import.meta.url), '..', '..', '..');

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mirage — Evaluation Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; color: #f8fafc; }
    .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 32px; }
    h2 { font-size: 1.1rem; font-weight: 600; margin: 32px 0 16px; color: #cbd5e1; border-left: 3px solid #6366f1; padding-left: 10px; }
    .section { margin-bottom: 40px; }

    /* Comparison grid */
    .grid-3x3 { display: grid; grid-template-columns: 140px repeat(3, 1fr); gap: 4px; max-width: 700px; }
    .cell { padding: 10px 14px; border-radius: 6px; text-align: center; font-size: 0.85rem; }
    .cell.header { background: #1e293b; color: #94a3b8; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .cell.row-label { background: #1e293b; color: #94a3b8; text-align: left; font-weight: 500; }
    .val-good { background: #14532d; color: #86efac; }
    .val-mid  { background: #713f12; color: #fde68a; }
    .val-bad  { background: #7f1d1d; color: #fca5a5; }

    /* Charts */
    .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
    .chart-box { background: #1e293b; border-radius: 10px; padding: 20px; }
    .chart-box h3 { font-size: 0.9rem; font-weight: 600; color: #94a3b8; margin-bottom: 16px; }
    canvas { max-height: 220px; }

    /* FP rate */
    .fp-box { display: inline-block; padding: 16px 28px; border-radius: 10px; font-size: 1.6rem; font-weight: 700; }
    .fp-good { background: #14532d; color: #86efac; }
    .fp-mid  { background: #713f12; color: #fde68a; }
    .fp-bad  { background: #7f1d1d; color: #fca5a5; }
    .fp-label { color: #64748b; font-size: 0.8rem; margin-top: 6px; }

    .empty-state { color: #475569; font-size: 0.875rem; padding: 24px; background: #1e293b; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Mirage — Adaptive API Defense</h1>
  <p class="subtitle">Evaluation dashboard · results from <code>data/experiments/</code></p>

  <!-- Section 1: Comparison table -->
  <div class="section">
    <h2>Extraction Accuracy by Mode &amp; Attacker</h2>
    <div id="table-container"><p class="empty-state">No comparison data found. Run <code>npm run eval</code> first.</p></div>
  </div>

  <!-- Section 2: Bar charts -->
  <div class="section">
    <h2>Metric Comparison</h2>
    <div class="charts">
      <div class="chart-box"><h3>Extraction Accuracy</h3><canvas id="chart-accuracy"></canvas></div>
      <div class="chart-box"><h3>Time to Map (seconds)</h3><canvas id="chart-ttm"></canvas></div>
      <div class="chart-box"><h3>Request Cost</h3><canvas id="chart-cost"></canvas></div>
    </div>
  </div>

  <!-- Section 3: Ablation -->
  <div class="section">
    <h2>Ablation Study — Signal Importance</h2>
    <div class="charts">
      <div class="chart-box" style="grid-column:1/-1;max-width:720px">
        <h3>Extraction Accuracy When Each Signal Is Removed (higher = more damage)</h3>
        <canvas id="chart-ablation"></canvas>
      </div>
    </div>
  </div>

  <!-- Section 4: False positive rate -->
  <div class="section">
    <h2>False Positive Rate (normal users affected)</h2>
    <div id="fp-container"><p class="empty-state">No data yet.</p></div>
  </div>

<script>
const MODES    = ['undefended', 'ratelimit', 'full-defense'];
const MODELS   = ['model_a', 'model_b', 'model_c'];
const MODE_LABELS = { 'undefended': 'Undefended', 'ratelimit': 'Rate Limit', 'full-defense': 'Full Defense' };
const MODEL_LABELS = { 'model_a': 'Model A', 'model_b': 'Model B', 'model_c': 'Model C' };
const PALETTE  = ['#6366f1', '#f59e0b', '#10b981'];

function pct(v) { return v !== null && v !== undefined ? (v * 100).toFixed(1) + '%' : '—'; }
function colorCell(v) {
  if (v === null || v === undefined) return 'val-mid';
  if (v <= 0.35) return 'val-good';
  if (v <= 0.65) return 'val-mid';
  return 'val-bad';
}

async function init() {
  const [compRes, ablRes] = await Promise.all([
    fetch('/api/comparison').then(r => r.ok ? r.json() : null),
    fetch('/api/ablation').then(r => r.ok ? r.json() : null),
  ]);

  if (compRes && compRes.length) {
    buildTable(compRes);
    buildAccuracyChart(compRes);
    buildTtmChart(compRes);
    buildCostChart(compRes);
    buildFpBox(compRes);
  }

  if (ablRes && Object.keys(ablRes).length) {
    buildAblationChart(ablRes);
  }
}

function buildTable(data) {
  const lookup = {};
  for (const d of data) lookup[\`\${d.mode}|\${d.attacker_model}\`] = d;

  const container = document.getElementById('table-container');
  const grid = document.createElement('div');
  grid.className = 'grid-3x3';

  // Header row
  grid.appendChild(Object.assign(document.createElement('div'), { className: 'cell header', textContent: '' }));
  for (const m of MODELS) {
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'cell header', textContent: MODEL_LABELS[m] }));
  }

  // Data rows
  for (const mode of MODES) {
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'cell row-label', textContent: MODE_LABELS[mode] }));
    for (const model of MODELS) {
      const d = lookup[\`\${mode}|\${model}\`];
      const v = d ? d.extraction_accuracy : null;
      const cell = document.createElement('div');
      cell.className = 'cell ' + colorCell(v);
      cell.textContent = v !== null ? pct(v) : '—';
      grid.appendChild(cell);
    }
  }

  container.innerHTML = '';
  container.appendChild(grid);
}

function makeChart(id, type, labels, datasets, opts = {}) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#64748b' }, grid: { color: '#334155' }, beginAtZero: true, ...opts.y },
      },
    },
  });
}

function buildAccuracyChart(data) {
  const datasets = MODELS.map((model, i) => ({
    label: MODEL_LABELS[model],
    data: MODES.map(mode => {
      const d = data.find(x => x.mode === mode && x.attacker_model === model);
      return d ? +(d.extraction_accuracy * 100).toFixed(1) : null;
    }),
    backgroundColor: PALETTE[i] + 'cc',
  }));
  makeChart('chart-accuracy', 'bar', MODES.map(m => MODE_LABELS[m]), datasets, { y: { max: 100 } });
}

function buildTtmChart(data) {
  const datasets = MODELS.map((model, i) => ({
    label: MODEL_LABELS[model],
    data: MODES.map(mode => {
      const d = data.find(x => x.mode === mode && x.attacker_model === model);
      return d && d.time_to_map_ms ? +(d.time_to_map_ms / 1000).toFixed(0) : null;
    }),
    backgroundColor: PALETTE[i] + 'cc',
  }));
  makeChart('chart-ttm', 'bar', MODES.map(m => MODE_LABELS[m]), datasets);
}

function buildCostChart(data) {
  const datasets = MODELS.map((model, i) => ({
    label: MODEL_LABELS[model],
    data: MODES.map(mode => {
      const d = data.find(x => x.mode === mode && x.attacker_model === model);
      return d ? d.request_cost : null;
    }),
    backgroundColor: PALETTE[i] + 'cc',
  }));
  makeChart('chart-cost', 'bar', MODES.map(m => MODE_LABELS[m]), datasets);
}

function buildFpBox(data) {
  const fpRun = data.find(d => d.attacker_model === 'normal-only')
    || data.filter(d => d.mode === 'full-defense').reduce((a, b) => a && a.false_positive_rate < b.false_positive_rate ? a : b, null);
  const container = document.getElementById('fp-container');
  if (!fpRun) return;
  const rate = fpRun.false_positive_rate;
  const cls = rate < 0.01 ? 'fp-good' : rate < 0.05 ? 'fp-mid' : 'fp-bad';
  container.innerHTML = \`<div class="fp-box \${cls}">\${pct(rate)}</div><p class="fp-label" style="margin-top:8px">of normal user requests were incorrectly modified</p>\`;
}

function buildAblationChart(abl) {
  const keys = Object.keys(abl);
  const labels = keys.map(k => k === 'control' ? 'Control (all)' : k.replace('without_', '−'));
  const values = keys.map(k => abl[k].extraction_accuracy != null ? +(abl[k].extraction_accuracy * 100).toFixed(1) : null);
  const colors = keys.map(k => k === 'control' ? '#10b981cc' : '#6366f1cc');
  makeChart('chart-ablation', 'bar', labels, [{
    label: 'Extraction Accuracy %',
    data: values,
    backgroundColor: colors,
  }], { y: { max: 100 } });
}

init();
</script>
</body>
</html>`;

/**
 * Creates the dashboard Express app/server.
 *
 * @param {object} [options]
 * @param {string}  [options.dataDir]  Directory containing comparison.json and ablation.json
 * @param {number}  [options.port=5000]
 * @returns {http.Server}
 */
export function createDashboardServer({ dataDir = join(__dirname, 'data', 'experiments'), port } = {}) {
  const app = express();

  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(DASHBOARD_HTML);
  });

  app.get('/api/comparison', (_req, res) => {
    const filePath = join(dataDir, 'comparison.json');
    if (!existsSync(filePath)) {
      return res.json([]);
    }
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      res.json(data);
    } catch {
      res.status(500).json({ error: 'Failed to read comparison data' });
    }
  });

  app.get('/api/ablation', (_req, res) => {
    const filePath = join(dataDir, 'ablation.json');
    if (!existsSync(filePath)) {
      return res.json({});
    }
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      res.json(data);
    } catch {
      res.status(500).json({ error: 'Failed to read ablation data' });
    }
  });

  const server = createServer(app);
  if (port !== undefined) server.listen(port);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createDashboardServer({ port: 5000 });
  server.on('listening', () => {
    console.log('Dashboard running at http://localhost:5000');
  });
}
