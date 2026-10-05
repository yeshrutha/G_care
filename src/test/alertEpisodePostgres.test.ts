import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://localhost/gcare_episode_unit_test';
  return { originalUrl, rows: [] as any[], calls: [] as string[], failInsert: false };
});

// This tests the adapter and transaction protocol, not a live PostgreSQL server.
vi.mock('pg', () => {
  const query = vi.fn(async (sql: string, values: any[] = []) => {
    fixture.calls.push(sql);
    if (sql.startsWith('SELECT version')) return {rows: fixture.calls.some(c=>c.startsWith('INSERT INTO schema_migrations')) ? [{version:'001_existing_schema.sql'},{version:'002_persistence.sql'},{version:'003_constraints.sql'},{version:'004_schedule_order.sql'}] : []};
    if (sql.startsWith('SELECT pg_advisory') || sql.startsWith('INSERT INTO schema_migrations')) return {rows:[]};
    if (sql.includes('COUNT(*) FROM elders')) return { rows: [{ count: '1' }] };
    if (sql.startsWith('SELECT id FROM elders')) return { rows: [{ id: values[0] }] };
    if (sql.startsWith('SELECT full_name FROM elders')) return { rows: [{ full_name: 'Venkatesh Rao' }] };
    if (sql.startsWith('SELECT * FROM alerts WHERE elder_id'))
      return { rows: fixture.rows.filter(a => a.elder_id === values[0]).map(a => ({ ...a })) };
    if (sql.startsWith('SELECT a.*'))
      return { rows: fixture.rows.filter(a => a.id === values[0]).map(a => ({ ...a, elder_name: 'Venkatesh Rao' })) };
    if (sql.startsWith('INSERT INTO alerts')) {
      if (fixture.failInsert) { fixture.failInsert = false; throw new Error('simulated write failure'); }
      const [id, elder_id, owner_id, type, severity, message, location, resolved, time, anomaly_type, episode_recovered] = values;
      fixture.rows.push({ id, elder_id, owner_id, type, severity, message, location, resolved, time: new Date(time), anomaly_type, episode_recovered });
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE alerts SET')) {
      const row = fixture.rows.find(a => a.id === values[values.length - 1]);
      const assignments = sql.split(' SET ')[1].split(' WHERE ')[0];
      for (const match of assignments.matchAll(/(\w+)\s*=\s*(?:COALESCE\(\w+, false\) OR )?\$(\d+)/g)) {
        const [, field, position] = match;
        const value = values[Number(position) - 1];
        row[field] = field === 'time' ? new Date(value) : /resolved|episode_recovered/.test(field) ? row[field] || value : value;
      }
      return { rows: [] };
    }
    if (/^\s*(BEGIN|COMMIT|ROLLBACK|CREATE|ALTER|INSERT INTO users)/.test(sql)) return { rows: [] };
    throw new Error('Unexpected SQL in PostgreSQL episode test: ' + sql);
  });
  const client = { query, release: vi.fn() };
  return { default: { Pool: class { query = query; connect = vi.fn(async () => client); } } };
});

import { runMigrations } from '../../server/migrate.js';
import { dbService, initDb, databasePool } from '../../server/db.js';
const user = { id: 'user-demo-caretaker', role: 'caretaker' };
const reading = (id: string, value = 92) => ({ id, elder_id: 'elder-3', type: 'low_spo2', severity: 'warning', message: `Oxygen ${value}%` });

describe('PostgreSQL episode adapter', () => {
  beforeEach(() => { fixture.rows.length = 0; fixture.calls.length = 0; fixture.failInsert = false; });
  afterAll(() => {
    if (fixture.originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = fixture.originalUrl;
  });

  it('adds lifecycle columns without deleting existing alerts', async () => {
    await dbService.createAlert(user, reading('existing'));
    await runMigrations(databasePool);
    await initDb();
    expect(fixture.calls.some(sql => sql.includes('ADD COLUMN IF NOT EXISTS anomaly_type'))).toBe(true);
    expect(fixture.calls.some(sql => sql.includes('ADD COLUMN IF NOT EXISTS episode_recovered'))).toBe(true);
    expect(fixture.rows.map(a => a.id)).toEqual(['existing']);
  });

  it('uses an elder transaction lock and one ID for concurrent abnormal readings', async () => {
    const alerts = await Promise.all(Array.from({ length: 10 }, (_, i) => dbService.createAlert(user, reading('tick-' + i, 91.5 + i / 10))));
    expect(new Set(alerts.map(a => a.id)).size).toBe(1);
    expect(fixture.rows).toHaveLength(1);
    expect(fixture.calls.filter(sql => sql.endsWith('FOR UPDATE'))).toHaveLength(10);
    expect(fixture.calls.filter(sql => sql === 'COMMIT')).toHaveLength(10);
  });

  it('persists acknowledgement, silences continuing readings and rearms only after recovery', async () => {
    const first = await dbService.createAlert(user, reading('first'));
    await dbService.updateAlert(first.id, { resolved: true });
    expect(await dbService.createAlert(user, reading('while-ack', 91.7))).toMatchObject({ id: first.id, resolved: true });
    await dbService.updateAlert(first.id, { episode_recovered: true });
    expect(await dbService.createAlert(user, reading('after-recovery', 91.6))).toMatchObject({ id: 'after-recovery', resolved: false });
    expect(fixture.rows).toHaveLength(2);
  });

  it('rolls back failed creation and allows subsequent calls to proceed', async () => {
    fixture.failInsert = true;
    await expect(dbService.createAlert(user, reading('failed'))).rejects.toThrow('simulated write failure');
    expect(fixture.calls).toContain('ROLLBACK');
    expect(await dbService.createAlert(user, reading('retry'))).toMatchObject({ id: 'retry', resolved: false });
  });
});
