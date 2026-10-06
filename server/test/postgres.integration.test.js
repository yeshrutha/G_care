import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must point to a real isolated PostgreSQL test database.');
const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
const schema='gcare_test_'+crypto.randomBytes(6).toString('hex');
const url=new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options','-c search_path='+schema);
process.env.DATABASE_URL=url.toString();process.env.NODE_ENV='test';process.env.DEMO_AUTH_ENABLED='true';process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');
let db,pool,server,base,doctor,nurse,guardian,signToken,runMigrations,importData,seed,dir;
async function api(route,method='GET',body,user=doctor) {
 const res=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+signToken(user)}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};
}
before(async()=>{
 await admin.query('CREATE SCHEMA '+schema);dir=await mkdtemp(path.join(tmpdir(),'gcare-pg-files-'));process.env.DATA_DIR=dir;
 const m=await import('../db.js');db=m.dbService;pool=m.databasePool;({runMigrations}=await import('../migrate.js'));({importData}=await import('../importData.js'));({signToken}=await import('../auth.js'));
 await runMigrations(pool);seed=await m.createSeedDb();await importData(pool,seed);await m.initDb();
 doctor=await db.findUserById('user-demo-doctor');nurse=await db.findUserById('user-demo-caretaker');guardian=await db.findUserById('user-demo-guardian');
 const {handleRequest}=await import('../handlers.js');server=createServer(async(req,res)=>{try{await handleRequest(req,res,new URL(req.url,'http://localhost').pathname);}catch(e){res.writeHead(e.code==='23505'?409:e.code==='23503'?400:e.statusCode||503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Request failed safely.'}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();if(dir)await rm(dir,{recursive:true,force:true});});
const low=(id,value=91.7,elder='elder-3',type='low_spo2')=>({id,elder_id:elder,type,severity:'warning',message:'Oxygen '+value+'%'});
test('real migrations and import idempotency; role assignments and login',async()=>{
 await runMigrations(pool);assert.deepEqual(await importData(pool,seed),{alreadyImported:true});assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'4');
 assert.equal((await api('/dashboard-data','GET',undefined,guardian)).data.elders.length,1);assert.equal((await api('/dashboard-data','GET',undefined,nurse)).data.elders.length,3);
 assert.equal((await api('/auth/login','POST',{email:doctor.email,password:'Demo1234!',role:'doctor'},null)).status,200);
});
test('ten concurrent changing readings create one PostgreSQL episode',async()=>{
 const results=await Promise.all(Array.from({length:10},(_,i)=>api('/alerts','POST',low('pg-low-'+i,91.5+i/10))));assert.ok(results.every(r=>r.status===201));assert.equal(new Set(results.map(r=>r.data.id)).size,1);
 assert.equal((await pool.query("SELECT count(*) FROM alerts WHERE elder_id='elder-3' AND anomaly_type='LOW_SPO2'")).rows[0].count,'1');
});
test('acknowledgement, recovery, new episode and independent anomaly/patient keys',async()=>{
 const first=await db.createAlert(doctor,low('pg-ack'));await db.updateAlert(first.id,{resolved:true});assert.equal((await db.createAlert(doctor,low('pg-silenced'))).id,first.id);
 await db.updateAlert(first.id,{episode_recovered:true});const next=await db.createAlert(doctor,low('pg-new'));assert.notEqual(next.id,first.id);await db.updateAlert(next.id,{episode_recovered:true});assert.equal((await db.getAlertById(next.id)).resolved,false);
 assert.notEqual((await db.createAlert(doctor,low('pg-hr',120,'elder-3','high_hr'))).id,(await db.createAlert(doctor,low('pg-usha',92,'elder-1'))).id);
});
test('decimal telemetry updates latest state; high-frequency history is sampled',async()=>{
 for(let i=0;i<10;i++)assert.equal((await api('/vitals','POST',{elderId:'elder-3',heart_rate:75,systolic_bp:120,diastolic_bp:80,spo2:91.5+i/10,stress:20,hydration:80,breathing_rate:16,skin_temp:36.5,timestamp:new Date(Date.now()+i*100).toISOString()})).status,201);
 assert.equal((await db.getVitalsReadings('elder-3',1))[0].spo2,92.4);assert.equal((await pool.query("SELECT count(*) FROM vitals_readings WHERE elder_id='elder-3'")).rows[0].count,'1');
});
test('medication schedules and Taken state survive retries and a separate backend process',async()=>{
 const med={id:'pg-med',elder_id:'elder-1',brand_name:'Test tablet',generic_name:'Test ingredient',category:'Test',dose_amount:5,dose_unit:'mg',frequency:'Daily',times:['08:00','20:00']};
 assert.equal((await api('/medications','POST',med,nurse)).status,201);assert.equal((await api('/medications','POST',med,nurse)).status,201);assert.equal((await pool.query("SELECT count(*) FROM medication_schedules WHERE medication_id='pg-med'")).rows[0].count,'2');
 const ack={elderId:'elder-1',reminderId:'med-pg-med-0',occurrenceDate:'2026-10-06'};assert.equal((await api('/reminder-acknowledgements','POST',ack,guardian)).status,200);assert.equal((await api('/reminder-acknowledgements','POST',ack,guardian)).status,200);
 const text=execFileSync(process.execPath,['--input-type=module','-e',"const {dbService,initDb,closeDb}=await import('./server/db.js');await initDb();const u=await dbService.findUserById('user-demo-guardian');console.log(JSON.stringify(await dbService.filterDashboardForUser(u)));await closeDb();"],{env:process.env,encoding:'utf8'});
 const dashboard=JSON.parse(text.trim().split('\n').at(-1));assert.ok(dashboard.medications.some(m=>m.id==='pg-med'));assert.equal(dashboard.reminderAcknowledgements.length,1);
});
test('appointment dates, doctor, prep alarm and stable retry identities persist',async()=>{
 const a={id:'pg-appointment',elderId:'elder-1',title:'Appointment',time:'10:00',type:'appointment',appointmentId:'pg-appointment',appointmentDate:'2026-12-01',appointmentTime:'10:00',doctorName:'Ramesh'};
 assert.equal((await api('/alarms','POST',a)).status,201);assert.equal((await api('/alarms','POST',a)).status,201);assert.equal((await api('/alarms','POST',{...a,id:'pg-prep',time:'09:00',isOneHourReminder:true})).status,201);
 assert.equal((await api('/dashboard-data','GET',undefined,guardian)).data.alarms.find(a=>a.id==='pg-prep').appointmentDate,'2026-12-01');assert.equal((await pool.query("SELECT count(*) FROM appointments WHERE id='pg-appointment'")).rows[0].count,'1');
});
test('cross-patient privacy, SQL foreign keys and malformed query recovery',async()=>{
 assert.equal((await api('/vitals?elderId=elder-3','GET',undefined,guardian)).status,403);assert.equal((await api('/alerts','POST',low('blocked'),guardian)).status,403);assert.equal((await api('/dashboard-data','GET',undefined,null)).status,401);
 await assert.rejects(pool.query("INSERT INTO user_elders(user_id,elder_id) VALUES ('missing','elder-1')"),e=>e.code==='23503');await assert.rejects(pool.query('SELECT malformed_column FROM elders'),e=>e.code==='42703');assert.equal((await api('/health','GET',undefined,null)).data.persistence,'postgresql');
});
test('hardware fall and alert appointment metadata persist',async()=>{
 assert.equal((await api('/device/telemetry','POST',{elderId:'elder-1',fallDetected:true,spo2:95.7},nurse)).status,201);assert.ok((await db.getAlerts(doctor)).some(a=>a.type==='fall'&&a.elderId==='elder-1'));
 const a=await db.createAlert(doctor,{...low('appointment-details',92,'elder-2'),type:'sos'});await db.updateAlert(a.id,{resolved:true,appointmentDetails:{id:'pg-appointment',date:'2026-12-01'}});assert.equal((await db.getAlertById(a.id)).appointmentDetails.date,'2026-12-01');
});

test('sample blood-test PDF metadata, file access, restart and patient isolation',async()=>{
 const pdf=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n4 0 obj << /Length 100 >> stream\nBT (Laboratory Blood Test Report Patient Usha Hemoglobin 12.5 g/dL CBC WBC 6000 Platelets 250000) Tj ET\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF');
 const upload=await api('/reports','POST',{elderId:'elder-1',title:'Blood Test Report',category:'Laboratory',fileName:'blood-test.pdf',fileData:pdf.toString('base64'),fileType:'application/pdf'});assert.equal(upload.status,201);
 const id=upload.data.id;assert.ok((await api('/reports?elderId=elder-1','GET',undefined,guardian)).data.some(r=>r.id===id));
 const row=(await pool.query('SELECT file_path,file_data FROM reports WHERE id=$1',[id])).rows[0];assert.ok(row.file_path);assert.equal(row.file_data,null);
 const file=await fetch(base+'/api/reports/'+id+'/file',{headers:{Authorization:'Bearer '+signToken(guardian)}});assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),pdf);
 const other=await db.createReport(doctor,'elder-3','Other laboratory report','','Lab','','other.pdf',pdf.toString('base64'));
 assert.equal((await fetch(base+'/api/reports/'+other.id+'/file',{headers:{Authorization:'Bearer '+signToken(guardian)}})).status,403);
 const child=execFileSync(process.execPath,['--input-type=module','-e',"const {dbService,initDb,closeDb}=await import('./server/db.js');await initDb();console.log((await dbService.getReportById('"+id+"')).fileData);await closeDb();"],{env:process.env,encoding:'utf8'});assert.equal(child.trim().split('\n').at(-1),pdf.toString('base64'));
});
test('real approval/patient assignments and login cannot be forged',async()=>{
 const proof={proofId:'SYNTHETIC-ONLY',issuer:'Test organization',proofReference:'Synthetic automated evidence'};
 const reg=await api('/auth/register','POST',{...proof,email:'new-doctor@example.invalid',password:'TestOnly123!',name:'New doctor',role:'doctor'},null);assert.equal(reg.status,201);assert.equal(reg.data.token,undefined);
 assert.equal((await api('/auth/login','POST',{email:'new-doctor@example.invalid',password:'TestOnly123!'},null)).status,403);
 const {reviewAccess}=await import('../accessReview.js');await reviewAccess({id:'project-owner'},reg.data.user.id,'approved',['elder-1'],'Synthetic test approval',true);
 assert.equal((await api('/auth/login','POST',{email:'new-doctor@example.invalid',password:'TestOnly123!',role:'doctor'},null)).status,200);
 const bad=await api('/auth/register','POST',{...proof,email:'fake-nurse@example.invalid',password:'TestOnly123!',name:'Fake nurse',role:'caretaker',staffKind:'son',supervisingDoctorId:reg.data.user.id},null);assert.equal(bad.status,400);
});
test('failed transaction rolls back medication and schedule together',async()=>{
 await assert.rejects(db.createMedication(nurse,{id:'bad-schedule',elder_id:'elder-1',brand_name:'Test',generic_name:'Test',dose_amount:1,dose_unit:'mg',frequency:'Daily',times:[null]}));
 assert.equal((await pool.query("SELECT count(*) FROM medications WHERE id='bad-schedule'")).rows[0].count,'0');
});
test('terminated PostgreSQL connection is replaced and API remains usable',async()=>{
 const client=await pool.connect();const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;client.on('error',()=>{});await admin.query('SELECT pg_terminate_backend($1)',[pid]);client.release(true);
 assert.equal((await api('/health','GET',undefined,null)).status,200);
});

test('the real API server restarts, re-login restores data and logout is enforced',async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 let child;
 async function start(){child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:'+port+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('API startup timed out');}
 async function stop(){if(!child||child.exitCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill();});}
 async function login(){const r=await fetch('http://127.0.0.1:'+port+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:guardian.email,password:'Demo1234!',role:'guardian'})});assert.equal(r.status,200);return (await r.json()).token;}
 try{await start();let token=await login();await stop();await start();token=await login();const headers={Authorization:'Bearer '+token};const r=await fetch('http://127.0.0.1:'+port+'/api/dashboard-data',{headers});assert.equal(r.status,200);const data=await r.json();assert.ok(data.medications.some(m=>m.id==='pg-med'));assert.ok(data.alarms.some(a=>a.id==='pg-appointment'));assert.equal(data.reminderAcknowledgements.length,1);
 assert.equal((await fetch('http://127.0.0.1:'+port+'/api/auth/logout',{method:'POST',headers})).status,200);assert.equal((await fetch('http://127.0.0.1:'+port+'/api/dashboard-data',{headers})).status,401);
 }finally{await stop();}
});
test('invalid PostgreSQL startup fails safely instead of switching to JSON',async()=>{
 const result=await new Promise(resolve=>{const child=spawn(process.execPath,['server.js'],{env:{...process.env,DATABASE_URL:'postgresql://test@127.0.0.1:1/unavailable',PORT:'18799'},stdio:'ignore',windowsHide:true});child.once('exit',code=>resolve(code));});assert.equal(result,1);
});

test('hardware-key fall telemetry has no portal-user foreign key and stays one event until reset',async()=>{
 process.env.DEVICE_API_KEY='synthetic-test-device-key';process.env.DEVICE_ELDER_ID='elder-2';
 async function device(body){const r=await fetch(base+'/api/device/telemetry',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Key':process.env.DEVICE_API_KEY},body:JSON.stringify({elderId:'elder-2',...body})});return {status:r.status,data:await r.json()};}
 const first=await device({fallDetected:true,spo2:96});assert.equal(first.status,201);
 const alert=(await db.getAlerts(doctor)).find(a=>a.elderId==='elder-2' && a.type==='fall');assert.ok(alert);await db.updateAlert(alert.id,{resolved:true});assert.equal((await device({fallDetected:true})).status,201);
 assert.equal((await pool.query("SELECT count(*) FROM alerts WHERE elder_id='elder-2' AND type='fall'")).rows[0].count,'1');
 await device({fallDetected:false});await device({fallDetected:true});assert.equal((await pool.query("SELECT count(*) FROM alerts WHERE elder_id='elder-2' AND type='fall'")).rows[0].count,'2');
 delete process.env.DEVICE_API_KEY;delete process.env.DEVICE_ELDER_ID;
});
test('recent device telemetry takes priority over a simulator snapshot',async()=>{
 await api('/device/telemetry','POST',{elderId:'elder-1',spo2:95.7,fallDetected:false},nurse);
 await db.createVitalsReading({elderId:'elder-1',heart_rate:75,systolic_bp:120,diastolic_bp:80,spo2:91,stress:20,hydration:80,breathing_rate:16,skin_temp:36.5,source:'simulator'});
 const latest=(await db.getVitalsReadings('elder-1',1))[0];assert.equal(latest.source,'device');assert.equal(latest.spo2,95.7);
});

test('retry identities cannot expose or modify another patient medication/alarm',async()=>{
 const med={id:'med-3',elder_id:'elder-1',brand_name:'Test',generic_name:'Test',category:'Test',dose_amount:1,dose_unit:'mg',frequency:'Daily',times:['23:00']};assert.equal((await api('/medications','POST',med,guardian)).status,409);
 assert.equal((await db.getMedicationById('med-3')).elder_id,'elder-2');assert.ok(!(await db.getMedicationById('med-3')).times.includes('23:00'));
 assert.equal((await api('/alarms','POST',{id:'alarm-4',elderId:'elder-1',title:'Test',time:'12:00',type:'activity'},guardian)).status,409);
});

test('import preserves confirmed duplicate history and refuses ambiguous legacy duplicates',async()=>{
 const older={...low('import-older',91,'elder-2'),episode_recovered:false,time:'2026-10-01T10:00:00Z'};const newer={...low('import-current',92,'elder-2'),episode_recovered:false,time:'2026-10-01T10:01:00Z'};
 const source={alerts:[older,newer]};const result=await importData(pool,source);assert.equal(result.duplicatesClosed,1);assert.equal((await db.getAlertById(older.id)).resolved,true);assert.equal((await db.getAlertById(newer.id)).resolved,false);assert.equal(source.alerts[0].resolved,undefined);
 await assert.rejects(importData(pool,{alerts:[low('ambiguous-1',91,'elder-2'),low('ambiguous-2',92,'elder-2')]}),/require review/);
});

test('private identity-proof upload persists in PostgreSQL and stays reviewer restricted', async()=>{
 const reviewer=await db.findUserByEmail('new-doctor@example.invalid');
 const bytes=Buffer.from('%PDF-1.4\nSynthetic verification fixture\n%%EOF');
 const registration=await api('/auth/register','POST',{email:'proof-caretaker@example.invalid',password:'TestOnly123!',name:'Proof applicant',role:'caretaker',staffKind:'nurse',supervisingDoctorId:reviewer.id,proofId:'TEST-STAFF-ID',issuer:'Test clinic',proofFile:{fileName:'identity.pdf',fileType:'application/pdf',fileSize:bytes.length,fileData:bytes.toString('base64')}},null);
 assert.equal(registration.status,201);assert.equal(registration.data.user.accessStatus,'pending');
 const account=await db.findUserById(registration.data.user.id);assert.ok(account.profile.accessVerification.proofFile.id);assert.equal(account.profile.accessVerification.proofFile.fileData,undefined);
 const route=base+'/api/auth/access-requests/'+account.id+'/proof';
 const response=await fetch(route,{headers:{Authorization:'Bearer '+signToken(reviewer)}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 assert.equal((await fetch(route,{headers:{Authorization:'Bearer '+signToken(doctor)}})).status,403);
 const child=execFileSync(process.execPath,['--input-type=module','-e',"const {dbService,initDb,closeDb}=await import('./server/db.js');await initDb();const a=await dbService.findUserById('"+account.id+"');console.log(a.profile.guardianProofData);await closeDb();"],{env:process.env,encoding:'utf8'});assert.equal(child.trim().split('\n').at(-1),bytes.toString('base64'));
});

test('owner PostgreSQL review and read-only records enforce separate authentication', async()=>{
 const {hashPassword}=await import('../auth.js');process.env.OWNER_LOCAL_ENABLED='true';process.env.OWNER_EMAIL='owner@example.invalid';process.env.OWNER_PASSWORD_HASH=await hashPassword('SyntheticOwner123!');
 assert.equal((await api('/owner/accounts','GET',undefined,doctor)).status,401);
 const login=await api('/owner/login','POST',{email:'owner@example.invalid',password:'SyntheticOwner123!'},null);assert.equal(login.status,200);
 const token=login.data.token;
 const request=async(route,method='GET',body)=>{const res=await fetch(base+'/api/owner/'+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};};
 const records=await request('records');assert.equal(records.status,200);assert.equal(records.data.patients.length,3);assert.equal(records.data.reports.some(x=>x.file_path||x.file_data),false);
 const applicant=await db.findUserByEmail('proof-caretaker@example.invalid');
 assert.equal((await request('accounts/'+applicant.id,'PUT',{decision:'approved',elderIds:['elder-1'],note:'Synthetic owner checked evidence.'})).status,200);
 assert.equal((await db.findUserById(applicant.id)).profile.accessVerification.reviewedBy,'project-owner');
 const patient=await request('patients','POST',{full_name:'Synthetic owner patient',age:76,language_pref:'kn',medical_conditions:[]});assert.equal(patient.status,201);assert.equal((await db.getElderById(patient.data.id)).full_name,'Synthetic owner patient');
 const proofBytes=Buffer.from('%PDF-1.4\nSynthetic PostgreSQL consent\n%%EOF');
 const enrolled=await request('patients/'+patient.data.id+'/guardian','POST',{name:'Synthetic Guardian',email:'owner-guardian@example.invalid',phone:'',relationship:'daughter',note:'Synthetic authorization checked.',evidenceReviewed:true,proofFile:{fileName:'consent.pdf',fileType:'application/pdf',fileSize:proofBytes.length,fileData:proofBytes.toString('base64')}});assert.equal(enrolled.status,201);
 assert.equal(enrolled.data.user.profile.guardianProofData,undefined);
 const storedGuardian=await db.findUserById(enrolled.data.user.id);assert.deepEqual(await db.getAccessibleElderIds(storedGuardian),[patient.data.id]);
 const child=execFileSync(process.execPath,['--input-type=module','-e',"const {dbService,initDb,closeDb}=await import('./server/db.js');await initDb();const a=await dbService.findUserById('"+storedGuardian.id+"');console.log(a.profile.guardianProofData);await closeDb();"],{env:process.env,encoding:'utf8'});assert.equal(child.trim().split('\n').at(-1),proofBytes.toString('base64'));
 const proofRes=await fetch(base+'/api/owner/accounts/'+storedGuardian.id+'/proof',{headers:{Authorization:'Bearer '+token}});assert.equal(proofRes.status,200);assert.deepEqual(Buffer.from(await proofRes.arrayBuffer()),proofBytes);
 const credentials={email:storedGuardian.email,password:enrolled.data.temporaryPassword,role:'guardian'};assert.equal((await api('/auth/login','POST',credentials,null)).status,428);
 assert.equal((await api('/auth/login','POST',{...credentials,newPassword:'FreshSyntheticPassword123!'},null)).status,200);assert.equal((await api('/auth/login','POST',credentials,null)).status,401);
 const clinician=await db.findUserByEmail('new-doctor@example.invalid');assert.equal((await request('accounts/'+clinician.id,'PUT',{decision:'approved',elderIds:[],note:'Verified identity; no patient access yet.'})).status,200);assert.deepEqual((await db.findUserById(clinician.id)).assignedElderIds,[]);
 assert.equal((await request('logout','POST')).status,200);assert.equal((await request('records')).status,401);
 delete process.env.OWNER_EMAIL;delete process.env.OWNER_PASSWORD_HASH;
});
