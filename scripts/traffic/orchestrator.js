import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { normalUser as defaultNormalUser } from './normalUser.js';
import { attackerModelA as defaultAttackerModelA } from './attackerModelA.js';
import { attackerModelB as defaultAttackerModelB } from './attackerModelB.js';
import { attackerModelC as defaultAttackerModelC } from './attackerModelC.js';

/**
 * Runs all traffic generators simultaneously to create realistic mixed traffic.
 * Staggers session start times over a configurable window so traffic overlaps naturally.
 *
 * @param {Object} [options]
 * @param {string} [options.outputPath] - Path for combined JSONL output
 * @param {string} [options.baseUrl] - Base URL of the Mirage proxy
 * @param {{ normal: number, modelA: number, modelB: number, modelC: number }} [options.sessionCounts]
 * @param {number} [options.staggerWindowMs] - Window over which session starts are spread
 * @param {Object} [options.generators] - Injected generator functions (used for testing)
 * @param {boolean} [options.silent] - Suppress console output
 * @returns {Promise<Object>} Summary statistics
 */
export async function runOrchestration(options = {}) {
  const {
    outputPath = 'data/dataset.jsonl',
    baseUrl = 'http://localhost:3000',
    sessionCounts = { normal: 50, modelA: 5, modelB: 5, modelC: 5 },
    staggerWindowMs = 300_000,
    generators = {},
    silent = false,
  } = options;

  const normalUser = generators.normalUser ?? defaultNormalUser;
  const attackerModelA = generators.attackerModelA ?? defaultAttackerModelA;
  const attackerModelB = generators.attackerModelB ?? defaultAttackerModelB;
  const attackerModelC = generators.attackerModelC ?? defaultAttackerModelC;

  await mkdir(dirname(outputPath), { recursive: true });

  const startTime = Date.now();

  // Build the full session list
  const sessions = [];

  for (let i = 0; i < sessionCounts.normal; i++) {
    const sessionId = `normal_${String(i + 1).padStart(3, '0')}`;
    const userId = (i % 200) + 1;
    sessions.push({
      type: 'normal',
      run: () => normalUser({ baseUrl, userId, sessionId }),
    });
  }

  for (let i = 0; i < sessionCounts.modelA; i++) {
    const sessionId = `model_a_${String(i + 1).padStart(3, '0')}`;
    sessions.push({
      type: 'model_a',
      run: () => attackerModelA({ baseUrl, sessionId }),
    });
  }

  for (let i = 0; i < sessionCounts.modelB; i++) {
    const sessionId = `model_b_${String(i + 1).padStart(3, '0')}`;
    sessions.push({
      type: 'model_b',
      run: () => attackerModelB({ baseUrl, sessionId }),
    });
  }

  for (let i = 0; i < sessionCounts.modelC; i++) {
    const sessionId = `model_c_${String(i + 1).padStart(3, '0')}`;
    sessions.push({
      type: 'model_c',
      run: () => attackerModelC({ baseUrl, sessionId }),
    });
  }

  // Launch all sessions with randomised stagger delays
  const sessionPromises = sessions.map(({ type, run }) => {
    const delay = Math.floor(Math.random() * Math.max(staggerWindowMs, 1));
    return new Promise((resolve) => {
      setTimeout(async () => {
        const records = await run();
        resolve({ type, records: records ?? [] });
      }, delay);
    });
  });

  const results = await Promise.all(sessionPromises);

  // Collect and sort all records by timestamp
  const allRecords = [];
  for (const { records } of results) {
    allRecords.push(...records);
  }
  allRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Write combined JSONL file
  const jsonlContent = allRecords.map((r) => JSON.stringify(r)).join('\n');
  await writeFile(outputPath, jsonlContent ? jsonlContent + '\n' : '', 'utf8');

  const durationMs = Date.now() - startTime;

  // Tally per-type request counts
  const stats = {
    totalRequests: allRecords.length,
    sessions: {
      normal: { count: sessionCounts.normal, requests: 0 },
      modelA: { count: sessionCounts.modelA, requests: 0 },
      modelB: { count: sessionCounts.modelB, requests: 0 },
      modelC: { count: sessionCounts.modelC, requests: 0 },
    },
    durationMs,
    outputPath,
  };

  const typeToKey = { normal: 'normal', model_a: 'modelA', model_b: 'modelB', model_c: 'modelC' };
  for (const { type, records } of results) {
    const key = typeToKey[type];
    if (key) stats.sessions[key].requests += records.length;
  }

  if (!silent) printSummary(stats);
  return stats;
}

/**
 * Prints dataset generation summary to stdout.
 * @param {Object} stats
 */
function printSummary(stats) {
  const totalSeconds = Math.floor(stats.durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  console.log('\nDataset generated:');
  console.log(`  Total requests: ${stats.totalRequests.toLocaleString()}`);
  console.log(`  Normal sessions: ${stats.sessions.normal.count} (${stats.sessions.normal.requests.toLocaleString()} requests)`);
  console.log(`  Model A sessions: ${stats.sessions.modelA.count} (${stats.sessions.modelA.requests.toLocaleString()} requests)`);
  console.log(`  Model B sessions: ${stats.sessions.modelB.count} (${stats.sessions.modelB.requests.toLocaleString()} requests)`);
  console.log(`  Model C sessions: ${stats.sessions.modelC.count} (${stats.sessions.modelC.requests.toLocaleString()} requests)`);
  console.log(`  Duration: ${minutes}m ${seconds}s`);
  console.log(`  Output: ${stats.outputPath}`);
}

// CLI entry point — only runs when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runOrchestration().catch((error) => {
    console.error('Orchestration failed:', error);
    process.exit(1);
  });
}
