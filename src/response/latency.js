import { config } from '../config.js';

/**
 * Computes how many milliseconds to delay the response for a given escalation level.
 * Level 0 → no delay. Level 1+ → random jitter in [LATENCY_MIN_MS, LATENCY_MAX_MS].
 *
 * @param {number} level - Escalation level (0–4)
 * @returns {number} Delay in milliseconds
 */
export function computeLatency(level) {
  if (level < 1) return 0;
  const { LATENCY_MIN_MS, LATENCY_MAX_MS } = config;
  return LATENCY_MIN_MS + Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS);
}
