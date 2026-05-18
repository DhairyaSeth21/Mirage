import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createLogger } from '../../src/logging/logger.js';

describe('logger', () => {
  let testLogDir;
  let testLogFile;
  let logRequest;

  beforeEach(() => {
    testLogDir = join(tmpdir(), `mirage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    testLogFile = join(testLogDir, 'requests.jsonl');
    logRequest = createLogger(testLogFile);
  });

  afterEach(() => {
    rmSync(testLogDir, { recursive: true, force: true });
  });

  test('creates the log file if it does not exist', () => {
    expect(existsSync(testLogFile)).toBe(false);
    logRequest({
      timestamp: new Date().toISOString(),
      method: 'GET',
      path: '/users',
      status: 200,
      latencyMs: 10,
      clientIp: '127.0.0.1',
      userAgent: 'test',
    });
    expect(existsSync(testLogFile)).toBe(true);
  });

  test('appends a valid JSON line per call', () => {
    const entry1 = {
      timestamp: '2024-01-01T00:00:00.000Z',
      method: 'GET',
      path: '/users',
      status: 200,
      latencyMs: 10,
      clientIp: '127.0.0.1',
      userAgent: 'test-agent',
    };
    const entry2 = {
      timestamp: '2024-01-01T00:00:01.000Z',
      method: 'POST',
      path: '/auth/login',
      status: 200,
      latencyMs: 5,
      clientIp: '127.0.0.1',
      userAgent: 'test-agent',
    };

    logRequest(entry1);
    logRequest(entry2);

    const lines = readFileSync(testLogFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject(entry1);
    expect(JSON.parse(lines[1])).toMatchObject(entry2);
  });

  test('includes all required fields', () => {
    const entry = {
      timestamp: '2024-01-01T00:00:00.000Z',
      method: 'GET',
      path: '/items/1',
      status: 404,
      latencyMs: 3,
      clientIp: '10.0.0.1',
      userAgent: 'curl/7.0',
    };
    logRequest(entry);

    const logged = JSON.parse(readFileSync(testLogFile, 'utf-8').trim());
    expect(logged).toHaveProperty('timestamp');
    expect(logged).toHaveProperty('method');
    expect(logged).toHaveProperty('path');
    expect(logged).toHaveProperty('status');
    expect(logged).toHaveProperty('latencyMs');
    expect(logged).toHaveProperty('clientIp');
    expect(logged).toHaveProperty('userAgent');
  });

  test('each line is valid JSON even after multiple writes', () => {
    for (let i = 0; i < 10; i++) {
      logRequest({
        timestamp: new Date().toISOString(),
        method: 'GET',
        path: `/users/${i}`,
        status: 200,
        latencyMs: i,
        clientIp: '127.0.0.1',
        userAgent: 'test',
      });
    }

    const lines = readFileSync(testLogFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(10);
    lines.forEach((line) => expect(() => JSON.parse(line)).not.toThrow());
  });
});
