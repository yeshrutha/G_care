import http from 'node:http';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const seedData = {
  medications: [
    {
      id: 'med-1',
      elder_id: 'elder-1',
      brand_name: 'Glucophage',
      generic_name: 'Metformin HCl',
      category: 'Antidiabetic',
      dose_amount: 500,
      dose_unit: 'mg',
      frequency: 'Twice daily',
      times: ['08:00', '20:00'],
      instructions: 'Take with food',
      photo: '',
    },
    {
      id: 'med-2',
      elder_id: 'elder-1',
      brand_name: 'Amlodac',
      generic_name: 'Amlodipine',
      category: 'Antihypertensive',
      dose_amount: 5,
      dose_unit: 'mg',
      frequency: 'Once daily',
      times: ['08:00'],
      instructions: 'Take in the morning',
      photo: '',
    },
    {
      id: 'med-3',
      elder_id: 'elder-2',
      brand_name: 'Ecosprin',
      generic_name: 'Aspirin',
      category: 'Antiplatelet',
      dose_amount: 75,
      dose_unit: 'mg',
      frequency: 'Once daily',
      times: ['09:00'],
      instructions: 'Take after breakfast',
      photo: '',
    },
  ],
  alarms: [
    { id: 'alarm-1', time: '08:00', title: 'Morning medicines', elderId: 'elder-1', status: 'Due soon', type: 'medication', notes: 'Morning medication reminder' },
    { id: 'alarm-2', time: '08:30', title: 'Breakfast reminder', elderId: 'elder-1', status: 'Scheduled', type: 'food', notes: 'Breakfast reminder' },
    { id: 'alarm-3', time: '12:30', title: 'Lunch reminder', elderId: 'elder-2', status: 'Scheduled', type: 'food', notes: 'Lunch reminder' },
    { id: 'alarm-4', time: '18:30', title: 'Evening walk', elderId: 'elder-3', status: 'Scheduled', type: 'activity', notes: 'Evening activity reminder' },
  ],
};

async function readDb() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    await writeDb(seedData);
    return structuredClone(seedData);
  }
}

async function writeDb(data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function notFound(res) {
  sendJson(res, 404, { error: 'Route not found' });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
};

async function serveStatic(req, res, pathName) {
  const distDir = path.join(__dirname, 'dist');
  let targetPath = path.join(distDir, pathName);

  // Prevent directory traversal
  if (!targetPath.startsWith(distDir)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const stats = await stat(targetPath);
    if (stats.isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }
  } catch {
    // Fallback for SPA (Single Page Application) routing: serve index.html
    targetPath = path.join(distDir, 'index.html');
  }

  try {
    const data = await readFile(targetPath);
    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-store, no-cache, must-revalidate, proxy-revalidate' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Internal Server Error: ${err.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendJson(res, 204, {});

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathName = url.pathname;

    if (req.method === 'GET' && !pathName.startsWith('/api')) {
      return serveStatic(req, res, pathName);
    }

    if (req.method === 'GET' && pathName === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'GuardianCare API' });
    }

    if (req.method === 'GET' && pathName === '/api/dashboard-data') {
      return sendJson(res, 200, await readDb());
    }

    const db = await readDb();

    if (req.method === 'POST' && pathName === '/api/medications') {
      const medication = await readJsonBody(req);
      const saved = { ...medication, id: medication.id || `med-${Date.now()}` };
      db.medications = [saved, ...db.medications];
      await writeDb(db);
      return sendJson(res, 201, saved);
    }

    if (req.method === 'PUT' && pathName.startsWith('/api/medications/')) {
      const id = decodeURIComponent(pathName.split('/').pop() || '');
      const medication = await readJsonBody(req);
      db.medications = db.medications.map((item) => item.id === id ? { ...medication, id } : item);
      await writeDb(db);
      return sendJson(res, 200, db.medications.find((item) => item.id === id));
    }

    if (req.method === 'DELETE' && pathName.startsWith('/api/medications/')) {
      const id = decodeURIComponent(pathName.split('/').pop() || '');
      db.medications = db.medications.filter((item) => item.id !== id);
      await writeDb(db);
      return sendJson(res, 200, { id });
    }

    if (req.method === 'POST' && pathName === '/api/alarms') {
      const alarm = await readJsonBody(req);
      const saved = { ...alarm, id: alarm.id || `alarm-${Date.now()}` };
      db.alarms = [saved, ...db.alarms];
      await writeDb(db);
      return sendJson(res, 201, saved);
    }

    if (req.method === 'PUT' && pathName.startsWith('/api/alarms/')) {
      const id = decodeURIComponent(pathName.split('/').pop() || '');
      const alarm = await readJsonBody(req);
      db.alarms = db.alarms.map((item) => item.id === id ? { ...alarm, id } : item);
      await writeDb(db);
      return sendJson(res, 200, db.alarms.find((item) => item.id === id));
    }

    if (req.method === 'DELETE' && pathName.startsWith('/api/alarms/')) {
      const id = decodeURIComponent(pathName.split('/').pop() || '');
      db.alarms = db.alarms.filter((item) => item.id !== id);
      await writeDb(db);
      return sendJson(res, 200, { id });
    }

    return notFound(res);
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`GuardianCare API running at http://127.0.0.1:${PORT}`);
});
