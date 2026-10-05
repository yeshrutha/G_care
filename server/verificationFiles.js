import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './config.js';
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export function validateProofFile(file) {
  const fail = () => { throw Object.assign(new Error('Upload a valid PDF, PNG, JPG, WebP or Word document, up to 5 MB.'), { statusCode: 400 }); };
  if (!file || typeof file.fileData !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.fileData)) fail();
  const buffer = Buffer.from(file.fileData, 'base64');
  if (!buffer.length || buffer.length > MAX_PROOF_BYTES || buffer.length !== file.fileSize) fail();
  const name = String(file.fileName || '').split(/[\\/]/).pop().replace(/[\x00-\x1f]/g, '').slice(0, 180);
  const ext = path.extname(name).toLowerCase();
  const hex = buffer.subarray(0, 8).toString('hex');
  const types = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const valid = ext === '.pdf' ? buffer.subarray(0, 5).toString() === '%PDF-' : ext === '.png' ? hex === '89504e470d0a1a0a' : ['.jpg', '.jpeg'].includes(ext) ? hex.startsWith('ffd8ff') : ext === '.webp' ? buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' : ext === '.doc' ? hex === 'd0cf11e0a1b11ae1' : ext === '.docx' ? hasWordEntries(buffer) : false;
  if (!valid || file.fileType && file.fileType !== types[ext]) fail();
  return { buffer, fileName: name, fileType: types[ext], fileSize: buffer.length };
}
function hasWordEntries(buffer) {
  // Inspect ZIP central-directory entries without extracting or executing the document.
  const names = new Set();
  for (let offset = 0; offset + 46 <= buffer.length; offset++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const length = buffer.readUInt16LE(offset + 28);
    const end = offset + 46 + length;
    if (end > buffer.length) return false;
    names.add(buffer.subarray(offset + 46, end).toString('utf8'));
    offset = end + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32) - 1;
  }
  return buffer.subarray(0, 4).toString('hex') === '504b0304' && names.has('[Content_Types].xml') && names.has('word/document.xml');
}
function proofPath(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) throw new Error('Invalid proof file identity.');
  return path.join(DATA_DIR, 'verification-proofs', id);
}
export async function saveProofFile(validated) {
  const id = crypto.randomUUID();
  await fs.mkdir(path.join(DATA_DIR, 'verification-proofs'), { recursive: true });
  await fs.writeFile(proofPath(id), validated.buffer, { flag: 'wx', mode: 0o600 });
  return { id, fileName: validated.fileName, fileType: validated.fileType, fileSize: validated.fileSize };
}
export async function readProofFile(metadata) { return fs.readFile(proofPath(metadata.id)); }
export async function removeProofFile(metadata) { await fs.unlink(proofPath(metadata.id)); }
