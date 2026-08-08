import { CORS_ORIGIN, MAX_JSON_BODY_BYTES, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './config.js';
import { verifyToken } from './auth.js';
import { dbService } from './db.js';

const requestBuckets = new Map();

export function sendJson(res, status, body, req) {
  const origin = req?.headers?.origin;
  const origins = CORS_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean);
  const allowOrigin = CORS_ORIGIN === '*'
    ? '*'
    : (origin && origins.includes(origin) ? origin : origins[0]);

  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

export function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export async function authenticate(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload?.sub) return null;

  const isRevoked = await dbService.isTokenRevoked(payload.jti);
  if (isRevoked) return null;

  const user = await dbService.findUserById(payload.sub);
  if (!user) return null;

  return { user, payload };
}

export async function requireAuth(req, res) {
  const session = await authenticate(req);
  if (!session?.user) {
    sendJson(res, 401, { error: 'Authentication required' }, req);
    return null;
  }
  return session.user;
}

export async function requireSession(req, res) {
  const session = await authenticate(req);
  if (!session?.user) {
    sendJson(res, 401, { error: 'Authentication required' }, req);
    return null;
  }
  return session;
}

export function requireRole(user, roles, res, req) {
  if (!roles.includes(user.role)) {
    sendJson(res, 403, { error: 'Insufficient permissions' }, req);
    return false;
  }
  return true;
}

export function rateLimit(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const current = requestBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  current.count += 1;
  requestBuckets.set(ip, current);

  if (current.count > RATE_LIMIT_MAX) {
    sendJson(res, 429, { error: 'Too many requests. Please retry shortly.' }, req);
    return false;
  }

  return true;
}
