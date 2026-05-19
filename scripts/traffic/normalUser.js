/**
 * Normal user traffic simulator.
 * Simulates realistic human API usage: narrow resource scope, variable timing,
 * mandatory reading pauses that guarantee CV > 0.5 across all timing distributions.
 */

import { appendFileSync } from 'node:fs';
import { defaultHttpClient, defaultSleep, randomBetween, randomElement } from './helpers.js';

const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

/**
 * Simulates a human user browsing their own resources.
 * Accesses only the user's own data (user object, profile, orders) plus items
 * that belong to their orders — never other users' data.
 *
 * @param {object} options
 * @param {string} options.baseUrl - Proxy base URL
 * @param {number} options.userId - The user ID this session belongs to
 * @param {number} [options.sessionDuration=300] - Approximate session length in seconds
 * @param {boolean} [options.verbose=false] - Print each request to stdout
 * @param {Function} [options.httpClient] - Injectable HTTP client (for testing)
 * @param {Function} [options.sleepFn] - Injectable sleep function (for testing)
 * @param {string} [options.outputFile] - JSONL file path to append entries to
 * @returns {Promise<object[]>} Array of JSONL log entries
 */
export async function normalUser({
  baseUrl,
  userId,
  sessionDuration = 300,
  verbose = false,
  httpClient,
  sleepFn,
  outputFile,
} = {}) {
  const doRequest = httpClient ?? defaultHttpClient;
  const doSleep = sleepFn ?? defaultSleep;
  const sessionId = `normal_${String(userId).padStart(3, '0')}`;
  const userAgent = randomElement(BROWSER_USER_AGENTS);
  const entries = [];

  /**
   * Makes one HTTP request, records a log entry, and returns the raw result.
   */
  const execute = async (method, path, bodyData = null) => {
    const url = `${baseUrl}${path}`;
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const options = { headers };
    if (bodyData) {
      options.body = JSON.stringify(bodyData);
      headers['Content-Type'] = 'application/json';
    }
    const callStart = Date.now();
    const result = await doRequest(method, url, options);
    const latencyMs = result.latencyMs ?? (Date.now() - callStart);
    const entry = {
      session_id: sessionId,
      client_type: 'normal',
      timestamp: new Date().toISOString(),
      method,
      path,
      status: result.status,
      latency_ms: latencyMs,
    };
    entries.push(entry);
    if (verbose) console.log(JSON.stringify(entry));
    if (outputFile) appendFileSync(outputFile, JSON.stringify(entry) + '\n');
    return result;
  };

  // Step 1: Login (POST — ensures non-GET in method distribution)
  await execute('POST', '/auth/login', { username: `user${userId}`, password: 'password' });
  await doSleep(randomBetween(1000, 3000));

  // Step 2: Own user object
  await execute('GET', `/users/${userId}`);
  await doSleep(randomBetween(1000, 5000));

  // Step 3: Own profile
  await execute('GET', `/users/${userId}/profile`);
  await doSleep(randomBetween(1000, 4000));

  // Step 4: Own orders
  const ordersResult = await execute('GET', `/users/${userId}/orders`);

  // Mandatory reading pause — user reads their order list.
  // This large delay (25–60s) combined with short inter-request delays (1–5s)
  // guarantees CV > 0.5 in all random outcomes.
  await doSleep(randomBetween(25000, 60000));

  const orderIds = ordersResult.body?.orders?.map(o => o.id) ?? [];
  const maxOrdersToExplore = Math.min(2, orderIds.length);
  const ordersToExplore = maxOrdersToExplore > 0
    ? orderIds.slice(0, randomBetween(1, maxOrdersToExplore))
    : [];

  for (const orderId of ordersToExplore) {
    const itemsResult = await execute('GET', `/orders/${orderId}/items`);
    await doSleep(randomBetween(2000, 8000));

    const items = itemsResult.body?.items ?? [];
    const maxItemsToView = Math.min(3, items.length);
    const itemsToView = maxItemsToView > 0
      ? items.slice(0, randomBetween(1, maxItemsToView))
      : [];

    for (const item of itemsToView) {
      await execute('GET', `/items/${item.id}`);
      await doSleep(randomBetween(1000, 4000));
    }

    // 40% chance of an extra reading pause per order
    if (Math.random() < 0.4) {
      await doSleep(randomBetween(25000, 50000));
    }
  }

  return entries;
}
