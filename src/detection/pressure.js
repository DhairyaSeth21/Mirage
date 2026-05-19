import { config } from '../config.js';
import { computeCoverage } from './coverage.js';
import { computeEnumeration } from './enumeration.js';
import { computeErrorAdaptation } from './errorAdaptation.js';
import { computeTraversal } from './traversal.js';
import { computeTiming } from './timing.js';
import { computeMethodUniformity } from './methodUniformity.js';

/**
 * Runs all 6 detection signals and combines them using the provided weights object.
 * Weights are expected to sum to 1.0; any signal key absent from weights contributes 0.
 *
 * @param {object} metrics - Output of tracker.computeMetrics()
 * @param {object} weights - { coverage, enumeration, errorAdaptation, traversal, timing, methodUniformity }
 * @returns {{ signals: object, pressure: number, level: number }}
 */
export function computePressureWith(metrics, weights) {
  const signals = {
    coverage: computeCoverage(metrics),
    enumeration: computeEnumeration(metrics),
    errorAdaptation: computeErrorAdaptation(metrics),
    traversal: computeTraversal(metrics),
    timing: computeTiming(metrics),
    methodUniformity: computeMethodUniformity(metrics),
  };

  const pressure =
    signals.coverage * (weights.coverage ?? 0) +
    signals.enumeration * (weights.enumeration ?? 0) +
    signals.errorAdaptation * (weights.errorAdaptation ?? 0) +
    signals.traversal * (weights.traversal ?? 0) +
    signals.timing * (weights.timing ?? 0) +
    signals.methodUniformity * (weights.methodUniformity ?? 0);

  const level = config.LEVEL_THRESHOLDS.filter((threshold) => pressure >= threshold).length;

  return { signals, pressure, level };
}

/**
 * Runs all 6 detection signals against a metrics snapshot and combines them
 * into a single weighted pressure score and escalation level.
 *
 * @param {object} metrics - Output of tracker.computeMetrics()
 * @returns {{
 *   signals: { coverage: number, enumeration: number, errorAdaptation: number, traversal: number, timing: number, methodUniformity: number },
 *   pressure: number,
 *   level: number,
 * }}
 */
export function computePressure(metrics) {
  return computePressureWith(metrics, config.WEIGHTS);
}
