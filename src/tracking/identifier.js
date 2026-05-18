import { createHash } from 'crypto';

/**
 * Computes a 16-character hex fingerprint for a client from the request.
 * Uses IP, User-Agent, Accept-Language, and Accept-Encoding as the composite key.
 *
 * @param {object} req - Node.js IncomingMessage (or compatible object with socket + headers)
 * @returns {string} 16-character lowercase hex string
 */
export function getFingerprint(req) {
  const ip = req.socket?.remoteAddress || '';
  const userAgent = req.headers?.['user-agent'] || '';
  const acceptLanguage = req.headers?.['accept-language'] || '';
  const acceptEncoding = req.headers?.['accept-encoding'] || '';

  const data = `${ip}|${userAgent}|${acceptLanguage}|${acceptEncoding}`;
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}
