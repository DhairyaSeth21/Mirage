/**
 * Full experiment suite — runs 9 experiments (3 modes × 3 attacker models)
 * plus one normal-only run, then writes comparison.json and comparison.csv.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import { runExperiment } from './runExperiment.js';

const MODES = ['undefended', 'ratelimit', 'full-defense'];
const ATTACKER_MODELS = ['model_a', 'model_b', 'model_c'];
const OUTPUT_BASE = 'data/experiments';

/**
 * Runs all 10 experiments and writes comparison files.
 * Experiments run sequentially to avoid port conflicts.
 *
 * @param {object} [options]
 * @param {string}  [options.outputBase=OUTPUT_BASE]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<object[]>} Array of all metrics objects
 */
export async function runAll({ outputBase = OUTPUT_BASE, silent = false } = {}) {
  mkdirSync(outputBase, { recursive: true });

  // Build the experiment list: 9 mode×model runs + 1 normal-only
  const experiments = [];
  for (const mode of MODES) {
    for (const attackerModel of ATTACKER_MODELS) {
      experiments.push({ mode, attackerModel });
    }
  }
  // Run 10: normal-only false-positive measurement
  experiments.push({ mode: 'full-defense', attackerModel: 'normal-only' });

  const total = experiments.length;
  const allMetrics = [];

  for (let i = 0; i < total; i++) {
    const { mode, attackerModel } = experiments[i];
    const label = `${mode} + ${attackerModel}`;
    if (!silent) process.stdout.write(`[${i + 1}/${total}] ${label} ... `);

    const runStart = Date.now();
    const expDir = join(outputBase, `${mode}-${attackerModel}`);

    let result;
    if (attackerModel === 'normal-only') {
      // Run 10: only normal users, no attacker
      result = await runExperiment({
        mode: 'full-defense',
        attackerModel: 'model_a', // dummy — attackerFn overrides
        outputDir: expDir,
        normalUserCount: 10,
        attackerFn: async () => [], // no attacker traffic
      });
      result.metrics.attacker_model = 'normal-only';
    } else {
      result = await runExperiment({
        mode,
        attackerModel,
        outputDir: expDir,
        normalUserCount: mode === 'full-defense' ? 5 : 0,
      });
    }

    const elapsed = Math.round((Date.now() - runStart) / 1000);
    if (!silent) {
      console.log(`done (${elapsed}s, ${result.metrics.request_cost + result.metrics.total_normal_requests} requests)`);
    }

    allMetrics.push(result.metrics);
  }

  // ── Write comparison.json ──────────────────────────────────────────────────
  const comparisonPath = join(outputBase, 'comparison.json');
  writeFileSync(comparisonPath, JSON.stringify(allMetrics, null, 2));

  // ── Write comparison.csv ───────────────────────────────────────────────────
  const csvHeader = [
    'mode', 'attacker_model', 'extraction_accuracy', 'time_to_map_ms',
    'request_cost', 'decoy_interaction_rate', 'false_positive_rate',
    'max_pressure_score', 'avg_pressure_score',
  ];
  const csvRows = allMetrics.map((m) =>
    [
      m.mode ?? 'full-defense',
      m.attacker_model ?? '',
      m.extraction_accuracy,
      m.time_to_map_ms ?? '',
      m.request_cost,
      m.decoy_interaction_rate,
      m.false_positive_rate,
      m.max_pressure_score,
      m.avg_pressure_score,
    ].join(','),
  );
  writeFileSync(join(outputBase, 'comparison.csv'), [csvHeader.join(','), ...csvRows].join('\n') + '\n');

  if (!silent) {
    console.log(`\nResults saved to ${outputBase}/`);
    console.log(`  comparison.json — ${total} experiment runs`);
  }

  return allMetrics;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running experiment suite...');
  runAll().catch((err) => {
    console.error('Experiment suite failed:', err);
    process.exit(1);
  });
}
