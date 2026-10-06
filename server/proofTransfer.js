import crypto from 'node:crypto';
import { dbService } from './db.js';
import {readProofFile} from './verificationFiles.js';
import {sendJson,sendBinary} from './http.js';
export function proofSignature(key,id,time){return crypto.createHmac('sha256',key).update('proof:'+id+':'+time).digest('hex');}
export function validProofSignature(key,id,time,signature){if(!key || key.length<64 || !/^\d+$/.test(time||'') || Math.abs(Date.now()/1000-Number(time))>60 || !/^[a-f0-9]{64}$/.test(signature||''))return false;return crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(proofSignature(key,id,time),'hex'));}
export async function handleProofTransfer(req,res,id){
 const key=process.env.OWNER_PROOF_TRANSFER_KEY;const time=req.headers['x-proof-time'];const signature=req.headers['x-proof-signature'];
 if(req.method!=='GET'||!validProofSignature(key,id,time,signature))return sendJson(res,404,{error:'Not found'},req);
 const a=await dbService.findUserById(id);const f=a?.profile?.accessVerification?.proofFile;
 if(!f)return sendJson(res,404,{error:'Proof unavailable'},req);
 try{const bytes=await readProofFile(f);await dbService.addAuditLog({id:'project-owner',role:'owner'},'remote_view_proof','user',id);return sendBinary(res,bytes,f.fileType,f.fileName,req,true);}catch{return sendJson(res,404,{error:'Proof unavailable. The upload may not have survived an earlier redeployment.'},req);}
}
export async function fetchRemoteProof(id){
 const origin=process.env.OWNER_PROOF_ORIGIN;const key=process.env.OWNER_PROOF_TRANSFER_KEY;
 if(!origin||!key)throw Error('Private proof connection is not configured.');
 const u=new URL(origin);if(u.protocol!=='https:')throw Error('Proof connection requires HTTPS.');
 const time=String(Math.floor(Date.now()/1000));const res=await fetch(new URL('/api/private-proof/'+encodeURIComponent(id),u),{headers:{'X-Proof-Time':time,'X-Proof-Signature':proofSignature(key,id,time)},signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!res.ok){const body=await res.json().catch(()=>null);if(body?.error?.includes('redeployment'))throw Error('This uploaded proof was not found in live storage. The applicant must supply it again; the database keeps only its filename.');if(body?.error==='Proof unavailable')throw Error('This account has no available uploaded proof.');throw Error('Live proof access is not activated. In Render, set OWNER_PROOF_TRANSFER_KEY to the same private value as your local .env, then deploy the latest backend.');}
 const parts=[];let size=0;for await(const part of res.body){size+=part.length;if(size>5*1024*1024)throw Error('Proof exceeds the upload size limit.');parts.push(part);}return Buffer.concat(parts);
}
