import { createHash } from 'crypto';

/**
 * Derives a short, deterministic 4-hex-character marker from a session ID.
 * The marker can be embedded in poisoned responses to trace data leaks
 * back to the exact session that extracted them.
 *
 * @param {string} sessionId
 * @returns {string} Marker in the form "mrk_XXXX" (8 chars total)
 */
export function generateMarker(sessionId) {
  const hash = createHash('sha256').update(sessionId).digest('hex').slice(0, 4);
  return `mrk_${hash}`;
}

/**
 * Embeds the marker as a _ref field into an individual record response body.
 * Only embeds when the body is an object with an id field (i.e. not a list wrapper).
 *
 * @param {object} responseBody - Parsed JSON body
 * @param {string} marker
 * @returns {object} Body with _ref field added (or unchanged if not applicable)
 */
export function embedMarker(responseBody, marker) {
  if (typeof responseBody === 'object' && responseBody !== null && 'id' in responseBody) {
    responseBody._ref = marker;
  }
  return responseBody;
}
