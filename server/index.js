import http from 'node:http';
import { PORT } from './config.js';
import { handleRequest } from './handlers.js';
import { rateLimit, sendJson } from './http.js';
import { serveStatic } from './static.js';
import { initDb } from './db.js';

const server = http.createServer(async (req, res) => {
  try {
    if (!rateLimit(req, res)) return;

    if (req.method === 'OPTIONS') {
      return sendJson(res, 204, {}, req);
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathName = url.pathname;

    if (req.method === 'GET' && !pathName.startsWith('/api')) {
      return serveStatic(req, res, pathName);
    }

    return await handleRequest(req, res, pathName);
  } catch (error) {
    console.error('Request handler error:', error);
    const connectionFailure = ['ECONNREFUSED','ETIMEDOUT','ECONNRESET','57P01','57P03','08006'].includes(error.code);
    const status = error.statusCode || (connectionFailure ? 503 : error.code === '23505' ? 409 : ['23503','23514','22P02','22007'].includes(error.code) ? 400 : 500);
    return sendJson(res, status, { error: status >= 500 ? 'Service unavailable. Please try again.' : error.code ? 'The request conflicts with stored data or contains an invalid reference.' : error.message || 'Invalid request.' }, req);
  }
});

initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`GuardianCare API running at http://127.0.0.1:${PORT}`);
  });
}).catch((err) => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});

