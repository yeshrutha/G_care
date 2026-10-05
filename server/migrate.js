import { readdir, readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
const directory = path.resolve('server/migrations');
export async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(71942681)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
    for (const version of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
      const sql = await readFile(path.join(directory,version), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const previous = rows.find(r => r.version === version);
      if (previous) { if (previous.checksum !== checksum) throw new Error('An applied database migration was modified.'); continue; }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version,checksum) VALUES ($1,$2)', [version, checksum]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function verifyMigrations(pool) {
  const expected = (await readdir(directory)).filter(n => n.endsWith('.sql'));
  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  if (expected.some(v => !rows.some(r => r.version === v))) throw new Error('Database migrations are required. Run npm run db:migrate before starting the API.');
}
