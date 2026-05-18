import { config } from '../config.js';

/**
 * Measures how broadly a client is exploring the API surface.
 * Score rises toward 1.0 as the number of unique normalized routes
 * approaches COVERAGE_THRESHOLD.
 *
 * @param {{ uniqueRoutes: Set<string> }} metrics
 * @returns {number} Score in [0.0, 1.0]
 */
export function computeCoverage(metrics) {
  return Math.min(metrics.uniqueRoutes.size / config.COVERAGE_THRESHOLD, 1.0);
}
