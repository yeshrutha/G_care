import crypto from 'node:crypto';
import { JWT_EXPIRES_IN, JWT_SECRET } from './config.js';

const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
  return `pbkdf2$${HASH_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password, hash) {
  const [scheme, iterations, salt, storedHash] = String(hash || '').split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !storedHash) return false;

  const computed = crypto
    .pbkdf2Sync(password, salt, Number(iterations), HASH_KEYLEN, HASH_DIGEST)
    .toString('hex');

  const stored = Buffer.from(storedHash, 'hex');
  const next = Buffer.from(computed, 'hex');
  return stored.length === next.length && crypto.timingSafeEqual(stored, next);
}

export function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + parseExpiry(JWT_EXPIRES_IN),
  };

  return encodeToken(payload);
}

export function verifyToken(token) {
  try {
    const [header, payload, signature] = String(token || '').split('.');
    if (!header || !payload || !signature) return null;

    const expected = sign(`${header}.${payload}`);
    const actual = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) return null;

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  return null;
}

export function validateEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Valid email is required';
  }
  return null;
}

function encodeToken(payload) {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url(payload);
  return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

function sign(value) {
  return crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64url');
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseExpiry(value) {
  const match = String(value).match(/^(\d+)([dhms])?$/);
  if (!match) return 7 * 24 * 60 * 60;

  const amount = Number(match[1]);
  const unit = match[2] || 's';
  if (unit === 'd') return amount * 24 * 60 * 60;
  if (unit === 'h') return amount * 60 * 60;
  if (unit === 'm') return amount * 60;
  return amount;
}
