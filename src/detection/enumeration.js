import { config } from '../config.js';

/**
 * Detects ID enumeration — a client systematically probing many distinct resource IDs
 * on the same route. Score is driven by the route with the highest unique ID count.
 *
 * @param {{ idsPerRoute: Map<string, Set<number|string>> }} metrics
 * @returns {number} Score in [0.0, 1.0]
 */
export function computeEnumeration(metrics) {
  let maxUniqueIds = 0;
  for (const ids of metrics.idsPerRoute.values()) {
    if (ids.size > maxUniqueIds) maxUniqueIds = ids.size;
  }
  return Math.min(maxUniqueIds / config.ENUM_THRESHOLD, 1.0);
}
