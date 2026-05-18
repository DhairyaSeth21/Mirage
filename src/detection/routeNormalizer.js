/**
 * Normalizes a raw request path by replacing numeric and UUID path segments
 * with the placeholder `:id` and collecting the replaced values.
 *
 * @param {string} rawPath - The raw URL path, optionally including a query string
 * @returns {{ normalizedRoute: string, extractedIds: Array<number|string> }}
 */
export function normalizeRoute(rawPath) {
  const pathOnly = rawPath.split('?')[0];
  const segments = pathOnly.split('/').filter((s) => s !== '');
  const extractedIds = [];

  const normalizedSegments = segments.map((segment) => {
    if (/^\d+$/.test(segment)) {
      extractedIds.push(parseInt(segment, 10));
      return ':id';
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment)) {
      extractedIds.push(segment);
      return ':id';
    }
    return segment;
  });

  return {
    normalizedRoute: '/' + normalizedSegments.join('/'),
    extractedIds,
  };
}
