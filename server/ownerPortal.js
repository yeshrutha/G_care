import {fetchRemoteProof} from './proofTransfer.js';
import crypto from 'node:crypto';
import { dbService, databasePool, readDb, writeDb } from './db.js';
import { verifyPassword, signToken, verifyToken, sanitizeUser, hashPassword, validateEmail } from './auth.js';
import { readJsonBody, sendJson, sendBinary, getBearerToken } from './http.js';
import { reviewAccess } from './accessReview.js';
import { readProofFile, validateProofFile } from './verificationFiles.js';
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
 if(pathName==='/api/owner/patients' && req.method==='POST') {
  const b=await readJsonBody(req);const name=typeof b.full_name==='string'?b.full_name.trim():'';
  if(!name||name.length>120||!Number.isInteger(b.age)||b.age<0||b.age>125||!['en','hi','kn','ta'].includes(b.language_pref)||!Array.isArray(b.medical_conditions)||b.medical_conditions.length>20||b.medical_conditions.some(x=>typeof x!=='string'||x.length>80))return sendJson(res,400,{error:'Provide a patient name, valid age, language and conditions.'},req);
  const patient={id:'elder-'+crypto.randomUUID(),ownerId:null,full_name:name,age:b.age,medical_conditions:b.medical_conditions,language_pref:b.language_pref,connection_status:'disconnected',battery:null,last_vitals_at:null,baselines_learned:false,createdAt:new Date().toISOString()};
  if(databasePool)await databasePool.query('INSERT INTO elders(id,owner_id,full_name,age,medical_conditions,language_pref,connection_status,baselines_learned) VALUES($1,NULL,$2,$3,$4,$5,$6,false)',[patient.id,name,b.age,JSON.stringify(b.medical_conditions),b.language_pref,'disconnected']);
  else{const stored=await readDb();stored.elders.push(patient);await writeDb(stored);}
  await dbService.addAuditLog(owner,'create_patient','elder',patient.id);
  return sendJson(res,201,patient,req);
 }
 const guardianRoute=pathName.match(/^\/api\/owner\/patients\/([^/]+)\/guardian$/);
 if(guardianRoute && req.method==='POST') {
  const b=await readJsonBody(req,8*1024*1024);const patientId=decodeURIComponent(guardianRoute[1]);
  const name=typeof b.name==='string'?b.name.trim():'';const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
  const relationships=['son','daughter','spouse','relative','authorized_guardian'];
  if(!name||name.length>120||validateEmail(email)||email.length>255||typeof b.phone!=='string'||b.phone.length>40||!relationships.includes(b.relationship)||typeof b.note!=='string'||!b.note.trim()||b.note.length>1000||b.evidenceReviewed!==true)return sendJson(res,400,{error:'Provide guardian details, relationship, a review note and confirm that you checked authorization.'},req);
  const patient=await dbService.getElderById(patientId);
  if(!patient)return sendJson(res,404,{error:'Patient not found.'},req);
  if(await dbService.findUserByEmail(email))return sendJson(res,409,{error:'This email already has an account. Assign it through All accounts instead.'},req);
  let proof;try{proof=validateProofFile(b.proofFile);}catch(e){return sendJson(res,400,{error:e.message},req);}
  const temporaryPassword=crypto.randomBytes(18).toString('base64url');
  const now=new Date().toISOString();
  const user={id:'user-'+crypto.randomUUID(),name,email,phone:b.phone.trim(),role:'guardian',passwordHash:await hashPassword(temporaryPassword),assignedElderIds:[patientId],createdAt:now,profile:{elderName:patient.full_name,mustChangePassword:true,guardianProofData:proof.buffer.toString('base64'),accessVerification:{status:'approved',ownerManaged:true,proofId:'Owner-reviewed authorization',issuer:'Patient / authorized representative',proofReference:'',relationship:b.relationship,proofFile:{id:crypto.randomUUID(),fileName:proof.fileName,fileType:proof.fileType,fileSize:proof.fileSize,storage:'database'},reviewedBy:owner.id,reviewedAt:now,reviewNote:b.note.trim()}}};
  try{await dbService.createUser(user);}catch(e){if(e.code==='23505')return sendJson(res,409,{error:'This email already has an account.'},req);throw e;}
  await dbService.addAuditLog(owner,'create_guardian','user',user.id,{patientId});
  return sendJson(res,201,{user:sanitizeUser(user),temporaryPassword},req);
 }
 if(pathName==='/api/owner/accounts' && req.method==='GET') return sendJson(res,200,(await dbService.listUsers()).map(sanitizeUser),req);
 const proof=pathName.match(/^\/api\/owner\/accounts\/([^/]+)\/proof$/);
 if(proof && req.method==='GET') {
  const account=await dbService.findUserById(decodeURIComponent(proof[1])); const file=account?.profile?.accessVerification?.proofFile;
  if(!file) return sendJson(res,404,{error:'No uploaded proof found.'},req);
  try { const bytes=account.profile.guardianProofData ? Buffer.from(account.profile.guardianProofData,'base64') : process.env.OWNER_LIVE_CONNECTION === 'true' ? await fetchRemoteProof(account.id) : await readProofFile(file);await dbService.addAuditLog(owner,'view_proof','user',account.id);return sendBinary(res,bytes,file.fileType,file.fileName,req,true); }
  catch(error) { return sendJson(res,502,{error:process.env.OWNER_LIVE_CONNECTION==='true'?error.message:'The proof is not present on this server. Check upload storage.'},req); }
 }
 const review=pathName.match(/^\/api\/owner\/accounts\/([^/]+)$/);
 if(review && req.method==='PUT') {
  const b=await readJsonBody(req);
  if(!Array.isArray(b.elderIds) || b.elderIds.some(x=>typeof x!=='string') || typeof b.note!=='string')return sendJson(res,400,{error:'Select patients and provide a review note.'},req);
  try {
   const account=await dbService.findUserById(decodeURIComponent(review[1]));
   const temporaryPassword=b.decision==='approved'&&account?.profile?.accessVerification?.status!=='approved'?crypto.randomBytes(18).toString('base64url'):undefined;
   const reset=temporaryPassword?{passwordHash:await hashPassword(temporaryPassword)}:undefined;
   const updated=await reviewAccess(owner,decodeURIComponent(review[1]),b.decision,b.elderIds,b.note,true,reset);
   return sendJson(res,200,{user:sanitizeUser(updated),...(temporaryPassword?{temporaryPassword}:{})},req);
  }
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
