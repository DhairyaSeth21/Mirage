/**
 * Shared utilities for traffic generators.
 */

/**
 * Returns a random integer between min and max inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random element from arr.
 * @param {any[]} arr
 * @returns {any}
 */
export function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Default HTTP client using native fetch (Node.js v18+).
 * Returns { status, body, size, latencyMs }.
 * @param {string} method
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<{status: number, body: any, size: number, latencyMs: number}>}
 */
export async function defaultHttpClient(method, url, options = {}) {
  const fetchOptions = { method, headers: options.headers ?? {} };
  if (options.body) fetchOptions.body = options.body;
  const start = Date.now();
  const response = await fetch(url, fetchOptions);
  const latencyMs = Date.now() - start;
  let body = {};
  try { body = await response.json(); } catch {}
  const size = Number(response.headers.get('content-length') ?? 0);
  return { status: response.status, body, size, latencyMs };
}

/**
 * Default sleep using setTimeout.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export async function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
