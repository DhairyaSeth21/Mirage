import { config } from '../config.js';

/**
 * Computes additional throttle delay for the most-enumerated route.
 * At Level 2+, the route a client is hammering hardest gets an extra
 * THROTTLE_DELAY_MS stacked on top of the base latency injection.
 *
 * @param {number} level - Escalation level
 * @param {{ idsPerRoute: Map<string, Set> }} metrics
 * @param {string} currentRoute - Normalized route of the current request
 * @returns {number} Extra delay in milliseconds (0 or THROTTLE_DELAY_MS)
 */
export function computeThrottle(level, metrics, currentRoute) {
  if (level < 2) return 0;

  let maxRoute = null;
  let maxCount = 0;
  for (const [route, ids] of metrics.idsPerRoute.entries()) {
    if (ids.size > maxCount) {
      maxCount = ids.size;
      maxRoute = route;
    }
  }

  if (currentRoute === maxRoute && maxCount > 5) {
    return config.THROTTLE_DELAY_MS;
  }
  return 0;
}
