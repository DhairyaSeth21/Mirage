import { config } from '../config.js';

/**
 * Detects machine-like request cadence. Computes the coefficient of variation
 * (std_dev / mean) of inter-request intervals. A low CV means highly regular
 * timing (suspicious); a high CV means human-like irregular timing.
 * The score is inverted so that low CV → high suspicion.
 *
 * @param {{ intervals: number[] }} metrics - Inter-request intervals in milliseconds
 * @returns {number} Score in [0.0, 1.0]
 */
export function computeTiming(metrics) {
  const { intervals } = metrics;
  if (intervals.length === 0) return 0.0;

  const mean = intervals.reduce((sum, x) => sum + x, 0) / intervals.length;

  // Zero mean means all requests arrived simultaneously — maximally machine-like
  if (mean === 0) return 1.0;

  const variance = intervals.reduce((sum, x) => sum + (x - mean) ** 2, 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  return 1.0 - Math.min(coefficientOfVariation / config.CV_THRESHOLD, 1.0);
}
