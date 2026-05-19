import { describe, it, expect, afterEach } from '@jest/globals';
import http from 'http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDashboardServer } from '../../scripts/eval/dashboard.js';

const MOCK_COMPARISON = [
  {
    mode: 'undefended', attacker_model: 'model_a',
    extraction_accuracy: 1.0, time_to_map_ms: 5000, request_cost: 200,
    decoy_interaction_rate: 0.0, false_positive_rate: 0.0,
    max_pressure_score: 0.1, avg_pressure_score: 0.05, level_distribution: {},
  },
  {
    mode: 'full-defense', attacker_model: 'model_a',
    extraction_accuracy: 0.2, time_to_map_ms: 30000, request_cost: 1000,
    decoy_interaction_rate: 0.3, false_positive_rate: 0.005,
    max_pressure_score: 0.95, avg_pressure_score: 0.75, level_distribution: {},
  },
];

const MOCK_ABLATION = {
  control: { extraction_accuracy: 0.2 },
  without_coverage: { extraction_accuracy: 0.3 },
};

/** GET a URL and return { status, body } */
async function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

let server;
let dataDir;
afterEach(async () => {
  if (server) {
    await new Promise((r) => server.close(r));
    server = null;
  }
  if (dataDir) {
    try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
    dataDir = null;
  }
});

describe('createDashboardServer', () => {
  it('returns 200 on GET /', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'mirage-dash-'));
    writeFileSync(join(dataDir, 'comparison.json'), JSON.stringify(MOCK_COMPARISON));
    writeFileSync(join(dataDir, 'ablation.json'), JSON.stringify(MOCK_ABLATION));

    server = createDashboardServer({ dataDir });
    const port = await new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));

    const { status } = await get(`http://localhost:${port}/`);
    expect(status).toBe(200);
  });

  it('GET /api/comparison returns valid JSON array', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'mirage-dash-'));
    writeFileSync(join(dataDir, 'comparison.json'), JSON.stringify(MOCK_COMPARISON));
    writeFileSync(join(dataDir, 'ablation.json'), JSON.stringify(MOCK_ABLATION));

    server = createDashboardServer({ dataDir });
    const port = await new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));

    const { status, body } = await get(`http://localhost:${port}/api/comparison`);
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty('mode');
    expect(parsed[0]).toHaveProperty('extraction_accuracy');
  });

  it('GET /api/ablation returns valid JSON object', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'mirage-dash-'));
    writeFileSync(join(dataDir, 'comparison.json'), JSON.stringify(MOCK_COMPARISON));
    writeFileSync(join(dataDir, 'ablation.json'), JSON.stringify(MOCK_ABLATION));

    server = createDashboardServer({ dataDir });
    const port = await new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));

    const { status, body } = await get(`http://localhost:${port}/api/ablation`);
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(typeof parsed).toBe('object');
    expect(parsed).toHaveProperty('control');
  });

  it('returns 404 for unknown routes', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'mirage-dash-'));
    writeFileSync(join(dataDir, 'comparison.json'), JSON.stringify(MOCK_COMPARISON));
    writeFileSync(join(dataDir, 'ablation.json'), JSON.stringify(MOCK_ABLATION));

    server = createDashboardServer({ dataDir });
    const port = await new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));

    const { status } = await get(`http://localhost:${port}/not-a-real-route`);
    expect(status).toBe(404);
  });
});
