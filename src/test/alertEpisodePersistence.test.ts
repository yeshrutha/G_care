import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, rm } from 'node:fs/promises';

// Exercise real JSON persistence in an isolated temporary database.
vi.mock('../../server/config.js', async () => {
  const actual = await vi.importActual<any>('../../server/config.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const DATA_DIR = mkdtempSync(join(tmpdir(), 'gcare-episode-test-'));
  return { ...actual, DATA_DIR, DATA_FILE: join(DATA_DIR, 'db.json') };
});

import { DATA_DIR, DATA_FILE } from '../../server/config.js';
import { dbService, initDb, readDb, writeDb } from '../../server/db.js';
import { createServer, type Server } from 'node:http';
import { handleRequest } from '../../server/handlers.js';
import { signToken } from '../../server/auth.js';

const caretaker = { id: 'user-demo-caretaker', role: 'caretaker' };
const doctor = { id: 'user-demo-doctor', role: 'doctor' };
const guardian = { id: 'guardian-venkatesh', role: 'guardian', assignedElderIds: ['elder-3'], profile: { elderName: 'Venkatesh Rao', accessVerification: { status: 'approved', supervisingDoctorId: 'test-verified-doctor' } } };
const input = (id: string, spo2 = 92) => ({ id, elder_id: 'elder-3', type: 'low_spo2',
  severity: 'warning', message: `Oxygen Saturation dropped to ${spo2}%.` });

describe('Durable alert episodes', () => {
  beforeAll(async () => { await initDb(); });
  beforeEach(async () => {
    const db = await readDb();
    db.alerts = [];
    db.users = db.users.filter((u: any) => u.id !== guardian.id);
    db.users.push({ ...guardian, email: 'episode-test@example.invalid' });
    if (!db.users.some((u: any) => u.id === 'test-verified-doctor')) db.users.push({ id: 'test-verified-doctor', role: 'doctor', email: 'doctor-test@example.invalid', assignedElderIds: ['elder-1', 'elder-2', 'elder-3'], profile: { accessVerification: { status: 'approved' } } });
    await writeDb(db);
  });
  afterAll(async () => { await rm(DATA_DIR, { recursive: true, force: true }); });

  it('serializes ten concurrent changing readings into one persisted record and ID', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      dbService.createAlert(caretaker, input(`tick-${i}`, 91.5 + i / 10))));
    expect(new Set(results.map(a => a.id)).size).toBe(1);
    const disk = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    expect(disk.alerts).toHaveLength(1);
    expect(disk.alerts[0].anomaly_type).toBe('LOW_SPO2');
  });

  it('acknowledgement survives a database reload and changing/critical readings', async () => {
    const first = await dbService.createAlert(caretaker, input('first'));
    await dbService.updateAlert(first.id, { resolved: true });
    // initDb reads the file again, as it does after a server restart.
    await initDb();
    const result = await dbService.createAlert(caretaker, { ...input('later', 89), severity: 'critical' });
    expect(result.id).toBe(first.id);
    expect(result.resolved).toBe(true);
    expect((await readDb()).alerts).toHaveLength(1);
  });

  it('recovery preserves pending alerts on disk and permits a new episode without deleting history', async () => {
    const first = await dbService.createAlert(caretaker, input('episode-1'));
    await dbService.updateAlert(first.id, { episode_recovered: true });
    await initDb();
    expect((await dbService.getAlerts(doctor))[0].resolved).toBe(false);
    const next = await dbService.createAlert(caretaker, input('episode-2', 91.6));
    expect(next.id).not.toBe(first.id);
    expect(next.resolved).toBe(false);
    const disk = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    expect(disk.alerts).toHaveLength(2);
    expect(disk.alerts.find((a: any) => a.id === first.id).episode_recovered).toBe(true);
  });

  it('all authorized roles read the same persisted alert and resolution', async () => {
    const first = await dbService.createAlert(caretaker, input('shared'));
    for (const user of [caretaker, guardian, doctor]) {
      expect((await dbService.getAlerts(user)).map(a => a.id)).toEqual([first.id]);
    }
    await dbService.updateAlert(first.id, { resolved: true });
    for (const user of [caretaker, guardian, doctor]) {
      expect((await dbService.getAlerts(user))[0].resolved).toBe(true);
    }
    const unrelatedGuardian = { id: 'user-demo-guardian', role: 'guardian', profile: { elderName: 'Usha' } };
    expect(await dbService.getAlerts(unrelatedGuardian)).toEqual([]);
  });

  it('keeps elders, high heart rate and low oxygen independent, preserving appointments', async () => {
    await dbService.createAlert(caretaker, input('oxygen'));
    await dbService.createAlert(caretaker, { ...input('heart'), type: 'high_hr', message: 'Heart rate elevated to 112 bpm.' });
    await dbService.createAlert(caretaker, { ...input('usha'), elder_id: 'elder-1' });
    await dbService.createAlert(caretaker, { ...input('appointment'), type: 'appointment', resolved: true, severity: 'info', message: 'Pulmonology appointment booked.' });
    expect((await readDb()).alerts).toHaveLength(4);
  });

  it('real API POST/PUT/GET preserves one episode, acknowledgement and recovery across roles', async () => {
    const db = await readDb();
    // Guardian assignment is explicitly created in beforeEach, not inferred from a name.
    await writeDb(db);
    const server: Server = createServer(async (req, res) => {
      try { await handleRequest(req, res, new URL(req.url!, 'http://localhost').pathname); }
      catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const request = async (user: any, path = '/alerts', method = 'GET', body?: any) => {
      const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method, headers: { Authorization: `Bearer ${signToken(user)}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    };
    try {
      const responses = await Promise.all(Array.from({ length: 10 }, (_, i) =>
        request(caretaker, '/alerts', 'POST', input(`api-tick-${i}`, 91.5 + i / 10))));
      expect(responses.every(r => r.status === 201)).toBe(true);
      const id = responses[0].body.id;
      expect(new Set(responses.map(r => r.body.id)).size).toBe(1);
      for (const user of [doctor, caretaker, guardian]) {
        const response = await request(user);
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].id).toBe(id);
      }
      expect((await request(guardian, `/alerts/${id}`, 'PUT', { resolved: true })).status).toBe(200);
      const continued = await request(caretaker, '/alerts', 'POST', input('after-ack', 91.7));
      expect(continued.body).toMatchObject({ id, resolved: true });
      expect((await request(doctor, `/alerts/${id}`, 'PUT', { episode_recovered: true })).status).toBe(200);
      const next = await request(caretaker, '/alerts', 'POST', input('new-episode', 91.6));
      expect(next.body.id).not.toBe(id);
      expect(next.body.resolved).toBe(false);
      expect((await request(doctor)).body).toHaveLength(2);
      const unrelated = { id: 'user-demo-guardian', role: 'guardian' };
      expect((await request(unrelated, `/alerts/${next.body.id}`, 'PUT', { resolved: true })).status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });
});
