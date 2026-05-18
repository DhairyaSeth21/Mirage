import { describe, test, expect } from '@jest/globals';
import { poisonResponse } from '../../src/response/poison.js';

const REQUEST_INFO = {
  normalizedRoute: '/users/:id',
  extractedIds: [42],
  clientId: 'test-client',
};

const LIST_REQUEST_INFO = {
  normalizedRoute: '/users',
  extractedIds: [],
  clientId: 'test-client',
};

const EMPTY_METRICS = {
  totalRequests: 0,
  uniqueRoutes: new Set(),
  idsPerRoute: new Map(),
  statusCodes: [],
  intervals: [],
  methodCounts: {},
  requests: [],
};

function makeUser(id) {
  return { id, name: `User ${id}`, email: `user${id}@example.com`, createdAt: '2024-01-01T00:00:00.000Z' };
}

function makeListResponse(count = 5) {
  return {
    status: 200,
    body: JSON.stringify({ data: Array.from({ length: count }, (_, i) => makeUser(i + 1)) }),
  };
}

function makeIndividualResponse(id = 42) {
  return {
    status: 200,
    body: JSON.stringify({ id, name: 'Alice Smith', email: 'alice@company.com', createdAt: '2024-01-01T00:00:00.000Z' }),
  };
}

function makeProfileResponse(id = 42) {
  return {
    status: 200,
    body: JSON.stringify({ userId: id, email: 'alice@company.com', phone: '555-123-4567', address: '123 Main St', bio: 'Test bio.' }),
  };
}

describe('poisonResponse — passthrough for low levels', () => {
  test('level 0 → response passes through unchanged', () => {
    const realResponse = makeIndividualResponse();
    const result = poisonResponse(0, REQUEST_INFO, realResponse, EMPTY_METRICS);
    expect(result.body).toBe(realResponse.body);
    expect(result.status).toBe(200);
    expect(result.modifications).toEqual([]);
  });

  test('level 1 → response passes through unchanged', () => {
    const realResponse = makeListResponse();
    const result = poisonResponse(1, LIST_REQUEST_INFO, realResponse, EMPTY_METRICS);
    expect(result.body).toBe(realResponse.body);
    expect(result.modifications).toEqual([]);
  });

  test('level 2 → response passes through unchanged', () => {
    const realResponse = makeIndividualResponse();
    const result = poisonResponse(2, REQUEST_INFO, realResponse, EMPTY_METRICS);
    expect(result.body).toBe(realResponse.body);
    expect(result.modifications).toEqual([]);
  });
});

describe('poisonResponse — level 3 list response', () => {
  test('injects decoy records into the list', () => {
    const realResponse = makeListResponse(10);
    const result = poisonResponse(3, LIST_REQUEST_INFO, realResponse, EMPTY_METRICS);
    const parsed = JSON.parse(result.body);
    expect(parsed.data.length).toBeGreaterThan(10); // more records than original
    expect(result.modifications).toContain('decoy_injection');
  });

  test('decoy records have the same field structure as real records', () => {
    const realResponse = makeListResponse(5);
    const result = poisonResponse(3, LIST_REQUEST_INFO, realResponse, EMPTY_METRICS);
    const parsed = JSON.parse(result.body);
    const decoys = parsed.data.filter((u) => u.id > 1000);
    expect(decoys.length).toBeGreaterThan(0);
    decoys.forEach((decoy) => {
      expect(decoy).toHaveProperty('id');
      expect(decoy).toHaveProperty('name');
      expect(decoy).toHaveProperty('email');
      expect(decoy).toHaveProperty('createdAt');
    });
  });

  test('injected decoys have IDs outside the real range (≥ 1001)', () => {
    const realResponse = makeListResponse(10);
    const result = poisonResponse(3, LIST_REQUEST_INFO, realResponse, EMPTY_METRICS);
    const parsed = JSON.parse(result.body);
    const decoys = parsed.data.filter((u) => u.id > 1000);
    expect(decoys.length).toBeGreaterThan(0);
    decoys.forEach((decoy) => expect(decoy.id).toBeGreaterThanOrEqual(1001));
  });

  test('list order is shuffled (different from original sequential order)', () => {
    const realResponse = makeListResponse(20);
    const original = JSON.parse(realResponse.body).data.map((u) => u.id);

    // Run multiple times — at least one should be reordered
    let foundReordered = false;
    for (let i = 0; i < 10; i++) {
      const result = poisonResponse(3, LIST_REQUEST_INFO, realResponse, EMPTY_METRICS);
      const modified = JSON.parse(result.body).data.filter((u) => u.id <= 1000).map((u) => u.id);
      if (JSON.stringify(modified) !== JSON.stringify(original)) {
        foundReordered = true;
        break;
      }
    }
    expect(foundReordered).toBe(true);
    expect(result => poisonResponse(3, LIST_REQUEST_INFO, realResponse, EMPTY_METRICS).modifications).toBeTruthy();
  });
});

describe('poisonResponse — level 3 individual record', () => {
  test('mutates email field', () => {
    const realResponse = makeIndividualResponse(42);
    const result = poisonResponse(3, REQUEST_INFO, realResponse, EMPTY_METRICS);
    const original = JSON.parse(realResponse.body);
    const modified = JSON.parse(result.body);
    expect(modified.email).not.toBe(original.email);
  });

  test('does NOT mutate id or name fields', () => {
    const realResponse = makeIndividualResponse(42);
    const result = poisonResponse(3, REQUEST_INFO, realResponse, EMPTY_METRICS);
    const original = JSON.parse(realResponse.body);
    const modified = JSON.parse(result.body);
    expect(modified.id).toBe(original.id);
    expect(modified.name).toBe(original.name);
  });

  test('mutates phone field when present', () => {
    const realResponse = makeProfileResponse(42);
    const profileInfo = { normalizedRoute: '/users/:id/profile', extractedIds: [42], clientId: 'test' };
    const result = poisonResponse(3, profileInfo, realResponse, EMPTY_METRICS);
    const original = JSON.parse(realResponse.body);
    const modified = JSON.parse(result.body);
    expect(modified.phone).not.toBe(original.phone);
    expect(modified.userId).toBe(original.userId); // id fields unchanged
  });

  test('includes field_mutation in modifications', () => {
    const realResponse = makeIndividualResponse(42);
    const result = poisonResponse(3, REQUEST_INFO, realResponse, EMPTY_METRICS);
    expect(result.modifications).toContain('field_mutation');
  });
});

describe('poisonResponse — level 3 404 response', () => {
  test('404 response sometimes becomes 200 with decoy data', () => {
    const notFound = { status: 404, body: JSON.stringify({ error: 'Not found' }) };
    let sawFake200 = false;
    // Run many times — 50% chance each time, so ~1 in 2^20 chance all are 404
    for (let i = 0; i < 40; i++) {
      const result = poisonResponse(3, REQUEST_INFO, notFound, EMPTY_METRICS);
      if (result.status === 200) {
        sawFake200 = true;
        const body = JSON.parse(result.body);
        expect(body).toHaveProperty('id');
        break;
      }
    }
    expect(sawFake200).toBe(true);
  });
});
