/**
 * Mirage configuration — all tunable parameters live here.
 * Never hardcode thresholds or magic numbers in other files.
 */

export const config = {
  // Server ports
  PROXY_PORT: 3000,
  API_PORT: 4000,

  // Sliding window
  WINDOW_SIZE_MS: 5 * 60 * 1000, // 5 minutes

  // Detection thresholds (score = value / threshold, capped at 1.0)
  COVERAGE_THRESHOLD: 5,
  ENUM_THRESHOLD: 10,
  TRAVERSAL_THRESHOLD: 3,
  CV_THRESHOLD: 0.5,

  // Pressure score weights (must sum to 1.0)
  WEIGHTS: {
    coverage: 0.15,
    enumeration: 0.30,
    errorAdaptation: 0.20,
    traversal: 0.15,
    timing: 0.15,
    methodUniformity: 0.05,
  },

  // Escalation level thresholds
  LEVEL_THRESHOLDS: [0.25, 0.4, 0.55, 0.8],

  // Level 1: Latency injection
  LATENCY_MIN_MS: 50,
  LATENCY_MAX_MS: 200,

  // Level 2: Throttling
  THROTTLE_DELAY_MS: 1000,

  // Level 3: Decoy injection
  DECOY_INJECT_RATIO: 0.15, // Add 15% fake records to list responses
  
  // Client identification
  FINGERPRINT_FIELDS: ['ip', 'userAgent', 'acceptLanguage', 'acceptEncoding'],

  // Logging
  LOG_DIR: './logs',
  LOG_LEVEL: 'info',
};
