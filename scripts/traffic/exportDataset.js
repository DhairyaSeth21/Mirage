import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';

/**
 * Replaces numeric path segments with the :id placeholder.
 * @param {string} urlPath
 * @returns {string}
 */
export function normalizePath(urlPath) {
  return urlPath.replace(/\/(\d+)(?=[/?]|$)/g, '/:id');
}

/**
 * Extracts all numeric IDs from a URL path.
 * @param {string} urlPath
 * @returns {string[]}
 */
export function extractIds(urlPath) {
  const matches = urlPath.match(/\/(\d+)(?=[/?]|$)/g) ?? [];
  return matches.map((segment) => segment.replace(/^\//, ''));
}

/**
 * Computes the coefficient of variation (stddev / mean) for an array of numbers.
 * Returns 0 for arrays with fewer than two elements or with a zero mean.
 * @param {number[]} values
 * @returns {number}
 */
export function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Escapes a single CSV field value: wraps in quotes if the value contains
 * commas, double-quotes, or newlines.
 * @param {string} value
 * @returns {string}
 */
function escapeCsvField(value) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialises an array of field values as a CSV row.
 * @param {string[]} fields
 * @returns {string}
 */
function toCsvRow(fields) {
  return fields.map((f) => escapeCsvField(String(f ?? ''))).join(',');
}

const REQUEST_HEADERS = [
  'timestamp', 'session_id', 'client_type', 'method', 'path',
  'normalized_route', 'extracted_ids', 'response_status', 'response_size', 'user_agent',
];

const SESSION_HEADERS = [
  'session_id', 'client_type', 'total_requests', 'unique_routes',
  'max_ids_per_route', 'avg_interval_ms', 'cv_interval', 'pct_get', 'duration_s',
];

/**
 * Reads a JSONL dataset file and exports two CSV files:
 * one with per-request rows and one with per-session summary rows.
 *
 * @param {Object} [options]
 * @param {string} [options.inputPath] - Path to dataset.jsonl
 * @param {string} [options.requestCsvPath] - Destination for the request-level CSV
 * @param {string} [options.sessionCsvPath] - Destination for the session-level summary CSV
 * @returns {Promise<{ requestCount: number, sessionCount: number }>}
 */
export async function exportDataset(options = {}) {
  const {
    inputPath = 'data/dataset.jsonl',
    requestCsvPath = 'data/dataset.csv',
    sessionCsvPath = 'data/sessions.csv',
  } = options;

  const raw = await readFile(inputPath, 'utf8');
  const records = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

  // ── Request-level CSV ──────────────────────────────────────────────────────
  const requestRows = [
    REQUEST_HEADERS.join(','),
    ...records.map((r) => {
      const normalizedRoute = normalizePath(r.path ?? '');
      const extractedIds = JSON.stringify(extractIds(r.path ?? ''));
      return toCsvRow([
        r.timestamp ?? '',
        r.session_id ?? '',
        r.client_type ?? '',
        r.method ?? '',
        r.path ?? '',
        normalizedRoute,
        extractedIds,
        r.status ?? '',
        r.response_size ?? '',
        r.user_agent ?? '',
      ]);
    }),
  ];
  await writeFile(requestCsvPath, requestRows.join('\n') + '\n', 'utf8');

  // ── Session-level summary CSV ──────────────────────────────────────────────
  const sessionMap = new Map();
  for (const record of records) {
    const { session_id: sessionId, client_type: clientType } = record;
    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        sessionId,
        clientType,
        requests: [],
        routes: new Set(),
        idsByRoute: new Map(),
        timestamps: [],
      });
    }
    const session = sessionMap.get(sessionId);
    session.requests.push(record);

    const normalizedRoute = normalizePath(record.path ?? '');
    session.routes.add(normalizedRoute);

    const ids = extractIds(record.path ?? '');
    if (!session.idsByRoute.has(normalizedRoute)) {
      session.idsByRoute.set(normalizedRoute, new Set());
    }
    for (const id of ids) {
      session.idsByRoute.get(normalizedRoute).add(id);
    }

    if (record.timestamp) {
      session.timestamps.push(new Date(record.timestamp).getTime());
    }
  }

  const sessionRows = [SESSION_HEADERS.join(',')];
  for (const session of sessionMap.values()) {
    const sortedTs = [...session.timestamps].sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < sortedTs.length; i++) {
      intervals.push(sortedTs[i] - sortedTs[i - 1]);
    }

    const avgIntervalMs = intervals.length > 0
      ? intervals.reduce((sum, v) => sum + v, 0) / intervals.length
      : 0;
    const cvInterval = coefficientOfVariation(intervals);

    const getCount = session.requests.filter((r) => r.method === 'GET').length;
    const pctGet = session.requests.length > 0 ? getCount / session.requests.length : 0;
    const durationS = sortedTs.length >= 2 ? (sortedTs[sortedTs.length - 1] - sortedTs[0]) / 1000 : 0;

    let maxIdsPerRoute = 0;
    for (const idSet of session.idsByRoute.values()) {
      if (idSet.size > maxIdsPerRoute) maxIdsPerRoute = idSet.size;
    }

    sessionRows.push(toCsvRow([
      session.sessionId,
      session.clientType,
      session.requests.length,
      session.routes.size,
      maxIdsPerRoute,
      avgIntervalMs.toFixed(2),
      cvInterval.toFixed(4),
      pctGet.toFixed(4),
      durationS.toFixed(2),
    ]));
  }

  await writeFile(sessionCsvPath, sessionRows.join('\n') + '\n', 'utf8');

  return { requestCount: records.length, sessionCount: sessionMap.size };
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  exportDataset()
    .then(({ requestCount, sessionCount }) => {
      console.log(`Exported ${requestCount} requests across ${sessionCount} sessions.`);
    })
    .catch((error) => {
      console.error('Export failed:', error);
      process.exit(1);
    });
}
