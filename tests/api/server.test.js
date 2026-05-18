import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { createApp } from '../../src/api/server.js';
import { seedDb } from '../../src/api/seed/seedDatabase.js';

let server;
let baseUrl;

beforeAll(async () => {
  const db = new Database(':memory:');
  seedDb(db);
  const app = createApp(db);

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('GET /users', () => {
  test('returns 200 with correct paginated shape', async () => {
    const res = await fetch(`${baseUrl}/users`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('totalPages');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBe(200);
    expect(body.page).toBe(1);
  });

  test('page 1 and page 2 return different users', async () => {
    const page1 = await fetch(`${baseUrl}/users?page=1`).then((r) => r.json());
    const page2 = await fetch(`${baseUrl}/users?page=2`).then((r) => r.json());
    expect(page1.page).toBe(1);
    expect(page2.page).toBe(2);
    expect(page1.data.length).toBeGreaterThan(0);
    expect(page2.data.length).toBeGreaterThan(0);
    expect(page1.data[0].id).not.toBe(page2.data[0].id);
  });

  test('user records have expected fields', async () => {
    const body = await fetch(`${baseUrl}/users`).then((r) => r.json());
    const user = body.data[0];
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('createdAt');
  });
});

describe('GET /users/:id', () => {
  test('returns 200 with user data for valid ID', async () => {
    const res = await fetch(`${baseUrl}/users/1`);
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user).toHaveProperty('id', 1);
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('createdAt');
  });

  test('returns 404 for nonexistent user', async () => {
    const res = await fetch(`${baseUrl}/users/9999`);
    expect(res.status).toBe(404);
  });
});

describe('GET /users/:id/orders', () => {
  test('returns orders belonging to the specified user', async () => {
    const res = await fetch(`${baseUrl}/users/1/orders`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    body.data.forEach((order) => expect(order.userId).toBe(1));
  });

  test('returns 404 when user does not exist', async () => {
    const res = await fetch(`${baseUrl}/users/9999/orders`);
    expect(res.status).toBe(404);
  });

  test('orders have expected fields', async () => {
    const body = await fetch(`${baseUrl}/users/1/orders`).then((r) => r.json());
    const order = body.data[0];
    expect(order).toHaveProperty('id');
    expect(order).toHaveProperty('userId');
    expect(order).toHaveProperty('total');
    expect(order).toHaveProperty('status');
    expect(order).toHaveProperty('createdAt');
  });
});

describe('GET /users/:id/profile', () => {
  test('returns profile for valid user', async () => {
    const res = await fetch(`${baseUrl}/users/1/profile`);
    expect(res.status).toBe(200);
    const profile = await res.json();
    expect(profile).toHaveProperty('userId', 1);
    expect(profile).toHaveProperty('email');
    expect(profile).toHaveProperty('phone');
    expect(profile).toHaveProperty('address');
    expect(profile).toHaveProperty('bio');
  });

  test('returns 404 for nonexistent user', async () => {
    const res = await fetch(`${baseUrl}/users/9999/profile`);
    expect(res.status).toBe(404);
  });
});

describe('GET /orders/:id', () => {
  test('returns 200 with order data for valid ID', async () => {
    const res = await fetch(`${baseUrl}/orders/1`);
    expect(res.status).toBe(200);
    const order = await res.json();
    expect(order).toHaveProperty('id', 1);
    expect(order).toHaveProperty('userId');
    expect(order).toHaveProperty('total');
    expect(order).toHaveProperty('status');
    expect(order).toHaveProperty('createdAt');
  });

  test('returns 404 for nonexistent order', async () => {
    const res = await fetch(`${baseUrl}/orders/999999`);
    expect(res.status).toBe(404);
  });
});

describe('GET /orders/:id/items', () => {
  test('returns items for valid order', async () => {
    const res = await fetch(`${baseUrl}/orders/1/items`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    body.data.forEach((item) => expect(item.orderId).toBe(1));
  });

  test('returns 404 for nonexistent order', async () => {
    const res = await fetch(`${baseUrl}/orders/999999/items`);
    expect(res.status).toBe(404);
  });
});

describe('GET /items/:id', () => {
  test('returns 200 with item data for valid ID', async () => {
    const res = await fetch(`${baseUrl}/items/1`);
    expect(res.status).toBe(200);
    const item = await res.json();
    expect(item).toHaveProperty('id', 1);
    expect(item).toHaveProperty('orderId');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('price');
    expect(item).toHaveProperty('quantity');
  });

  test('returns 404 for nonexistent item', async () => {
    const res = await fetch(`${baseUrl}/items/999999`);
    expect(res.status).toBe(404);
  });
});

describe('POST /auth/login', () => {
  test('returns a token for any username and password', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'secret' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  test('returns 400 when username or password is missing', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice' }),
    });
    expect(res.status).toBe(400);
  });
});
