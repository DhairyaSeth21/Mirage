import { config } from '../config.js';

/**
 * Detects systematic sub-resource traversal: a client that accesses the same base
 * resource ID across multiple different routes (e.g., /users/1, /users/1/orders,
 * /users/1/profile) is mapping the API graph rather than browsing normally.
 *
 * Uses the first extracted ID from each request as the "base" identity key.
 *
 * @param {{ requests: Array<{ normalizedRoute: string, extractedIds: Array }> }} metrics
 * @returns {number} Score in [0.0, 1.0]
 */
export function computeTraversal(metrics) {
  /** @type {Map<number|string, Set<string>>} */
  const routesPerBaseId = new Map();

  for (const req of metrics.requests) {
    if (req.extractedIds.length === 0) continue;
    const baseId = req.extractedIds[0];

    if (!routesPerBaseId.has(baseId)) {
      routesPerBaseId.set(baseId, new Set());
    }
    routesPerBaseId.get(baseId).add(req.normalizedRoute);
  }

  let chainedIdCount = 0;
  for (const routes of routesPerBaseId.values()) {
    if (routes.size >= 2) chainedIdCount++;
  }

  return Math.min(chainedIdCount / config.TRAVERSAL_THRESHOLD, 1.0);
}
