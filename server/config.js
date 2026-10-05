import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile();
} catch (e) {
  // Ignore in production/environments where .env is not present
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT || process.env.API_PORT || 8787);
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const DATA_FILE = path.join(DATA_DIR, 'db.json');
const configuredSecret = process.env.JWT_SECRET || '';
const validSecret = configuredSecret.length >= 32 && configuredSecret !== 'gcare-dev-secret-change-in-production';
if (process.env.NODE_ENV === 'production' && !validSecret) {
  throw new Error('Production requires a private JWT_SECRET of at least 32 characters.');
}
// Development without a private configured key uses a fresh key per server process.
export const JWT_SECRET = validSecret ? configuredSecret : crypto.randomBytes(32).toString('hex');
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:8080,http://localhost:8080';
export const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 250000);
export const MAX_UPLOAD_BODY_BYTES = Number(process.env.MAX_UPLOAD_BODY_BYTES || 15 * 1024 * 1024);
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
