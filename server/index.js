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
    return sendJson(res, error.statusCode || 500, { error: error instanceof Error ? error.message : 'Server error' }, req);
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

