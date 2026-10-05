import './config.js';
import { databasePool, closeDb, createSeedDb } from './db.js';
import { runMigrations } from './migrate.js';
import { importData } from './importData.js';
import { readFile } from 'node:fs/promises';
try {
 if (!databasePool) throw new Error('Set DATABASE_URL on the backend first.');
 const command = process.argv[2];
 if (command === 'migrate') { await runMigrations(databasePool); console.log('Database migrations applied.'); }
 else if (command === 'import' || command === 'seed') {
   const source = command === 'seed' ? await createSeedDb() : JSON.parse((await readFile(process.argv[3] || 'data/db.json','utf8')).replace(/^\uFEFF/,''));
   console.log(JSON.stringify(await importData(databasePool, source)));
 } else if (command === 'status') {
   const { rows } = await databasePool.query('SELECT current_database() AS database, version() AS version');
   console.log(JSON.stringify(rows));
 } else throw new Error('Use migrate, import <json-path>, seed, or status.');
} catch (error) { console.error(error.code ? 'Database operation failed (' + error.code + '). Check connection, migration and input data.' : error.message); process.exitCode = 1; }
finally { await closeDb(); }
