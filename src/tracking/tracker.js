import { config } from '../config.js';

/**
 * Creates a new sliding-window client state tracker.
 * Accepts an optional options object to override defaults (useful for testing).
 *
 * @param {{ windowSizeMs?: number }} [options]
 * @returns {{ addRequest: function, getState: function, computeMetrics: function }}
 */
export function createTracker({ windowSizeMs = config.WINDOW_SIZE_MS } = {}) {
  /** @type {Map<string, object>} */
  const clients = new Map();

  /**
   * Appends a request to the client's window, evicting entries older than the window.
   *
   * @param {string} clientId
   * @param {{ timestamp: number, method: string, path: string, normalizedRoute: string, extractedIds: Array, responseStatus: number }} requestData
   */
  function addRequest(clientId, requestData) {
    const now = requestData.timestamp ?? Date.now();

    if (!clients.has(clientId)) {
      clients.set(clientId, {
        clientId,
        requests: [],
        firstSeen: now,
        lastSeen: now,
      });
    }

    const state = clients.get(clientId);

    // Evict requests that have fallen outside the sliding window
    const cutoff = now - windowSizeMs;
    state.requests = state.requests.filter((r) => r.timestamp > cutoff);

    state.requests.push(requestData);
    state.lastSeen = now;
  }

  /**
   * Returns the current state for a client, or null if the client is not tracked.
   *
   * @param {string} clientId
   * @returns {object|null}
   */
  function getState(clientId) {
    return clients.get(clientId) ?? null;
  }

  /**
   * Derives metrics from the client's current sliding window.
   * Returns empty metrics if the client is unknown.
   *
   * @param {string} clientId
   * @returns {{
   *   totalRequests: number,
   *   uniqueRoutes: Set<string>,
   *   idsPerRoute: Map<string, Set<number|string>>,
   *   statusCodes: number[],
   *   intervals: number[],
   *   methodCounts: Object<string, number>,
   *   requests: object[],
   * }}
   */
  function computeMetrics(clientId) {
    const emptyMetrics = {
      totalRequests: 0,
      uniqueRoutes: new Set(),
      idsPerRoute: new Map(),
      statusCodes: [],
      intervals: [],
      methodCounts: {},
      requests: [],
    };

    const state = clients.get(clientId);
    if (!state) return emptyMetrics;

    const { requests } = state;
    const uniqueRoutes = new Set();
    const idsPerRoute = new Map();
    const statusCodes = [];
    const methodCounts = {};

    for (const req of requests) {
      uniqueRoutes.add(req.normalizedRoute);

      if (!idsPerRoute.has(req.normalizedRoute)) {
        idsPerRoute.set(req.normalizedRoute, new Set());
      }
      for (const id of req.extractedIds) {
        idsPerRoute.get(req.normalizedRoute).add(id);
      }

      statusCodes.push(req.responseStatus);

      const method = req.method.toUpperCase();
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    }

    const intervals = [];
    for (let i = 1; i < requests.length; i++) {
      intervals.push(requests[i].timestamp - requests[i - 1].timestamp);
    }

    return {
      totalRequests: requests.length,
      uniqueRoutes,
      idsPerRoute,
      statusCodes,
      intervals,
      methodCounts,
      requests,
    };
  }

  return { addRequest, getState, computeMetrics };
}

/** Default singleton tracker for production use. */
export const tracker = createTracker();
