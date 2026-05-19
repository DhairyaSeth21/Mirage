import { describe, it, expect, afterEach } from '@jest/globals';
import http from 'http';
import { runExperiment } from '../../scripts/eval/runExperiment.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { seedDb } from '../../src/api/seed/seedDatabase.js';

// Tiny attacker that makes exactly N GET requests then returns.
// Uses a model_a User-Agent so computeMetrics classifies these as attacker traffic.
function tinyAttacker(paths, userAgent = 'python-requests/2.28.0') {
  return async ({ baseUrl }) => {
    const results = [];
    for (const p of paths) {
      const res = await fetch(`${baseUrl}${p}`, {
        headers: { 'User-Agent': userAgent },
      });
      results.push({ path: p, status: res.status });
    }
    return results;
  };
}

let tmpDir;
afterEach(() => {
  if (tmpDir) {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    tmpDir = null;
  }
});

describe('runExperiment', () => {
  it('starts and stops servers cleanly, writing output files', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mirage-exp-'));

    const db = new Database(':memory:');
    seedDb(db);

    const result = await runExperiment({
      mode: 'undefended',
      attackerModel: 'model_a',
      outputDir: tmpDir,
      db,
      normalUserCount: 0,
      attackerFn: tinyAttacker(['/users/1', '/users/2']),
    });

    expect(result).toMatchObject({
      mode: 'undefended',
      attackerModel: 'model_a',
      metrics: expect.objectContaining({
        request_cost: expect.any(Number),
        extraction_accuracy: expect.any(Number),
      }),
    });
    expect(result.metrics.request_cost).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('undefended mode produces no response modifications', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mirage-exp-'));

    const db = new Database(':memory:');
    seedDb(db);

    const result = await runExperiment({
      mode: 'undefended',
      attackerModel: 'model_a',
      outputDir: tmpDir,
      db,
      normalUserCount: 0,
      attackerFn: tinyAttacker(['/users/1', '/users/2', '/users/3']),
    });

    expect(result.metrics.extraction_accuracy).toBe(1.0);
  }, 15000);

  it('ratelimit mode returns 429 once the bucket is exceeded', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mirage-exp-'));

    const db = new Database(':memory:');
    seedDb(db);

    // 101 requests against a 100-token bucket — last one should 429
    const paths = Array.from({ length: 105 }, (_, i) => `/users/${(i % 10) + 1}`);

    const result = await runExperiment({
      mode: 'ratelimit',
      attackerModel: 'model_a',
      outputDir: tmpDir,
      db,
      normalUserCount: 0,
      attackerFn: tinyAttacker(paths),
    });

    // Some requests should have been rate-limited (429 in logs)
    const logs = result.logs;
    const blocked = logs.filter((l) => l.sent_status === 429);
    expect(blocked.length).toBeGreaterThan(0);
    // Total logged requests should include allowed + blocked
    expect(logs.length).toBeGreaterThan(100);
  }, 15000);

  it('full-defense mode triggers modifications with an injectable high-pressure tracker', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mirage-exp-'));

    const db = new Database(':memory:');
    seedDb(db);

    // Build a mock tracker that always returns GENUINE level-3 pressure metrics.
    // Must match the exact format that the 6 detection signals expect —
    // specifically errorAdaptation needs 404→200 pairs in `requests`.
    const reqs = [];
    for (let i = 0; i < 10; i++) {
      reqs.push({ normalizedRoute: '/users/:id', extractedIds: [100 + i], responseStatus: 404 });
      reqs.push({ normalizedRoute: '/users/:id', extractedIds: [200 + i], responseStatus: 200 });
    }
    const highPressureMetrics = {
      totalRequests: 30,
      uniqueRoutes: new Set([
        '/users', '/users/:id', '/users/:id/orders', '/users/:id/profile',
        '/orders/:id', '/orders/:id/items', '/items/:id', '/auth/login',
      ]),
      idsPerRoute: new Map([['/users/:id', new Set(Array.from({ length: 20 }, (_, i) => i + 1))]]),
      statusCodes: reqs.map((r) => r.responseStatus),
      intervals: Array(reqs.length - 1).fill(100), // regular → timing score 1.0
      methodCounts: { GET: reqs.length },
      requests: reqs,
    };
    const mockTracker = {
      addRequest: () => {},
      computeMetrics: () => highPressureMetrics,
    };

    const result = await runExperiment({
      mode: 'full-defense',
      attackerModel: 'model_a',
      outputDir: tmpDir,
      db,
      normalUserCount: 0,
      attackerFn: tinyAttacker(['/users/1', '/users/2', '/users/3']),
      clientTracker: mockTracker,
    });

    const modified = result.logs.filter((l) => l.response_modified);
    expect(modified.length).toBeGreaterThan(0);
  }, 15000);
});
