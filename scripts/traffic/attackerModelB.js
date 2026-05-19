/**
 * Model B — Adaptive binary-search scraper.
 * Discovers the max valid user ID via binary search, then sweeps all valid IDs
 * and follows sub-resources (orders, profile).
 */

/**
 * Returns a random integer in [80, 200] — the low-variance timing for Model B.
 * Uniform over that range gives CV ≈ 0.247, which satisfies 0.1 < CV < 0.3.
 * @returns {number}
 */
export function generateInterval() {
  return Math.floor(Math.random() * 121) + 80; // [80, 200]
}

/**
 * Simulates a binary search for the highest valid user ID and records every probe.
 * Assumes IDs 1…maxValidId respond 200; anything above responds 404.
 *
 * @param {number} maxValidId - The true upper boundary of valid IDs
 * @param {number} maxProbeId - The upper bound to start the binary search from
 * @returns {Array<{ id: number, hit: boolean }>}
 */
export function computeBinarySearchSequence(maxValidId, maxProbeId) {
  const probes = [];
  let low = 1;
  let high = maxProbeId;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const hit = mid <= maxValidId;
    probes.push({ id: mid, hit });
    if (hit) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return probes;
}

/**
 * Model B — Adaptive binary-search scraper.
 * Discovers the max valid user ID via binary search, then sweeps all valid IDs
 * and follows sub-resources (orders, profile).
 *
 * @param {object} options
 * @param {string}   options.baseUrl           Target origin (e.g. 'http://localhost:3000')
 * @param {string}   [options.sessionId]       Session identifier (auto-generated if omitted)
 * @param {number}   [options.maxProbeId=500]  Upper bound for binary search
 * @param {boolean}  [options.verbose=false]   Log each request to stdout
 * @param {Function} [options.httpClient]      Injectable HTTP client (defaults to native fetch wrapper)
 * @param {Function} [options.sleepFn]         Injectable sleep function (defaults to setTimeout)
 * @param {string}   [options.outputFile]      JSONL file path to append entries to
 * @returns {Promise<object[]>}  Array of request records
 */
export async function attackerModelB({
  baseUrl,
  sessionId,
  maxProbeId = 500,
  verbose = false,
  httpClient,
  sleepFn,
  outputFile,
} = {}) {
  const { defaultHttpClient, defaultSleep } = await import('./helpers.js');
  const doRequest = httpClient ?? defaultHttpClient;
  const doSleep = sleepFn ?? defaultSleep;
  const sid = sessionId ?? `model_b_${Date.now()}`;
  const headers = { 'User-Agent': 'Go-http-client/1.1' };
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
      client_type: 'model_b',
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

  // ── Phase 1: Discovery ──────────────────────────────────────────────────────
  await execute('/users');
  await doSleep(generateInterval());

  // ── Phase 2: Binary search for the highest valid user ID ───────────────────
  let low = 1;
  let high = maxProbeId;
  let maxFound = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const result = await execute(`/users/${mid}`);
    if (result.status === 200) {
      maxFound = Math.max(maxFound, mid);
      low = mid + 1;
    } else {
      high = mid - 1;
    }
    await doSleep(generateInterval());
  }
  const maxValidId = maxFound;

  // ── Phase 3+4: Extraction then sub-resource traversal ─────────────────────
  for (let id = 1; id <= maxValidId; id++) {
    const userResult = await execute(`/users/${id}`);
    if (userResult.status === 200) {
      await doSleep(generateInterval());
      await execute(`/users/${id}/orders`);
      await doSleep(generateInterval());
      await execute(`/users/${id}/profile`);
    }
    await doSleep(generateInterval());
  }

  return entries;
}
