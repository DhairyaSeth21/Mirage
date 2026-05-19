/**
 * Ablation study — disables one detection signal at a time and measures the effect
 * on extraction accuracy against Model B (the adaptive scraper).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import { config } from '../../src/config.js';
import { runExperiment as defaultRunExperiment } from './runExperiment.js';

const SIGNALS = ['coverage', 'enumeration', 'errorAdaptation', 'traversal', 'timing', 'methodUniformity'];

/**
 * Builds a weights object with one signal zeroed out and the rest re-normalised to sum to 1.0.
 *
 * @param {string} disabledSignal
 * @returns {object}
 */
function weightsWithout(disabledSignal) {
  const original = config.WEIGHTS;
  const remainingEntries = Object.entries(original).filter(([k]) => k !== disabledSignal);
  const remainingSum = remainingEntries.reduce((sum, [, v]) => sum + v, 0);
  const normalized = Object.fromEntries(
    remainingEntries.map(([k, v]) => [k, v / remainingSum]),
  );
  normalized[disabledSignal] = 0;
  return normalized;
}

/**
 * Runs the ablation study.
 * For each of 7 configurations (control + 6 signal removals), runs a full-defense
 * experiment against Model B and records the metrics.
 *
 * @param {object} [options]
 * @param {Function} [options.runExperimentFn]  Injectable experiment runner (for testing)
 * @param {string}   [options.outputDir]        Where to save ablation.json
 * @param {boolean}  [options.silent=false]
 * @returns {Promise<object>} Results keyed by configuration name
 */
export async function runAblation({
  runExperimentFn = defaultRunExperiment,
  outputDir = 'data/experiments',
  silent = false,
} = {}) {
  const results = {};
  const total = SIGNALS.length + 1; // +1 for control
  let current = 0;

  const runOne = async (label, weights) => {
    current++;
    if (!silent) process.stdout.write(`[${current}/${total}] ablation: ${label} ... `);

    const startMs = Date.now();
    const metrics = await runExperimentFn({
      mode: 'full-defense',
      attackerModel: 'model_b',
      outputDir: join(outputDir, `ablation-${label}`),
      normalUserCount: 0,
      ...(weights !== null && { weights }),
    });
    const elapsed = Math.round((Date.now() - startMs) / 1000);
    if (!silent) console.log(`done (${elapsed}s)`);

    return metrics;
  };

  // Control: all signals enabled with default weights (pass null → uses config.WEIGHTS)
  results.control = await runOne('control', null);

  // One-signal-removed runs
  for (const signal of SIGNALS) {
    const key = `without_${signal}`;
    results[key] = await runOne(key, weightsWithout(signal));
  }

  // Write results
  mkdirSync(outputDir, { recursive: true });
  const ablationPath = join(outputDir, 'ablation.json');
  writeFileSync(ablationPath, JSON.stringify(results, null, 2));

  if (!silent) console.log(`\nAblation results saved to ${ablationPath}`);

  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running ablation study...');
  runAblation().catch((err) => {
    console.error('Ablation failed:', err);
    process.exit(1);
  });
}
