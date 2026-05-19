import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runOrchestration } from '../../scripts/traffic/orchestrator.js';

function makeRecord(clientType, sessionId, path, offsetMs = 0) {
  return {
    session_id: sessionId,
    client_type: clientType,
    timestamp: new Date(1_716_076_800_000 + offsetMs).toISOString(),
    method: 'GET',
    path,
    status: 200,
    latency_ms: 12,
  };
}

function mockGenerators(overrides = {}) {
  return {
    normalUser: ({ sessionId } = {}) => [makeRecord('normal', sessionId ?? 'normal_001', '/users/1')],
    attackerModelA: ({ sessionId } = {}) => [makeRecord('model_a', sessionId ?? 'model_a_001', '/users/2')],
    attackerModelB: ({ sessionId } = {}) => [makeRecord('model_b', sessionId ?? 'model_b_001', '/users/3')],
    attackerModelC: ({ sessionId } = {}) => [makeRecord('model_c', sessionId ?? 'model_c_001', '/users/4')],
    ...overrides,
  };
}

describe('runOrchestration', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mirage-orch-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test('launches the correct number of sessions per type', async () => {
    const calls = { normal: 0, modelA: 0, modelB: 0, modelC: 0 };
    const generators = {
      normalUser: () => { calls.normal++; return []; },
      attackerModelA: () => { calls.modelA++; return []; },
      attackerModelB: () => { calls.modelB++; return []; },
      attackerModelC: () => { calls.modelC++; return []; },
    };

    await runOrchestration({
      outputPath: join(tmpDir, 'out.jsonl'),
      generators,
      staggerWindowMs: 0,
      sessionCounts: { normal: 4, modelA: 2, modelB: 2, modelC: 2 },
      silent: true,
    });

    expect(calls.normal).toBe(4);
    expect(calls.modelA).toBe(2);
    expect(calls.modelB).toBe(2);
    expect(calls.modelC).toBe(2);
  });

  test('writes all records to a single JSONL output file', async () => {
    const outputPath = join(tmpDir, 'dataset.jsonl');
    const generators = {
      normalUser: ({ sessionId }) => [
        makeRecord('normal', sessionId, '/users/1', 0),
        makeRecord('normal', sessionId, '/users/1/orders', 1000),
      ],
      attackerModelA: ({ sessionId }) => [makeRecord('model_a', sessionId, '/users/10')],
      attackerModelB: ({ sessionId }) => [makeRecord('model_b', sessionId, '/users/20')],
      attackerModelC: ({ sessionId }) => [makeRecord('model_c', sessionId, '/users/30')],
    };

    await runOrchestration({
      outputPath,
      generators,
      staggerWindowMs: 0,
      sessionCounts: { normal: 1, modelA: 1, modelB: 1, modelC: 1 },
      silent: true,
    });

    const content = await readFile(outputPath, 'utf8');
    const lines = content.trim().split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBe(5); // 2 normal + 1 + 1 + 1
    for (const line of lines) {
      const record = JSON.parse(line);
      expect(record).toHaveProperty('session_id');
      expect(record).toHaveProperty('client_type');
      expect(record).toHaveProperty('timestamp');
      expect(record).toHaveProperty('method');
      expect(record).toHaveProperty('path');
    }
  });

  test('creates the output directory if it does not exist', async () => {
    const deepPath = join(tmpDir, 'nested', 'dir', 'dataset.jsonl');
    await runOrchestration({
      outputPath: deepPath,
      generators: mockGenerators(),
      staggerWindowMs: 0,
      sessionCounts: { normal: 1, modelA: 1, modelB: 1, modelC: 1 },
      silent: true,
    });

    const content = await readFile(deepPath, 'utf8');
    expect(content.length).toBeGreaterThan(0);
  });

  test('returns accurate summary statistics', async () => {
    const generators = {
      normalUser: ({ sessionId }) => [
        makeRecord('normal', sessionId, '/users/1'),
        makeRecord('normal', sessionId, '/users/1/orders', 1000),
      ],
      attackerModelA: ({ sessionId }) => [makeRecord('model_a', sessionId, '/users/5')],
      attackerModelB: () => [],
      attackerModelC: () => [],
    };

    const stats = await runOrchestration({
      outputPath: join(tmpDir, 'out.jsonl'),
      generators,
      staggerWindowMs: 0,
      sessionCounts: { normal: 3, modelA: 2, modelB: 1, modelC: 1 },
      silent: true,
    });

    expect(stats.totalRequests).toBe(8); // 3*2 + 2*1 + 0 + 0
    expect(stats.sessions.normal.count).toBe(3);
    expect(stats.sessions.normal.requests).toBe(6);
    expect(stats.sessions.modelA.count).toBe(2);
    expect(stats.sessions.modelA.requests).toBe(2);
    expect(stats.sessions.modelB.requests).toBe(0);
    expect(stats.sessions.modelC.requests).toBe(0);
    expect(stats.outputPath).toBe(join(tmpDir, 'out.jsonl'));
    expect(typeof stats.durationMs).toBe('number');
  });

  test('session IDs carry the correct type prefix and padded index', async () => {
    const seenIds = [];
    const generators = {
      normalUser: ({ sessionId }) => { seenIds.push(sessionId); return []; },
      attackerModelA: ({ sessionId }) => { seenIds.push(sessionId); return []; },
      attackerModelB: ({ sessionId }) => { seenIds.push(sessionId); return []; },
      attackerModelC: ({ sessionId }) => { seenIds.push(sessionId); return []; },
    };

    await runOrchestration({
      outputPath: join(tmpDir, 'out.jsonl'),
      generators,
      staggerWindowMs: 0,
      sessionCounts: { normal: 2, modelA: 1, modelB: 1, modelC: 1 },
      silent: true,
    });

    expect(seenIds.filter((id) => id.startsWith('normal_'))).toHaveLength(2);
    expect(seenIds.filter((id) => id.startsWith('model_a_'))).toHaveLength(1);
    expect(seenIds.filter((id) => id.startsWith('model_b_'))).toHaveLength(1);
    expect(seenIds.filter((id) => id.startsWith('model_c_'))).toHaveLength(1);
    // Indices are zero-padded to 3 digits
    expect(seenIds.some((id) => /normal_\d{3}$/.test(id))).toBe(true);
  });

  test('normal user sessions cycle through user IDs 1–200', async () => {
    const userIds = [];
    const generators = {
      normalUser: ({ userId }) => { userIds.push(userId); return []; },
      attackerModelA: () => [],
      attackerModelB: () => [],
      attackerModelC: () => [],
    };

    await runOrchestration({
      outputPath: join(tmpDir, 'out.jsonl'),
      generators,
      staggerWindowMs: 0,
      sessionCounts: { normal: 5, modelA: 0, modelB: 0, modelC: 0 },
      silent: true,
    });

    expect(userIds).toHaveLength(5);
    for (const id of userIds) {
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(200);
    }
    expect(new Set(userIds).size).toBeGreaterThan(1); // not all the same
  });

  test('records are sorted by timestamp in the output file', async () => {
    const outputPath = join(tmpDir, 'sorted.jsonl');
    const t0 = 1_716_076_800_000;
    const generators = {
      normalUser: ({ sessionId }) => [
        makeRecord('normal', sessionId, '/users/1', 5000),
        makeRecord('normal', sessionId, '/users/1', 1000),
      ],
      attackerModelA: ({ sessionId }) => [makeRecord('model_a', sessionId, '/users/2', 3000)],
      attackerModelB: () => [],
      attackerModelC: () => [],
    };

    await runOrchestration({
      outputPath,
      generators,
      staggerWindowMs: 0,
      sessionCounts: { normal: 1, modelA: 1, modelB: 0, modelC: 0 },
      silent: true,
    });

    const lines = (await readFile(outputPath, 'utf8')).trim().split('\n').filter((l) => l);
    const timestamps = lines.map((l) => new Date(JSON.parse(l).timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  test('handles generator returning undefined gracefully', async () => {
    const generators = {
      normalUser: () => undefined,
      attackerModelA: () => undefined,
      attackerModelB: () => undefined,
      attackerModelC: () => undefined,
    };

    const stats = await runOrchestration({
      outputPath: join(tmpDir, 'out.jsonl'),
      generators,
      staggerWindowMs: 0,
      sessionCounts: { normal: 1, modelA: 1, modelB: 1, modelC: 1 },
      silent: true,
    });

    expect(stats.totalRequests).toBe(0);
  });

  test('writes empty file when all generators return no records', async () => {
    const outputPath = join(tmpDir, 'empty.jsonl');
    const generators = {
      normalUser: () => [],
      attackerModelA: () => [],
      attackerModelB: () => [],
      attackerModelC: () => [],
    };

    await runOrchestration({
      outputPath,
      generators,
      staggerWindowMs: 0,
      sessionCounts: { normal: 2, modelA: 1, modelB: 1, modelC: 1 },
      silent: true,
    });

    const content = await readFile(outputPath, 'utf8');
    expect(content.trim()).toBe('');
  });
});
