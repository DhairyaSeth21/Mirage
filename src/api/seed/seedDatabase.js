import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Avery', 'Quinn',
  'Reese', 'Logan', 'Blake', 'Cameron', 'Drew', 'Parker', 'Sam', 'Jamie',
  'Skylar', 'Devon', 'Hayden', 'Peyton', 'Chris', 'Jesse', 'Kai', 'Robin',
  'Lee', 'Dana', 'Finley', 'Harley', 'Kendall', 'Lennon',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Wilson', 'Anderson', 'Martinez', 'Taylor', 'Thomas', 'Moore', 'Jackson',
  'White', 'Harris', 'Lewis', 'Clark', 'Robinson', 'Walker', 'Hall', 'Allen',
  'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson',
  'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Evans',
  'Torres', 'Campbell',
];

const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];

const STREET_NAMES = [
  'Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Elm St',
  'Pine Rd', 'Park Blvd', 'Lake Dr', 'River Rd', 'Hill St',
];

const CITIES = ['Springfield', 'Riverside', 'Greenville', 'Fairview', 'Brookside'];
const STATES = ['CA', 'TX', 'FL', 'NY', 'WA'];
const BIOS = [
  'Avid reader and coffee enthusiast.',
  'Loves hiking and outdoor adventures.',
  'Software developer by day, chef by night.',
  'Passionate about travel and photography.',
  'Dog owner and amateur musician.',
  'Fitness fanatic and healthy recipe creator.',
  'Enjoys board games and sci-fi novels.',
  'Gardening hobbyist and tea lover.',
];

const ORDER_STATUSES = ['pending', 'shipped', 'delivered'];

const PRODUCT_NAMES = [
  'Wireless Headphones', 'USB-C Hub', 'Mechanical Keyboard', 'Laptop Stand',
  'Webcam', 'Monitor Light', 'Cable Organizer', 'Mouse Pad', 'Desk Mat',
  'Portable Charger', 'Screen Protector', 'Phone Case', 'Tablet Cover',
  'Smart Speaker', 'LED Strip', 'Surge Protector', 'HDMI Cable', 'SD Card',
  'External SSD', 'Stylus Pen', 'Charging Dock', 'Bluetooth Adapter',
  'Memory Foam Cushion', 'Ergonomic Mouse', 'Wrist Rest',
];

/**
 * Deterministic linear-congruential pseudo-random generator seeded by an integer.
 * Returns a value in [0, 1).
 * @param {number} seed
 * @returns {{ next: function(): number }}
 */
function makeRng(seed) {
  let state = seed;
  return {
    next() {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 0x100000000;
    },
    intBetween(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
  };
}

/**
 * Creates all tables and inserts seed data into the given database.
 * Safe to call on a fresh (empty) database.
 * @param {import('better-sqlite3').Database} db
 */
export function seedDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL UNIQUE,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id),
      phone      TEXT    NOT NULL,
      address    TEXT    NOT NULL,
      bio        TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      total      REAL    NOT NULL,
      status     TEXT    NOT NULL,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id         INTEGER PRIMARY KEY,
      order_id   INTEGER NOT NULL REFERENCES orders(id),
      name       TEXT    NOT NULL,
      price      REAL    NOT NULL,
      quantity   INTEGER NOT NULL
    );
  `);

  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)',
  );
  const insertProfile = db.prepare(
    'INSERT INTO profiles (user_id, phone, address, bio) VALUES (?, ?, ?, ?)',
  );
  const insertOrder = db.prepare(
    'INSERT INTO orders (user_id, total, status, created_at) VALUES (?, ?, ?, ?)',
  );
  const insertItem = db.prepare(
    'INSERT INTO items (order_id, name, price, quantity) VALUES (?, ?, ?, ?)',
  );

  const runAll = db.transaction(() => {
    let orderIdCounter = 1;
    let itemIdCounter = 1;

    for (let userId = 1; userId <= 200; userId++) {
      const rng = makeRng(userId * 9973);

      const firstName = FIRST_NAMES[(userId - 1) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(userId - 1) % LAST_NAMES.length];
      const name = `${firstName} ${lastName}`;
      const emailUser = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${userId}`;
      const email = `${emailUser}@${rng.pick(EMAIL_DOMAINS)}`;
      const createdAt = new Date(Date.UTC(2022, rng.intBetween(0, 11), rng.intBetween(1, 28))).toISOString();

      insertUser.run(userId, name, email, createdAt);

      const phone = `555-${String(rng.intBetween(100, 999))}-${String(rng.intBetween(1000, 9999))}`;
      const streetNumber = rng.intBetween(1, 9999);
      const address = `${streetNumber} ${rng.pick(STREET_NAMES)}, ${rng.pick(CITIES)}, ${rng.pick(STATES)}`;
      const bio = rng.pick(BIOS);

      insertProfile.run(userId, phone, address, bio);

      const orderCount = rng.intBetween(2, 6);
      for (let o = 0; o < orderCount; o++) {
        const status = rng.pick(ORDER_STATUSES);
        const total = Math.round(rng.intBetween(1000, 50000)) / 100;
        const orderDate = new Date(Date.UTC(2023, rng.intBetween(0, 11), rng.intBetween(1, 28))).toISOString();

        insertOrder.run(userId, total, status, orderDate);
        const currentOrderId = orderIdCounter++;

        const itemCount = rng.intBetween(2, 4);
        for (let i = 0; i < itemCount; i++) {
          const productName = rng.pick(PRODUCT_NAMES);
          const price = Math.round(rng.intBetween(500, 20000)) / 100;
          const quantity = rng.intBetween(1, 5);
          insertItem.run(currentOrderId, productName, price, quantity);
          itemIdCounter++;
        }
      }
    }
  });

  runAll();
}

// When invoked directly: create the file-backed database and seed it
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync('./data', { recursive: true });
  const db = new Database('./data/mirage.db');
  seedDb(db);
  db.close();
  console.log('Database seeded successfully.');
}
