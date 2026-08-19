import path from 'node:path';
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
export const JWT_SECRET = process.env.JWT_SECRET || 'gcare-dev-secret-change-in-production';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:8080,http://localhost:8080';
export const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 250000);
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

if (IS_PRODUCTION && JWT_SECRET === 'gcare-dev-secret-change-in-production') {
  console.warn('Warning: set JWT_SECRET in production.');
}
