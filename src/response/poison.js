import { config } from '../config.js';
import {
  generateDecoyUser,
  generateDecoyOrder,
  generateDecoyItem,
  generateDecoyProfile,
} from './decoyGenerator.js';

/** Decoy IDs start well above the real data range to be identifiable in logs. */
const DECOY_ID_BASE = 1001;

/**
 * Fisher-Yates shuffle — mutates and returns the array.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Determines the resource type from the normalized route.
 * @param {string} normalizedRoute
 * @returns {'users'|'orders'|'items'|'profiles'}
 */
function getResourceType(normalizedRoute) {
  if (normalizedRoute.includes('/profile')) return 'profiles';
  if (normalizedRoute.startsWith('/items') || normalizedRoute.endsWith('/items')) return 'items';
  if (normalizedRoute.startsWith('/orders') || normalizedRoute.endsWith('/orders')) return 'orders';
  return 'users';
}

/**
 * Generates a single fake record that matches the route's resource type.
 * @param {{ normalizedRoute: string, extractedIds: number[] }} requestInfo
 * @returns {object}
 */
function generateDecoyForRoute(requestInfo) {
  const { normalizedRoute, extractedIds } = requestInfo;
  const resourceType = getResourceType(normalizedRoute);
  const parentId = extractedIds[0] ?? 1;

  switch (resourceType) {
    case 'profiles': return generateDecoyProfile(parentId);
    case 'items':    return generateDecoyItem(DECOY_ID_BASE, parentId);
    case 'orders':   return generateDecoyOrder(DECOY_ID_BASE, parentId);
    default:         return generateDecoyUser(DECOY_ID_BASE);
  }
}

/**
 * Generates decoy records that match the shape of the first item in the real list.
 * @param {object[]} realList
 * @param {string} normalizedRoute
 * @returns {object[]}
 */
function injectDecoys(realList, normalizedRoute) {
  const decoyCount = Math.ceil(realList.length * config.DECOY_INJECT_RATIO);
  const resourceType = getResourceType(normalizedRoute);

  const decoys = Array.from({ length: decoyCount }, (_, i) => {
    const decoyId = DECOY_ID_BASE + i;
    switch (resourceType) {
      case 'items':  return generateDecoyItem(decoyId, 1);
      case 'orders': return generateDecoyOrder(decoyId, 1);
      default:       return generateDecoyUser(decoyId);
    }
  });

  // Insert each decoy at a random position (not always at the end)
  const result = [...realList];
  for (const decoy of decoys) {
    const pos = Math.floor(Math.random() * (result.length + 1));
    result.splice(pos, 0, decoy);
  }
  return result;
}

/**
 * Mutates non-critical fields of an individual record.
 * Never touches id, name, or structural fields.
 * @param {object} body
 * @returns {object}
 */
function mutateFields(body) {
  const mutated = { ...body };

  if (typeof mutated.email === 'string' && mutated.email.includes('@')) {
    const [localPart] = mutated.email.split('@');
    mutated.email = `${localPart}@fakecorp.net`;
  }

  if (typeof mutated.phone === 'string') {
    // Change the last 4 digits
    mutated.phone = mutated.phone.replace(/-(\d{4})$/, (_, digits) => {
      const shifted = String((parseInt(digits, 10) + 1111) % 9000 + 1000);
      return `-${shifted}`;
    });
  }

  if (typeof mutated.bio === 'string' && mutated.bio.length > 0) {
    mutated.bio = mutated.bio.endsWith('.')
      ? mutated.bio.slice(0, -1) + '!'
      : mutated.bio + '.';
  }

  return mutated;
}

/**
 * Applies structural poisoning to an upstream response based on the escalation level.
 * Level 0–2 → passes through unchanged.
 * Level 3+ → injects decoys, reorders lists, mutates individual record fields,
 *             and occasionally flips 404s to 200s.
 *
 * @param {number} level
 * @param {{ normalizedRoute: string, extractedIds: number[], clientId: string }} requestInfo
 * @param {{ status: number, body: string }} realResponse
 * @param {object} metrics
 * @returns {{ status: number, body: string, modifications: string[] }}
 */
export function poisonResponse(level, requestInfo, realResponse, metrics) {
  if (level < 3) {
    return { ...realResponse, modifications: [] };
  }

  const modifications = [];
  let body;
  try {
    body = JSON.parse(realResponse.body);
  } catch {
    // Non-JSON body — pass through
    return { ...realResponse, modifications: [] };
  }

  // 404 → sometimes return a plausible fake 200
  if (realResponse.status === 404) {
    if (Math.random() < 0.5) {
      const decoy = generateDecoyForRoute(requestInfo);
      modifications.push('fake_200');
      return { status: 200, body: JSON.stringify(decoy), modifications };
    }
    return { ...realResponse, modifications: [] };
  }

  // List response: inject decoys + shuffle
  if (body.data && Array.isArray(body.data)) {
    body.data = injectDecoys(body.data, requestInfo.normalizedRoute);
    body.data = shuffleArray(body.data);
    modifications.push('decoy_injection', 'list_reorder');
    return { status: realResponse.status, body: JSON.stringify(body), modifications };
  }

  // Individual record: mutate fields (profiles use userId instead of id)
  if (typeof body === 'object' && body !== null && ('id' in body || 'userId' in body)) {
    const mutated = mutateFields(body);
    modifications.push('field_mutation');
    return { status: realResponse.status, body: JSON.stringify(mutated), modifications };
  }

  return { ...realResponse, modifications: [] };
}
