/**
 * Generates deterministic fake records for each resource type.
 * All output is seeded by the decoyId so the same ID always yields the same data —
 * an attacker requesting the same decoy twice sees a consistent response.
 */

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
  'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams',
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
];

const ORDER_STATUSES = ['pending', 'shipped', 'delivered'];

const PRODUCT_NAMES = [
  'Wireless Headphones', 'USB-C Hub', 'Mechanical Keyboard', 'Laptop Stand',
  'Webcam', 'Monitor Light', 'Cable Organizer', 'Mouse Pad', 'Desk Mat',
  'Portable Charger', 'Screen Protector', 'Phone Case', 'Tablet Cover',
  'Smart Speaker', 'LED Strip', 'Surge Protector', 'HDMI Cable', 'SD Card',
  'External SSD', 'Stylus Pen',
];

/**
 * Seeded linear-congruential PRNG. Returns a function that produces values in [0, 1).
 * @param {number} seed
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
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
 * Generates a fake user with all required fields. Output is deterministic per decoyId.
 * @param {number} decoyId
 * @returns {{ id: number, name: string, email: string, createdAt: string }}
 */
export function generateDecoyUser(decoyId) {
  const rng = makeRng(decoyId * 6271);
  const firstName = rng.pick(FIRST_NAMES);
  const lastName = rng.pick(LAST_NAMES);
  const domain = rng.pick(EMAIL_DOMAINS);
  const year = rng.intBetween(2020, 2024);
  const month = rng.intBetween(1, 12);
  const day = rng.intBetween(1, 28);
  return {
    id: decoyId,
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${decoyId}@${domain}`,
    createdAt: new Date(Date.UTC(year, month - 1, day)).toISOString(),
  };
}

/**
 * Generates a fake order. Output is deterministic per decoyId.
 * @param {number} decoyId
 * @param {number} userId
 * @returns {{ id: number, userId: number, total: number, status: string, createdAt: string }}
 */
export function generateDecoyOrder(decoyId, userId) {
  const rng = makeRng(decoyId * 7919);
  const totalCents = rng.intBetween(1000, 50000);
  const total = Math.round(totalCents) / 100;
  const status = rng.pick(ORDER_STATUSES);
  const year = rng.intBetween(2022, 2024);
  const month = rng.intBetween(1, 12);
  const day = rng.intBetween(1, 28);
  return {
    id: decoyId,
    userId,
    total,
    status,
    createdAt: new Date(Date.UTC(year, month - 1, day)).toISOString(),
  };
}

/**
 * Generates a fake item. Output is deterministic per decoyId.
 * @param {number} decoyId
 * @param {number} orderId
 * @returns {{ id: number, orderId: number, name: string, price: number, quantity: number }}
 */
export function generateDecoyItem(decoyId, orderId) {
  const rng = makeRng(decoyId * 3571);
  const priceCents = rng.intBetween(500, 20000);
  const price = Math.round(priceCents) / 100;
  const quantity = rng.intBetween(1, 5);
  const name = rng.pick(PRODUCT_NAMES);
  return { id: decoyId, orderId, name, price, quantity };
}

/**
 * Generates a fake profile for a given userId. Output is deterministic per userId.
 * @param {number} userId
 * @returns {{ userId: number, email: string, phone: string, address: string, bio: string }}
 */
export function generateDecoyProfile(userId) {
  const rng = makeRng(userId * 5381);
  const firstName = rng.pick(FIRST_NAMES);
  const lastName = rng.pick(LAST_NAMES);
  const domain = rng.pick(EMAIL_DOMAINS);
  const streetNum = rng.intBetween(1, 9999);
  const street = rng.pick(STREET_NAMES);
  const city = rng.pick(CITIES);
  const state = rng.pick(STATES);
  const areaA = rng.intBetween(100, 999);
  const areaB = rng.intBetween(1000, 9999);
  return {
    userId,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${userId}@${domain}`,
    phone: `555-${areaA}-${areaB}`,
    address: `${streetNum} ${street}, ${city}, ${state}`,
    bio: rng.pick(BIOS),
  };
}
