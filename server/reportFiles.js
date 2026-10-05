import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './config.js';
export async function saveReportFile(base64) {
 const directory=path.resolve(DATA_DIR,'uploads'); await mkdir(directory,{recursive:true});
 const name=crypto.randomUUID()+'.pdf'; await writeFile(path.join(directory,name),Buffer.from(base64,'base64'),{flag:'wx'}); return name;
}
export async function loadReportFile(name) {
 if (!/^[a-f0-9-]{36}\.pdf$/.test(name)) throw new Error('Invalid report file reference.');
 return readFile(path.resolve(DATA_DIR,'uploads',name));
}
