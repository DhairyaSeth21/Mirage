/**
 * Experiment runner framework.
 * Starts the API and proxy in a specified mode, runs an attacker model,
 * collects proxy logs, computes metrics, then shuts everything down.
 */

import http from 'http';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { config } from '../../src/config.js';
import { createApp } from '../../src/api/server.js';
import { seedDb } from '../../src/api/seed/seedDatabase.js';
import { createProxyServer } from '../../src/proxy/server.js';
import { createLogger } from '../../src/logging/logger.js';
import { computeMetrics } from './computeMetrics.js';
import { attackerModelA } from '../traffic/attackerModelA.js';
import { attackerModelB } from '../traffic/attackerModelB.js';
import { attackerModelC } from '../traffic/attackerModelC.js';

/** Default attacker parameters kept intentionally small for fast experiment runs */
const ATTACKER_DEFAULTS = {
  model_a: { endId: 200, intervalMs: 50 },
  model_b: { maxProbeId: 200 },
  model_c: { maxUsers: 20 },
};

/**
 * Wraps server.listen in a Promise and returns the actual bound port.
 * @param {http.Server} server
 * @param {number} port  Pass 0 to get a random available port.
 * @returns {Promise<number>}
 */
function listenAsync(server, port) {
  return new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) return reject(err);
      resolve(server.address().port);
    });
  });
}

/**
 * Wraps server.close in a Promise.
 * Also calls closeAllConnections() (Node 18.2+) to immediately drop any
 * lingering keep-alive connections so the close callback fires promptly.
 *
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function closeAsync(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) return reject(err);
      resolve();
    });
    // Force-drop keep-alive connections so close() completes without waiting
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
  });
}

/**
 * Runs a single controlled experiment.
 *
 * @param {object} options
 * @param {'undefended'|'ratelimit'|'full-defense'} [options.mode='full-defense']
 * @param {'model_a'|'model_b'|'model_c'} [options.attackerModel='model_b']
 * @param {string}   [options.outputDir]       Directory for output files
 * @param {Database} [options.db]              SQLite DB instance (creates fresh in-memory DB if omitted)
 * @param {number}   [options.apiPort=0]       0 = random port
 * @param {number}   [options.proxyPort=0]     0 = random port
 * @param {number}   [options.normalUserCount=5]
 * @param {Function} [options.attackerFn]      Injectable attacker (defaults to the named model)
 * @param {object}   [options.clientTracker]   Injectable tracker (for testing)
 * @param {object}   [options.weights]         Custom signal weights (for ablation)
 * @returns {Promise<{ mode, attackerModel, metrics, logs, outputDir }>}
 */
export async function runExperiment({
  mode = 'full-defense',
  attackerModel = 'model_b',
  outputDir,
  db: injectedDb,
  apiPort = 0,
  proxyPort = 0,
  normalUserCount = 5,
  attackerFn,
  clientTracker,
  weights,
} = {}) {
  // ── Setup database ─────────────────────────────────────────────────────────
  let db = injectedDb;
  let ownDb = false;
  if (!db) {
    db = new Database('./data/mirage.db');
    ownDb = true;
  }

  // ── Start API server ───────────────────────────────────────────────────────
  const apiApp = createApp(db);
  const apiServer = http.createServer(apiApp);
  const actualApiPort = await listenAsync(apiServer, apiPort);
  const upstreamUrl = `http://localhost:${actualApiPort}`;

  // ── Prepare output directory and per-experiment logger ─────────────────────
  const expDir = outputDir ?? join('data', 'experiments', `${mode}-${attackerModel}`);
  mkdirSync(expDir, { recursive: true });
  const requestsPath = join(expDir, 'requests.jsonl');
  writeFileSync(requestsPath, ''); // start fresh each run
  const expLogger = createLogger(requestsPath);

  // ── Start proxy server ─────────────────────────────────────────────────────
  const proxyServer = createProxyServer(upstreamUrl, {
    mode,
    logger: expLogger,
    ...(clientTracker && { clientTracker }),
    ...(weights && { weights }),
  });
  const actualProxyPort = await listenAsync(proxyServer, proxyPort);
  const baseUrl = `http://localhost:${actualProxyPort}`;

  // ── Run traffic ────────────────────────────────────────────────────────────
  const sessionId = `exp_${Date.now()}`;
  let attackerEntries = [];

  if (attackerFn) {
    // Injectable attacker (for tests or custom runs)
    attackerEntries = (await attackerFn({ baseUrl, sessionId })) ?? [];
  } else {
    // Select the appropriate attacker model
    const defaults = ATTACKER_DEFAULTS[attackerModel] ?? {};
    if (attackerModel === 'model_a') {
      attackerEntries = await attackerModelA({ baseUrl, sessionId, ...defaults });
    } else if (attackerModel === 'model_b') {
      attackerEntries = await attackerModelB({ baseUrl, sessionId, ...defaults });
    } else if (attackerModel === 'model_c') {
      attackerEntries = await attackerModelC({ baseUrl, sessionId, ...defaults });
    }
  }

  // Normal users run only in full-defense mode (they skew metrics in other modes)
  if (normalUserCount > 0 && mode === 'full-defense') {
    const { normalUser } = await import('../traffic/normalUser.js');
    const fastSleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 200)));
    await Promise.all(
      Array.from({ length: normalUserCount }, (_, i) =>
        normalUser({
          baseUrl,
          userId: (i % 200) + 1,
          sessionId: `normal_exp_${i + 1}`,
          sleepFn: fastSleep,
        }),
      ),
    );
  }

  // ── Stop servers ───────────────────────────────────────────────────────────
  await closeAsync(proxyServer);
  await closeAsync(apiServer);
  if (ownDb) db.close();

  // ── Read proxy logs and compute metrics ────────────────────────────────────
  const rawLogs = readFileSync(requestsPath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter((e) => e !== null && !e.event); // skip attribution_marker events

  const metrics = computeMetrics(rawLogs, { mode, attackerModel });

  // ── Write output files ─────────────────────────────────────────────────────
  const metricsPath = join(expDir, 'metrics.json');
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

  const summaryLines = [
    `Mode:              ${mode}`,
    `Attacker model:    ${attackerModel}`,
    `Extraction acc:    ${(metrics.extraction_accuracy * 100).toFixed(1)}%`,
    `Time to map:       ${metrics.time_to_map_ms !== null ? (metrics.time_to_map_ms / 1000).toFixed(1) + 's' : 'never'}`,
    `Request cost:      ${metrics.request_cost}`,
    `Decoy rate:        ${(metrics.decoy_interaction_rate * 100).toFixed(1)}%`,
    `False positive:    ${(metrics.false_positive_rate * 100).toFixed(2)}%`,
    `Max pressure:      ${metrics.max_pressure_score.toFixed(3)}`,
    `Avg pressure:      ${metrics.avg_pressure_score.toFixed(3)}`,
  ];
  writeFileSync(join(expDir, 'summary.txt'), summaryLines.join('\n') + '\n');

  return { mode, attackerModel, metrics, logs: rawLogs, outputDir: expDir };
}

// CLI entry — `node scripts/eval/runExperiment.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , modeArg = 'full-defense', modelArg = 'model_b'] = process.argv;
  runExperiment({ mode: modeArg, attackerModel: modelArg, normalUserCount: 2 })
    .then(({ metrics }) => {
      console.log('\nExperiment complete:');
      console.log(JSON.stringify(metrics, null, 2));
    })
    .catch((err) => {
      console.error('Experiment failed:', err);
      process.exit(1);
    });
}
