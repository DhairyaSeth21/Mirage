/**
 * Measures the fraction of requests that use GET. Automated API scanners
 * overwhelmingly issue GET requests; legitimate clients mix in POST, PUT, etc.
 *
 * @param {{ methodCounts: Object<string, number>, totalRequests: number }} metrics
 * @returns {number} Score in [0.0, 1.0]
 */
export function computeMethodUniformity(metrics) {
  if (metrics.totalRequests === 0) return 0.0;
  const getCount = metrics.methodCounts.GET || 0;
  return getCount / metrics.totalRequests;
}
