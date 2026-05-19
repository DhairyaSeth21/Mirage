import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  normalizePath,
  extractIds,
  coefficientOfVariation,
  exportDataset,
} from '../../scripts/traffic/exportDataset.js';

// Minimal CSV row parser that handles quoted fields.
function parseCsvRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

const VALID_CLIENT_TYPES = new Set(['normal', 'model_a', 'model_b', 'model_c']);

const REQUEST_HEADERS = [
  'timestamp', 'session_id', 'client_type', 'method', 'path',
  'normalized_route', 'extracted_ids', 'response_status', 'response_size', 'user_agent',
];

const SESSION_HEADERS = [
  'session_id', 'client_type', 'total_requests', 'unique_routes',
  'max_ids_per_route', 'avg_interval_ms', 'cv_interval', 'pct_get', 'duration_s',
];

// Sample dataset spanning all four client types and varied paths.
function makeRecords() {
  const t = 1_716_076_800_000;
  return [
    { session_id: 'normal_001', client_type: 'normal',  timestamp: new Date(t).toISOString(),        method: 'POST', path: '/auth/login',        status: 200, response_size: 128, user_agent: 'Mozilla/5.0 Chrome/124' },
    { session_id: 'normal_001', client_type: 'normal',  timestamp: new Date(t + 5000).toISOString(), method: 'GET',  path: '/users/42',          status: 200, response_size: 512, user_agent: 'Mozilla/5.0 Chrome/124' },
    { session_id: 'normal_001', client_type: 'normal',  timestamp: new Date(t + 15000).toISOString(), method: 'GET', path: '/users/42/orders',   status: 200, response_size: 256, user_agent: 'Mozilla/5.0 Chrome/124' },
    { session_id: 'model_a_001', client_type: 'model_a', timestamp: new Date(t + 1000).toISOString(), method: 'GET', path: '/users/1',           status: 200, response_size: 512, user_agent: 'python-requests/2.28.0' },
    { session_id: 'model_a_001', client_type: 'model_a', timestamp: new Date(t + 1120).toISOString(), method: 'GET', path: '/users/2',           status: 200, response_size: 512, user_agent: 'python-requests/2.28.0' },
    { session_id: 'model_b_001', client_type: 'model_b', timestamp: new Date(t + 2000).toISOString(), method: 'GET', path: '/users/100',         status: 200, response_size: 512, user_agent: 'Go-http-client/1.1' },
    { session_id: 'model_b_001', client_type: 'model_b', timestamp: new Date(t + 2150).toISOString(), method: 'GET', path: '/users/100/profile', status: 200, response_size: 256, user_agent: 'Go-http-client/1.1' },
    { session_id: 'model_c_001', client_type: 'model_c', timestamp: new Date(t + 3000).toISOString(), method: 'GET', path: '/users/10',          status: 200, response_size: 512, user_agent: 'Mozilla/5.0 Safari/17' },
    { session_id: 'model_c_001', client_type: 'model_c', timestamp: new Date(t + 4200).toISOString(), method: 'GET', path: '/users/10/profile',  status: 200, response_size: 256, user_agent: 'Mozilla/5.0 Safari/17' },
    { session_id: 'model_c_001', client_type: 'model_c', timestamp: new Date(t + 5500).toISOString(), method: 'GET', path: '/orders/55/items',   status: 200, response_size: 384, user_agent: 'Mozilla/5.0 Safari/17' },
  ];
}

async function writeJsonl(dir, records) {
  const inputPath = join(dir, 'dataset.jsonl');
  await writeFile(inputPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return inputPath;
}

describe('normalizePath', () => {
  test('replaces a single numeric segment with :id', () => {
    expect(normalizePath('/users/42')).toBe('/users/:id');
  });

  test('replaces multiple numeric segments', () => {
    expect(normalizePath('/users/42/orders/7')).toBe('/users/:id/orders/:id');
    expect(normalizePath('/orders/99/items')).toBe('/orders/:id/items');
  });

  test('leaves non-numeric path segments unchanged', () => {
    expect(normalizePath('/users')).toBe('/users');
    expect(normalizePath('/auth/login')).toBe('/auth/login');
  });

  test('handles root path', () => {
    expect(normalizePath('/')).toBe('/');
  });

  test('handles path with query string by preserving the query', () => {
    // Query strings contain no path IDs — the function should not mangle them
    const result = normalizePath('/users?page=1');
    expect(result).not.toMatch(/\/\d+/);
  });
});

describe('extractIds', () => {
  test('extracts a single ID', () => {
    expect(extractIds('/users/42')).toEqual(['42']);
  });

  test('extracts multiple IDs from nested paths', () => {
    expect(extractIds('/users/1/orders/2')).toEqual(['1', '2']);
  });

  test('returns empty array for paths with no numeric segments', () => {
    expect(extractIds('/users')).toEqual([]);
    expect(extractIds('/auth/login')).toEqual([]);
  });

  test('handles root path', () => {
    expect(extractIds('/')).toEqual([]);
  });
});

describe('coefficientOfVariation', () => {
  test('returns 0 for an empty array', () => {
    expect(coefficientOfVariation([])).toBe(0);
  });

  test('returns 0 for a single value', () => {
    expect(coefficientOfVariation([200])).toBe(0);
  });

  test('returns 0 when all values are identical (no variance)', () => {
    expect(coefficientOfVariation([100, 100, 100, 100])).toBe(0);
  });

  test('returns a positive value for varying inputs', () => {
    const cv = coefficientOfVariation([100, 50, 400, 200, 300]);
    expect(cv).toBeGreaterThan(0);
  });

  test('higher spread yields higher CV than tighter spread', () => {
    const tight = coefficientOfVariation([100, 110, 90, 105]);
    const wide = coefficientOfVariation([10, 500, 200, 5]);
    expect(wide).toBeGreaterThan(tight);
  });
});

describe('exportDataset', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mirage-export-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test('request CSV has all required headers', async () => {
    const inputPath = await writeJsonl(tmpDir, makeRecords());
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(requestCsvPath, 'utf8');
    const headers = parseCsvRow(csv.split('\n')[0]);

    for (const required of REQUEST_HEADERS) {
      expect(headers).toContain(required);
    }
  });

  test('request CSV has one data row per record', async () => {
    const records = makeRecords();
    const inputPath = await writeJsonl(tmpDir, records);
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(requestCsvPath, 'utf8');
    const lines = csv.trim().split('\n').filter((l) => l.length > 0);
    expect(lines.length - 1).toBe(records.length); // subtract header row
  });

  test('every data row has the same number of fields as the header', async () => {
    const inputPath = await writeJsonl(tmpDir, makeRecords());
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(requestCsvPath, 'utf8');
    const lines = csv.trim().split('\n').filter((l) => l.length > 0);
    const headerCount = parseCsvRow(lines[0]).length;

    for (let i = 1; i < lines.length; i++) {
      const fieldCount = parseCsvRow(lines[i]).length;
      expect(fieldCount).toBe(headerCount);
    }
  });

  test('client_type values are only the four valid types', async () => {
    const inputPath = await writeJsonl(tmpDir, makeRecords());
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(requestCsvPath, 'utf8');
    const lines = csv.trim().split('\n').filter((l) => l.length > 0);
    const headers = parseCsvRow(lines[0]);
    const typeIdx = headers.indexOf('client_type');

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvRow(lines[i]);
      expect(VALID_CLIENT_TYPES.has(fields[typeIdx])).toBe(true);
    }
  });

  test('normalized_route contains no raw numeric path segments', async () => {
    const inputPath = await writeJsonl(tmpDir, makeRecords());
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(requestCsvPath, 'utf8');
    const lines = csv.trim().split('\n').filter((l) => l.length > 0);
    const headers = parseCsvRow(lines[0]);
    const routeIdx = headers.indexOf('normalized_route');

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvRow(lines[i]);
      expect(fields[routeIdx]).not.toMatch(/\/\d+/);
    }
  });

  test('session summary CSV has all required headers', async () => {
    const inputPath = await writeJsonl(tmpDir, makeRecords());
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(sessionCsvPath, 'utf8');
    const headers = parseCsvRow(csv.split('\n')[0]);

    for (const required of SESSION_HEADERS) {
      expect(headers).toContain(required);
    }
  });

  test('session summary has exactly one row per unique session', async () => {
    const records = makeRecords();
    const uniqueSessions = new Set(records.map((r) => r.session_id)).size;
    const inputPath = await writeJsonl(tmpDir, records);
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(sessionCsvPath, 'utf8');
    const lines = csv.trim().split('\n').filter((l) => l.length > 0);
    expect(lines.length - 1).toBe(uniqueSessions);
  });

  test('session total_requests matches actual request count for that session', async () => {
    const records = makeRecords();
    const inputPath = await writeJsonl(tmpDir, records);
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(sessionCsvPath, 'utf8');
    const lines = csv.trim().split('\n').filter((l) => l.length > 0);
    const headers = parseCsvRow(lines[0]);
    const idIdx = headers.indexOf('session_id');
    const totalIdx = headers.indexOf('total_requests');

    // Count expected totals from source records
    const expectedCounts = {};
    for (const r of records) {
      expectedCounts[r.session_id] = (expectedCounts[r.session_id] ?? 0) + 1;
    }

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvRow(lines[i]);
      const sessionId = fields[idIdx];
      const reported = Number(fields[totalIdx]);
      expect(reported).toBe(expectedCounts[sessionId]);
    }
  });

  test('pct_get is 1.0 for sessions with only GET requests', async () => {
    const getOnlyRecords = makeRecords().filter(
      (r) => r.session_id === 'model_a_001',
    );
    const inputPath = await writeJsonl(tmpDir, getOnlyRecords);
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    const csv = await readFile(sessionCsvPath, 'utf8');
    const lines = csv.trim().split('\n').filter((l) => l.length > 0);
    const headers = parseCsvRow(lines[0]);
    const pctGetIdx = headers.indexOf('pct_get');

    const fields = parseCsvRow(lines[1]);
    expect(Number(fields[pctGetIdx])).toBeCloseTo(1.0, 4);
  });

  test('exportDataset returns correct requestCount and sessionCount', async () => {
    const records = makeRecords();
    const inputPath = await writeJsonl(tmpDir, records);
    const requestCsvPath = join(tmpDir, 'requests.csv');
    const sessionCsvPath = join(tmpDir, 'sessions.csv');

    const result = await exportDataset({ inputPath, requestCsvPath, sessionCsvPath });

    expect(result.requestCount).toBe(records.length);
    expect(result.sessionCount).toBe(new Set(records.map((r) => r.session_id)).size);
  });
});
