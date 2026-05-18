import { config } from '../config.js';
import { computeCoverage } from './coverage.js';
import { computeEnumeration } from './enumeration.js';
import { computeErrorAdaptation } from './errorAdaptation.js';
import { computeTraversal } from './traversal.js';
import { computeTiming } from './timing.js';
import { computeMethodUniformity } from './methodUniformity.js';

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
  const signals = {
    coverage: computeCoverage(metrics),
    enumeration: computeEnumeration(metrics),
    errorAdaptation: computeErrorAdaptation(metrics),
    traversal: computeTraversal(metrics),
    timing: computeTiming(metrics),
    methodUniformity: computeMethodUniformity(metrics),
  };

  const pressure =
    signals.coverage * config.WEIGHTS.coverage +
    signals.enumeration * config.WEIGHTS.enumeration +
    signals.errorAdaptation * config.WEIGHTS.errorAdaptation +
    signals.traversal * config.WEIGHTS.traversal +
    signals.timing * config.WEIGHTS.timing +
    signals.methodUniformity * config.WEIGHTS.methodUniformity;

  // Count how many level thresholds the pressure score exceeds
  const level = config.LEVEL_THRESHOLDS.filter((threshold) => pressure >= threshold).length;

  return { signals, pressure, level };
}
