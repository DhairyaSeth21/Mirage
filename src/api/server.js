import express from 'express';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import { config } from '../config.js';

/**
 * Creates an Express application backed by the given SQLite database instance.
 * The database must already have tables created (see seedDb).
 * @param {import('better-sqlite3').Database} db
 * @returns {import('express').Application}
 */
export function createApp(db) {
  const app = express();
  app.use(express.json());

  // Prepared statements — compiled once, reused per request
  const stmts = {
    listUsers: db.prepare(
      'SELECT id, name, email, created_at AS createdAt FROM users LIMIT ? OFFSET ?',
    ),
    countUsers: db.prepare('SELECT COUNT(*) AS count FROM users'),
    getUser: db.prepare(
      'SELECT id, name, email, created_at AS createdAt FROM users WHERE id = ?',
    ),
    getUserEmail: db.prepare('SELECT email FROM users WHERE id = ?'),
    getUserOrders: db.prepare(
      'SELECT id, user_id AS userId, total, status, created_at AS createdAt FROM orders WHERE user_id = ?',
    ),
    getUserProfile: db.prepare(
      'SELECT user_id AS userId, phone, address, bio FROM profiles WHERE user_id = ?',
    ),
    getOrder: db.prepare(
      'SELECT id, user_id AS userId, total, status, created_at AS createdAt FROM orders WHERE id = ?',
    ),
    getOrderItems: db.prepare(
      'SELECT id, order_id AS orderId, name, price, quantity FROM items WHERE order_id = ?',
    ),
    getItem: db.prepare(
      'SELECT id, order_id AS orderId, name, price, quantity FROM items WHERE id = ?',
    ),
  };

  /** GET /users — paginated list */
  app.get('/users', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const users = stmts.listUsers.all(limit, offset);
    const total = stmts.countUsers.get().count;
    const totalPages = Math.ceil(total / limit);

    res.json({ data: users, page, totalPages, total });
  });

  /** GET /users/:id — single user */
  app.get('/users/:id', (req, res) => {
    const user = stmts.getUser.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  /** GET /users/:id/orders — all orders for a user */
  app.get('/users/:id/orders', (req, res) => {
    const user = stmts.getUser.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const orders = stmts.getUserOrders.all(req.params.id);
    res.json({ data: orders });
  });

  /** GET /users/:id/profile — extended user profile */
  app.get('/users/:id/profile', (req, res) => {
    const user = stmts.getUserEmail.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const profile = stmts.getUserProfile.get(req.params.id);
    res.json({ ...profile, email: user.email });
  });

  /** GET /orders/:id — single order */
  app.get('/orders/:id', (req, res) => {
    const order = stmts.getOrder.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  });

  /** GET /orders/:id/items — items in an order */
  app.get('/orders/:id/items', (req, res) => {
    const order = stmts.getOrder.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = stmts.getOrderItems.all(req.params.id);
    res.json({ data: items });
  });

  /** GET /items/:id — single item */
  app.get('/items/:id', (req, res) => {
    const item = stmts.getItem.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  });

  /** POST /auth/login — returns a session token for any valid credentials */
  app.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    res.json({ token: uuidv4() });
  });

  return app;
}

// When invoked directly: open the production database and start the server
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync('./data', { recursive: true });
  const db = new Database('./data/mirage.db');
  const app = createApp(db);
  app.listen(config.API_PORT, () => {
    console.log(`API listening on port ${config.API_PORT}`);
  });
}
