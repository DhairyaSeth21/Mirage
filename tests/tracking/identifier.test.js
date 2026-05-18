import { describe, test, expect } from '@jest/globals';
import { getFingerprint } from '../../src/tracking/identifier.js';

function makeReq({ ip = '127.0.0.1', userAgent = 'TestAgent/1.0', acceptLanguage = 'en-US', acceptEncoding = 'gzip' } = {}) {
  return {
    socket: { remoteAddress: ip },
    headers: {
      'user-agent': userAgent,
      'accept-language': acceptLanguage,
      'accept-encoding': acceptEncoding,
    },
  };
}

describe('getFingerprint', () => {
  test('same IP + same headers → same fingerprint', () => {
    const req1 = makeReq();
    const req2 = makeReq();
    expect(getFingerprint(req1)).toBe(getFingerprint(req2));
  });

  test('different IP + same headers → different fingerprint', () => {
    const req1 = makeReq({ ip: '10.0.0.1' });
    const req2 = makeReq({ ip: '10.0.0.2' });
    expect(getFingerprint(req1)).not.toBe(getFingerprint(req2));
  });

  test('same IP + different User-Agent → different fingerprint', () => {
    const req1 = makeReq({ userAgent: 'Chrome/120' });
    const req2 = makeReq({ userAgent: 'curl/7.88' });
    expect(getFingerprint(req1)).not.toBe(getFingerprint(req2));
  });

  test('missing headers do not crash (empty string defaults)', () => {
    const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
    expect(() => getFingerprint(req)).not.toThrow();
    expect(typeof getFingerprint(req)).toBe('string');
    expect(getFingerprint(req).length).toBeGreaterThan(0);
  });

  test('missing socket does not crash', () => {
    const req = { headers: {} };
    expect(() => getFingerprint(req)).not.toThrow();
  });

  test('fingerprint is a hex string of fixed length', () => {
    const fp = getFingerprint(makeReq());
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});
