import {authenticate,sendJson} from './http.js';
import {signWatchToken,verifyToken} from './auth.js';
import {dbService} from './db.js';
import {hasApprovedAccess} from './accessPolicy.js';
export async function handleWatchSimulator(req,res,pathName){
 if(pathName==='/api/watch-simulator/pair' && req.method==='POST'){
  const session=await authenticate(req);const user=session?.user;
  if(!user||!hasApprovedAccess(user))return sendJson(res,401,{error:'Approved care account required to pair a watch.'},req);
  const patients=await dbService.getElders(user);
  return sendJson(res,200,patients.map(p=>({patient:{id:p.id,full_name:p.full_name,age:p.age,language_pref:p.language_pref,medical_conditions:p.medical_conditions,connection_status:p.connection_status,battery:p.battery},token:signWatchToken(user,p.id)})),req);
 }
 const claim=verifyToken(req.headers['x-watch-token']);
 const user=claim?.purpose==='watch-simulator'?await dbService.findUserById(claim.issuer):null;
 if(!user||!hasApprovedAccess(user)||(user.profile?.credentialVersion||'legacy')!==claim.credentialVersion||!await dbService.userOwnsElder(user,claim.elderId))return sendJson(res,403,{error:'This watch connection has expired. Open the assigned care portal to reconnect it.'},req);
 if(pathName==='/api/watch-simulator/sos'&&req.method==='POST'){
  const patients=await dbService.getElders(user);const p=patients.find(p=>p.id===claim.elderId);
  const alert=await dbService.createAlert(user,{elder_id:p.id,type:'sos',severity:'critical',message:'🚨 EMERGENCY SOS — '+p.full_name+' pressed SOS button! Immediate attention required.',resolved:false,time:new Date().toISOString()});
  return sendJson(res,201,alert,req);
 }
 if(pathName==='/api/watch-simulator/state'&&req.method==='GET'){
  const data=await dbService.filterDashboardForUser(user);const id=claim.elderId;
  return sendJson(res,200,{vitals:data.vitals?.[id],alerts:(data.alerts||[]).filter(a=>(a.elder_id||a.elderId)===id),medications:(data.medications||[]).filter(m=>m.elder_id===id),alarms:(data.alarms||[]).filter(a=>a.elderId===id)},req);
 }
 return sendJson(res,404,{error:'Route not found'},req);
}

export async function authenticatePairedWatch(req){
 const claim=verifyToken(req.headers['x-watch-token']);
 if(claim?.purpose!=='watch-simulator')return null;
 const user=await dbService.findUserById(claim.issuer);
 if(!user||!hasApprovedAccess(user)||(user.profile?.credentialVersion||'legacy')!==claim.credentialVersion||!await dbService.userOwnsElder(user,claim.elderId))return null;
 return {...user,watchElderId:claim.elderId};
}
