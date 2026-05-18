/**
 * Detects adaptive search behavior: a client that receives a 404 and immediately
 * tries a different ID (rather than retrying the same one or giving up) is
 * exhibiting binary-search / bisection enumeration.
 *
 * @param {{ requests: Array<{ extractedIds: Array, responseStatus: number }> }} metrics
 * @returns {number} Score in [0.0, 1.0]
 */
export function computeErrorAdaptation(metrics) {
  const { requests } = metrics;
  let totalErrors = 0;
  let adaptedPairs = 0;

  for (let i = 0; i < requests.length - 1; i++) {
    if (requests[i].responseStatus === 404) {
      totalErrors++;
      const currentId = requests[i].extractedIds[0];
      const nextId = requests[i + 1].extractedIds[0];
      if (currentId !== undefined && nextId !== undefined && nextId !== currentId) {
        adaptedPairs++;
      }
    }
  }

  return totalErrors === 0 ? 0.0 : adaptedPairs / totalErrors;
}
