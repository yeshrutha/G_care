import './config.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const url=new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55433') throw new Error('This helper is only for the project local PostgreSQL instance on port 55433.');
const executable=path.resolve('tmp/postgres/pgsql/bin/pg_ctl.exe');const cluster=path.resolve('data/postgres');
if (!existsSync(executable) || !existsSync(path.join(cluster,'PG_VERSION'))) throw new Error('Local PostgreSQL files are missing. See POSTGRESQL_INTEGRATION.md.');
const status=spawnSync(executable,['-D',cluster,'status'],{windowsHide:true,stdio:'ignore'});
if (status.status===0) console.log('Local PostgreSQL is already running.');
else {const result=spawnSync(executable,['-D',cluster,'-l',path.resolve('tmp/postgres/local-server.log'),'-o','-p 55433 -h 127.0.0.1','-w','start'],{windowsHide:true,stdio:'inherit'});if(result.status!==0)process.exit(result.status ||1);}
