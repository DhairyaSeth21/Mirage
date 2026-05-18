import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';

/**
 * Creates a logger that appends JSON lines to the given file path.
 * @param {string} logFilePath - Absolute or relative path to the JSONL log file
 * @returns {function(Object): void} logRequest function
 */
export function createLogger(logFilePath) {
  return function logRequest(fields) {
    mkdirSync(dirname(logFilePath), { recursive: true });
    const line = JSON.stringify(fields) + '\n';
    appendFileSync(logFilePath, line, 'utf-8');
    if (process.env.NODE_ENV === 'development') {
      process.stdout.write(line);
    }
  };
}

/**
 * Default logger — writes to the configured log directory.
 */
export const logRequest = createLogger(`${config.LOG_DIR}/requests.jsonl`);
