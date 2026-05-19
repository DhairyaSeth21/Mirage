/**
 * Model A — Naive sequential enumerator.
 * Sweeps GET /users/1 through /users/N with fixed timing and no error adaptation.
 */

import { appendFileSync } from 'node:fs';
import { defaultHttpClient, defaultSleep } from './helpers.js';

const USER_AGENT = 'python-requests/2.28.0';

/**
 * Naive sequential enumerator bot.
 * Sweeps /users/:id from startId to endId with a fixed interval.
 * Continues regardless of 404 responses — no error adaptation.
 *
 * @param {object} options
 * @param {string} options.baseUrl - Proxy base URL
 * @param {number} [options.startId=1] - First user ID to probe
 * @param {number} [options.endId=200] - Last user ID to probe
 * @param {number} [options.intervalMs=120] - Fixed delay between requests in ms
 * @param {boolean} [options.verbose=false] - Print each request to stdout
 * @param {Function} [options.httpClient] - Injectable HTTP client (for testing)
 * @param {Function} [options.sleepFn] - Injectable sleep function (for testing)
 * @param {string} [options.outputFile] - JSONL file path to append entries to
 * @returns {Promise<object[]>} Array of JSONL log entries
 */
export async function attackerModelA({
  baseUrl,
  startId = 1,
  endId = 200,
  intervalMs = 120,
  verbose = false,
  httpClient,
  sleepFn,
  outputFile,
  sessionId: sessionIdOpt,
} = {}) {
  const doRequest = httpClient ?? defaultHttpClient;
  const doSleep = sleepFn ?? defaultSleep;
  const sessionId = sessionIdOpt ?? 'model_a_001';
  const entries = [];

  for (let id = startId; id <= endId; id++) {
    const path = `/users/${id}`;
    const url = `${baseUrl}${path}`;
    const headers = { 'User-Agent': USER_AGENT };
    const callStart = Date.now();
    const result = await doRequest('GET', url, { headers });
    const latencyMs = result.latencyMs ?? (Date.now() - callStart);

    const entry = {
      session_id: sessionId,
      client_type: 'model_a',
      timestamp: new Date().toISOString(),
      method: 'GET',
      path,
      status: result.status,
      latency_ms: latencyMs,
    };
    entries.push(entry);
    if (verbose) console.log(JSON.stringify(entry));
    if (outputFile) appendFileSync(outputFile, JSON.stringify(entry) + '\n');

    // Fixed interval between requests — sleep after every request except the last
    if (id < endId) await doSleep(intervalMs);
  }

  return entries;
}
