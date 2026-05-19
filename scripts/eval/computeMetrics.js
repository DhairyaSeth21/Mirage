/**
 * Computes the 5 research metrics from a set of proxy request log entries.
 * Logs must be the structured JSON objects written by the proxy logger.
 */

// All routes in the demo API schema — used for time-to-map calculation
const ALL_API_ROUTES = new Set([
  '/users',
  '/users/:id',
  '/users/:id/orders',
  '/users/:id/profile',
  '/orders/:id',
  '/orders/:id/items',
  '/items/:id',
  '/auth/login',
]);

const ROUTE_COVERAGE_TARGET = 0.8; // 80% of routes = time-to-map threshold

/**
 * Detects the logical client type from a User-Agent string.
 * Model A: python-requests; Model B: Go-http-client; Model C: Chrome/124;
 * everything else is treated as normal browser traffic.
 *
 * @param {string} userAgent
 * @returns {'model_a' | 'model_b' | 'model_c' | 'normal'}
 */
function detectClientType(userAgent = '') {
  if (userAgent.includes('python-requests')) return 'model_a';
  if (userAgent === 'Go-http-client/1.1') return 'model_b';
  if (userAgent.includes('Chrome/124')) return 'model_c';
  return 'normal';
}

/**
 * Computes evaluation metrics from an array of proxy log entries.
 *
 * @param {object[]} logs - Array of structured proxy log entries
 * @param {object}   [opts]
 * @param {string}   [opts.mode]          - Experiment mode label (pass-through to output)
 * @param {string}   [opts.attackerModel] - Attacker model label (pass-through to output)
 * @returns {object} Metrics object
 */
export function computeMetrics(logs, { mode, attackerModel } = {}) {
  // Partition logs into attacker and normal based on User-Agent
  const attackerLogs = logs.filter((l) => {
    const ct = detectClientType(l.user_agent ?? '');
    return ct !== 'normal';
  });
  const normalLogs = logs.filter((l) => detectClientType(l.user_agent ?? '') === 'normal');

  // ── Metric 1: Extraction accuracy ─────────────────────────────────────────
  // Fraction of attacker 200 responses that were NOT modified
  const attackerSuccessful = attackerLogs.filter((l) => l.sent_status === 200);
  const realDataResponses = attackerSuccessful.filter((l) => !l.response_modified);
  const extractionAccuracy = attackerSuccessful.length > 0
    ? realDataResponses.length / attackerSuccessful.length
    : 1.0;

  // ── Metric 2: Time to map ─────────────────────────────────────────────────
  // Time from first attacker request to when attacker has seen 80% of routes
  const targetRouteCount = Math.ceil(ALL_API_ROUTES.size * ROUTE_COVERAGE_TARGET);
  let timeToMapMs = null;
  if (attackerLogs.length > 0) {
    const firstTs = new Date(attackerLogs[0].timestamp).getTime();
    const seenRoutes = new Set();
    for (const log of attackerLogs) {
      if (log.normalizedRoute) seenRoutes.add(log.normalizedRoute);
      if (seenRoutes.size >= targetRouteCount) {
        timeToMapMs = new Date(log.timestamp).getTime() - firstTs;
        break;
      }
    }
  }

  // ── Metric 3: Request cost ─────────────────────────────────────────────────
  const requestCost = attackerLogs.length;

  // ── Metric 4: Decoy interaction rate ──────────────────────────────────────
  const decoyRequests = attackerLogs.filter(
    (l) => Array.isArray(l.modifications) && l.modifications.includes('decoy_injection'),
  );
  const decoyInteractionRate = attackerLogs.length > 0
    ? decoyRequests.length / attackerLogs.length
    : 0;

  // ── Metric 5: False positive rate ─────────────────────────────────────────
  const modifiedNormal = normalLogs.filter((l) => l.response_modified);
  const falsePositiveRate = normalLogs.length > 0
    ? modifiedNormal.length / normalLogs.length
    : 0.0;

  // ── Pressure distribution ──────────────────────────────────────────────────
  const pressureValues = logs.map((l) => l.pressure ?? 0).filter((p) => typeof p === 'number');
  const maxPressureScore = pressureValues.length > 0 ? Math.max(...pressureValues) : 0;
  const avgPressureScore = pressureValues.length > 0
    ? pressureValues.reduce((a, b) => a + b, 0) / pressureValues.length
    : 0;

  // Level distribution
  const levelDistribution = {};
  for (const log of logs) {
    const lv = log.level ?? 0;
    levelDistribution[lv] = (levelDistribution[lv] ?? 0) + 1;
  }

  return {
    ...(mode !== undefined && { mode }),
    ...(attackerModel !== undefined && { attacker_model: attackerModel }),
    extraction_accuracy: extractionAccuracy,
    time_to_map_ms: timeToMapMs,
    request_cost: requestCost,
    decoy_interaction_rate: decoyInteractionRate,
    false_positive_rate: falsePositiveRate,
    total_attacker_requests: attackerLogs.length,
    total_normal_requests: normalLogs.length,
    max_pressure_score: maxPressureScore,
    avg_pressure_score: avgPressureScore,
    level_distribution: levelDistribution,
  };
}
