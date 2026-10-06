import crypto from 'node:crypto';
import { dbService, databasePool, readDb } from './db.js';
import { verifyPassword, signToken, verifyToken, sanitizeUser } from './auth.js';
import { readJsonBody, sendJson, sendBinary, getBearerToken } from './http.js';
import { reviewAccess } from './accessReview.js';
import { readProofFile } from './verificationFiles.js';
function credentials() {
 const email=(process.env.OWNER_EMAIL || '').trim().toLowerCase();
 const hash=process.env.OWNER_PASSWORD_HASH || '';
 return {email,hash,configured:!!email && /^pbkdf2\$120000\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)};
}
function fingerprint(c) { return crypto.createHash('sha256').update(c.email+'|'+c.hash).digest('hex'); }
export async function handleOwner(req,res,pathName) {
 res.setHeader('Cache-Control','no-store');
 const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
 let originAllowed=true;
 if(req.headers.origin){try {const u=new URL(req.headers.origin);originAllowed=['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{originAllowed=false;}}
 if(process.env.NODE_ENV==='production' || process.env.OWNER_LOCAL_ENABLED!=='true' || !local || !originAllowed) return sendJson(res,404,{error:'Not found'},req);
 const c=credentials();
 if(req.method==='POST' && pathName==='/api/owner/login') {
  if(!c.configured) return sendJson(res,503,{error:'Owner access has not been privately configured.'},req);
  const b=await readJsonBody(req);
  const valid=await verifyPassword(String(b.password || ''),c.hash);
  if(String(b.email || '').trim().toLowerCase()!==c.email || !valid) return sendJson(res,401,{error:'Invalid owner credentials.'},req);
  const token=signToken({id:'owner:'+fingerprint(c),role:'owner',email:c.email});
  await dbService.addAuditLog({id:'project-owner',role:'owner'},'owner_login','session','owner');
  return sendJson(res,200,{token},req);
 }
 const payload=verifyToken(getBearerToken(req));
 if(!c.configured || payload?.role!=='owner' || payload.sub!=='owner:'+fingerprint(c) || payload.email!==c.email || !payload.jti || await dbService.isTokenRevoked(payload.jti) || Date.now()/1000-payload.iat>3600) return sendJson(res,401,{error:'Owner sign-in required.'},req);
 const owner={id:'project-owner',role:'owner',name:'Project Owner'};
 if(pathName==='/api/owner/logout' && req.method==='POST') {
  await dbService.revokeToken(payload.jti);return sendJson(res,200,{ok:true},req);
 }
 if(pathName==='/api/owner/accounts' && req.method==='GET') return sendJson(res,200,(await dbService.listUsers()).map(sanitizeUser),req);
 const proof=pathName.match(/^\/api\/owner\/accounts\/([^/]+)\/proof$/);
 if(proof && req.method==='GET') {
  const account=await dbService.findUserById(decodeURIComponent(proof[1])); const file=account?.profile?.accessVerification?.proofFile;
  if(!file) return sendJson(res,404,{error:'No uploaded proof found.'},req);
  try { const bytes=await readProofFile(file);await dbService.addAuditLog(owner,'view_proof','user',account.id);return sendBinary(res,bytes,file.fileType,file.fileName,req,true); }
  catch { return sendJson(res,404,{error:'Proof file unavailable. It may have been lost if server storage was not persistent.'},req); }
 }
 const review=pathName.match(/^\/api\/owner\/accounts\/([^/]+)$/);
 if(review && req.method==='PUT') {
  const b=await readJsonBody(req);
  if(!Array.isArray(b.elderIds) || b.elderIds.some(x=>typeof x!=='string') || typeof b.note!=='string')return sendJson(res,400,{error:'Select patients and provide a review note.'},req);
  try {return sendJson(res,200,{user:sanitizeUser(await reviewAccess(owner,decodeURIComponent(review[1]),b.decision,b.elderIds,b.note,true))},req);}
  catch(e){return sendJson(res,e.statusCode || 500,{error:e.statusCode?e.message:'Review could not be saved.'},req);}
 }
 if(pathName==='/api/owner/records' && req.method==='GET') {
  // Fixed read-only collections; never accept a table name or SQL from the browser.
  const tables={patients:'elders',medications:'medications',appointments:'appointments',alerts:'alerts',reports:'reports',audit:'audit_logs',vitals:'vitals_latest'};
  const data={};
  if(databasePool){for(const [key,table] of Object.entries(tables)){ const {rows}=await databasePool.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 500` .replace('ORDER BY id DESC',table==='vitals_latest'?'ORDER BY elder_id DESC':'ORDER BY id DESC')); data[key]=rows.map(({file_data,file_path,...safe})=>safe); }}
  else { const stored=await readDb();for(const key of Object.keys(tables)){const values=stored[key==='patients'?'elders':key==='audit'?'auditLogs':key==='vitals'?'vitals':key] || [];data[key]=(Array.isArray(values)?values:Object.values(values)).slice(0,500).map(({fileData,filePath,...safe})=>safe);}}
  return sendJson(res,200,data,req);
 }
 return sendJson(res,404,{error:'Owner route not found.'},req);
}
