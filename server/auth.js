import crypto from 'node:crypto';
import { SESSION_SECRET, SESSION_TTL } from './config.js';

/**
 * Stateless admin sessions (HMAC-signed, no server-side map) so the token
 * survives across serverless invocations on Vercel.
 */
const sign = (payload) =>
  crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');

export function issueToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_TTL, operator: '7H Operations' }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 512) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length) return false;
  if (!crypto.timingSafeEqual(provided, wanted)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] ?? req.query.token;
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Admin session expired. Sign in again.' });
  }
  return next();
}
