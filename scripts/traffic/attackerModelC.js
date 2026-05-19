/**
 * Model C — Graph-walking traversal bot.
 * Starts at /users, then for each user follows the full resource graph:
 * user → profile → orders → items. Mimics human timing variance.
 */

/** Realistic browser User-Agent used by all Model C requests. */
export const MODEL_C_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Returns a random integer in [200, 2000] — the moderate-variance timing for Model C.
 * Uniform over that range gives CV ≈ 0.47, which satisfies 0.3 < CV < 0.7.
 * @returns {number}
 */
export function generateInterval() {
  return Math.floor(Math.random() * 1801) + 200; // [200, 2000]
}

/**
 * Builds the ordered list of paths to request for a single user's full resource chain.
 * Order: user object → profile → orders → items for each provided order ID.
 *
 * @param {number} userId - The user ID to build the chain for
 * @param {number[]} orderIds - The order IDs belonging to this user
 * @returns {string[]}
 */
export function buildTraversalChain(userId, orderIds) {
  const chain = [
    `/users/${userId}`,
    `/users/${userId}/profile`,
    `/users/${userId}/orders`,
    ...orderIds.map((orderId) => `/orders/${orderId}/items`),
  ];
  return chain;
}

/**
 * Model C — Graph-walking traversal bot.
 * Pages through /users to discover user IDs, then for each user walks the full
 * resource graph: user → profile → orders → items for the first order.
 *
 * @param {object} options
 * @param {string}   options.baseUrl          Target origin (e.g. 'http://localhost:3000')
 * @param {string}   [options.sessionId]      Session identifier (auto-generated if omitted)
 * @param {number}   [options.maxUsers=50]    How many users to traverse before stopping
 * @param {boolean}  [options.verbose=false]  Log each request to stdout
 * @param {Function} [options.httpClient]     Injectable HTTP client (defaults to native fetch wrapper)
 * @param {Function} [options.sleepFn]        Injectable sleep function (defaults to setTimeout)
 * @param {string}   [options.outputFile]     JSONL file path to append entries to
 * @returns {Promise<object[]>}  Array of request records
 */
export async function attackerModelC({
  baseUrl,
  sessionId,
  maxUsers = 50,
  verbose = false,
  httpClient,
  sleepFn,
  outputFile,
} = {}) {
  const { defaultHttpClient, defaultSleep } = await import('./helpers.js');
  const doRequest = httpClient ?? defaultHttpClient;
  const doSleep = sleepFn ?? defaultSleep;
  const sid = sessionId ?? `model_c_${Date.now()}`;
  const headers = {
    'User-Agent': MODEL_C_USER_AGENT,
    'Accept': 'application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const entries = [];

  /**
   * Makes one GET request, builds a log entry, and returns the raw HTTP result.
   * @param {string} path
   * @returns {Promise<object>}
   */
  const execute = async (path) => {
    const url = `${baseUrl}${path}`;
    const callStart = Date.now();
    const result = await doRequest('GET', url, { headers });
    const latencyMs = result.latencyMs ?? (Date.now() - callStart);
    const entry = {
      session_id: sid,
      client_type: 'model_c',
      timestamp: new Date().toISOString(),
      method: 'GET',
      path,
      status: result.status,
      latency_ms: latencyMs,
    };
    entries.push(entry);
    if (verbose) process.stdout.write(JSON.stringify(entry) + '\n');
    if (outputFile) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(outputFile, JSON.stringify(entry) + '\n');
    }
    return result;
  };

  // ── Discover user IDs by paging through the user list ──────────────────────
  const discoveredUserIds = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && discoveredUserIds.length < maxUsers) {
    const result = await execute(`/users?page=${page}`);
    await doSleep(generateInterval());

    if (result.status === 200 && Array.isArray(result.body?.data)) {
      for (const user of result.body.data) {
        discoveredUserIds.push(user.id);
        if (discoveredUserIds.length >= maxUsers) break;
      }
      totalPages = result.body.totalPages ?? 1;
    }
    page++;
  }

  // ── Walk the resource graph for each discovered user ───────────────────────
  for (const userId of discoveredUserIds) {
    // User detail
    await execute(`/users/${userId}`);
    await doSleep(generateInterval());

    // Profile
    await execute(`/users/${userId}/profile`);
    await doSleep(generateInterval());

    // Orders — capture body to follow the first order's items
    const ordersResult = await execute(`/users/${userId}/orders`);
    await doSleep(generateInterval());

    const orders = ordersResult.body?.data ?? [];
    if (orders.length > 0) {
      await execute(`/orders/${orders[0].id}/items`);
      await doSleep(generateInterval());
    }
  }

  return entries;
}
