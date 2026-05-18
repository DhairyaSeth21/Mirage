import { describe, test, expect } from '@jest/globals';
import { normalizeRoute } from '../../src/detection/routeNormalizer.js';

describe('normalizeRoute', () => {
  test('/users → route: /users, ids: []', () => {
    const result = normalizeRoute('/users');
    expect(result.normalizedRoute).toBe('/users');
    expect(result.extractedIds).toEqual([]);
  });

  test('/users/42 → route: /users/:id, ids: [42]', () => {
    const result = normalizeRoute('/users/42');
    expect(result.normalizedRoute).toBe('/users/:id');
    expect(result.extractedIds).toEqual([42]);
  });

  test('/users/42/orders → route: /users/:id/orders, ids: [42]', () => {
    const result = normalizeRoute('/users/42/orders');
    expect(result.normalizedRoute).toBe('/users/:id/orders');
    expect(result.extractedIds).toEqual([42]);
  });

  test('/users/42/orders/7/items → nested ids extracted correctly', () => {
    const result = normalizeRoute('/users/42/orders/7/items');
    expect(result.normalizedRoute).toBe('/users/:id/orders/:id/items');
    expect(result.extractedIds).toEqual([42, 7]);
  });

  test('/items/100 → route: /items/:id, ids: [100]', () => {
    const result = normalizeRoute('/items/100');
    expect(result.normalizedRoute).toBe('/items/:id');
    expect(result.extractedIds).toEqual([100]);
  });

  test('/auth/login → route: /auth/login, ids: []', () => {
    const result = normalizeRoute('/auth/login');
    expect(result.normalizedRoute).toBe('/auth/login');
    expect(result.extractedIds).toEqual([]);
  });

  test('UUID segments are treated as IDs', () => {
    const result = normalizeRoute('/sessions/550e8400-e29b-41d4-a716-446655440000');
    expect(result.normalizedRoute).toBe('/sessions/:id');
    expect(result.extractedIds).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
  });

  test('query strings are stripped before normalization', () => {
    const result = normalizeRoute('/users?page=2');
    expect(result.normalizedRoute).toBe('/users');
    expect(result.extractedIds).toEqual([]);
  });

  test('numeric ID with query string is handled', () => {
    const result = normalizeRoute('/users/42?include=orders');
    expect(result.normalizedRoute).toBe('/users/:id');
    expect(result.extractedIds).toEqual([42]);
  });
});
