import { describe, test, expect } from '@jest/globals';
import {
  generateDecoyUser,
  generateDecoyOrder,
  generateDecoyItem,
  generateDecoyProfile,
} from '../../src/response/decoyGenerator.js';

describe('generateDecoyUser', () => {
  test('returns all required fields', () => {
    const user = generateDecoyUser(1001);
    expect(user).toHaveProperty('id', 1001);
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('createdAt');
    expect(typeof user.name).toBe('string');
    expect(user.name.length).toBeGreaterThan(0);
  });

  test('same decoyId always produces identical output (deterministic)', () => {
    const a = generateDecoyUser(1042);
    const b = generateDecoyUser(1042);
    expect(a).toEqual(b);
  });

  test('different decoyIds produce different output', () => {
    const a = generateDecoyUser(1001);
    const b = generateDecoyUser(1002);
    expect(a.name).not.toBe(b.name);
  });

  test('email follows realistic format (local@domain.tld)', () => {
    const user = generateDecoyUser(1005);
    expect(user.email).toMatch(/^[a-z0-9.]+@[a-z]+\.[a-z]+$/);
  });
});

describe('generateDecoyOrder', () => {
  test('returns all required fields', () => {
    const order = generateDecoyOrder(2001, 42);
    expect(order).toHaveProperty('id', 2001);
    expect(order).toHaveProperty('userId', 42);
    expect(order).toHaveProperty('total');
    expect(order).toHaveProperty('status');
    expect(order).toHaveProperty('createdAt');
  });

  test('total is within expected range ($10–$500)', () => {
    for (let id = 2001; id <= 2020; id++) {
      const order = generateDecoyOrder(id, 1);
      expect(order.total).toBeGreaterThanOrEqual(10);
      expect(order.total).toBeLessThanOrEqual(500);
    }
  });

  test('status is one of pending/shipped/delivered', () => {
    const validStatuses = ['pending', 'shipped', 'delivered'];
    for (let id = 2001; id <= 2010; id++) {
      const order = generateDecoyOrder(id, 1);
      expect(validStatuses).toContain(order.status);
    }
  });

  test('deterministic per decoyId', () => {
    expect(generateDecoyOrder(2042, 5)).toEqual(generateDecoyOrder(2042, 5));
  });
});

describe('generateDecoyItem', () => {
  test('returns all required fields', () => {
    const item = generateDecoyItem(3001, 100);
    expect(item).toHaveProperty('id', 3001);
    expect(item).toHaveProperty('orderId', 100);
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('price');
    expect(item).toHaveProperty('quantity');
  });

  test('price is a positive number', () => {
    const item = generateDecoyItem(3001, 100);
    expect(item.price).toBeGreaterThan(0);
  });

  test('quantity is a positive integer', () => {
    const item = generateDecoyItem(3001, 100);
    expect(Number.isInteger(item.quantity)).toBe(true);
    expect(item.quantity).toBeGreaterThan(0);
  });

  test('deterministic per decoyId', () => {
    expect(generateDecoyItem(3042, 10)).toEqual(generateDecoyItem(3042, 10));
  });
});

describe('generateDecoyProfile', () => {
  test('returns all required fields', () => {
    const profile = generateDecoyProfile(99);
    expect(profile).toHaveProperty('userId', 99);
    expect(profile).toHaveProperty('email');
    expect(profile).toHaveProperty('phone');
    expect(profile).toHaveProperty('address');
    expect(profile).toHaveProperty('bio');
  });

  test('phone follows 555-XXX-XXXX format', () => {
    const profile = generateDecoyProfile(99);
    expect(profile.phone).toMatch(/^555-\d{3}-\d{4}$/);
  });

  test('deterministic per userId', () => {
    expect(generateDecoyProfile(42)).toEqual(generateDecoyProfile(42));
  });
});
