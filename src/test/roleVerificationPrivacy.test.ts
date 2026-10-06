import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { rm } from 'node:fs/promises';

vi.mock('../../server/config.js', async () => {
  const actual = await vi.importActual<any>('../../server/config.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const DATA_DIR = mkdtempSync(join(tmpdir(), 'gcare-access-test-'));
  return { ...actual, DATA_DIR, DATA_FILE: join(DATA_DIR, 'db.json') };
});
import { DATA_DIR } from '../../server/config.js';
import { createSeedDb, dbService, readDb, writeDb, initDb } from '../../server/db.js';
import { handleRequest } from '../../server/handlers.js';
import { signToken, hashPassword } from '../../server/auth.js';
import { reviewAccess } from '../../server/accessReview.js';

const owner = { id: 'project-owner', name: 'Owner' };
const proof = { proofId: 'TEST-REG-1', issuer: 'Test issuing clinic', proofReference: 'Synthetic reference for automated tests' };
let server: Server; let base: string; let doctor: any; let passwordHash: string;
const payload = (role = 'doctor') => ({ email: `${role}@example.invalid`, password: 'TestOnly123!', name: 'Applicant', role,
  ...proof, staffKind: role === 'caretaker' ? 'nurse' : undefined,
  supervisingDoctorId: role === 'doctor' ? undefined : 'verified-doctor',
  relationship: role === 'guardian' ? 'son' : undefined, elderName: role === 'guardian' ? 'Usha' : undefined });
async function request(path: string, method = 'GET', body?: any, token?: string, extraHeaders = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
async function applicant(role: string) {
  const result = await request('/api/auth/register', 'POST', payload(role));
  expect(result.status).toBe(201); return result.data.user;
}
async function approvedNurse() {
  const user = await applicant('caretaker');
  return reviewAccess(doctor, user.id, 'approved', ['elder-1'], 'Synthetic reviewer checked the staff evidence.');
}

describe('Verified role registration and patient privacy (real isolated HTTP/JSON)', () => {
  beforeAll(async () => {
    vi.stubEnv('DEMO_AUTH_ENABLED', 'true'); vi.stubEnv('NODE_ENV', 'test');
    passwordHash = await hashPassword('TestOnly123!');
    server = createServer(async (req, res) => {
      try { await handleRequest(req, res, new URL(req.url!, 'http://localhost').pathname); }
      catch (error: any) { res.statusCode = error.statusCode || 500; res.end(JSON.stringify({ error: error.message })); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  beforeEach(async () => {
    const data = await createSeedDb();
    doctor = { id: 'verified-doctor', role: 'doctor', email: 'verified@example.invalid', name: 'Verified Test Doctor', passwordHash,
      assignedElderIds: ['elder-1', 'elder-2'], profile: { accessVerification: { ...proof, status: 'approved' } } };
    data.users.push(doctor); await writeDb(data);
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(DATA_DIR, { recursive: true, force: true }); vi.unstubAllEnvs();
  });
  it('creates an owner-approved guardian with persistent private proof, one patient and a one-use temporary password', async () => {
    vi.stubEnv('OWNER_LOCAL_ENABLED','true');vi.stubEnv('OWNER_EMAIL','owner@example.invalid');vi.stubEnv('OWNER_PASSWORD_HASH',passwordHash);
    const login=await request('/api/owner/login','POST',{email:'owner@example.invalid',password:'TestOnly123!'});const token=login.data.token;
    const bytes=Buffer.from('%PDF-1.4\nSynthetic guardian consent\n%%EOF');
    const body={name:'Test Guardian',email:'owner-created@example.invalid',phone:'',relationship:'son',note:'Synthetic consent reviewed for the test patient.',evidenceReviewed:true,proofFile:{fileName:'consent.pdf',fileType:'application/pdf',fileSize:bytes.length,fileData:bytes.toString('base64')}};
    const path='/api/owner/patients/elder-1/guardian';
    expect((await request(path,'POST',body,signToken(doctor))).status).toBe(401);
    expect((await request(path,'POST',{...body,evidenceReviewed:false},token)).status).toBe(400);
    expect((await request('/api/owner/patients/missing/guardian','POST',body,token)).status).toBe(404);
    const created=await request(path,'POST',body,token);expect(created.status).toBe(201);
    expect(created.data.user.assignedElderIds).toEqual(['elder-1']);expect(created.data.user.accessStatus).toBe('approved');
    expect(created.data.user.profile.guardianProofData).toBeUndefined();expect(created.data.user.passwordHash).toBeUndefined();
    expect((await request(path,'POST',body,token)).status).toBe(409);
    const stored=await dbService.findUserById(created.data.user.id);expect(Buffer.from(stored.profile.guardianProofData,'base64')).toEqual(bytes);
    const file=await fetch(base+'/api/owner/accounts/'+stored.id+'/proof',{headers:{Authorization:'Bearer '+token}});expect(file.status).toBe(200);expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
    const reissuePath='/api/owner/accounts/'+stored.id+'/temporary-password';
    expect((await request(reissuePath,'POST',{note:'Lost temporary password'},signToken(doctor))).status).toBe(401);
    const replacement=await request(reissuePath,'POST',{note:'Owner did not save the initial password.'},token);expect(replacement.status).toBe(200);
    expect((await request('/api/auth/login','POST',{email:body.email,password:created.data.temporaryPassword,role:'guardian'})).status).toBe(401);
    const creds={email:body.email,password:replacement.data.temporaryPassword,role:'guardian'};
    expect((await request('/api/auth/login','POST',creds)).status).toBe(428);
    expect((await request('/api/auth/login','POST',{...creds,newPassword:creds.password})).status).toBe(400);
    const signed=await request('/api/auth/login','POST',{...creds,newPassword:'NewPrivateTestPassword123!'});expect(signed.status).toBe(200);
    expect((await request('/api/dashboard-data','GET',undefined,signed.data.token)).data.elders.map((e:any)=>e.id)).toEqual(['elder-1']);
    expect((await request('/api/vitals?elderId=elder-3','GET',undefined,signed.data.token)).status).toBe(403);
    expect((await request('/api/auth/login','POST',creds)).status).toBe(401);
    expect((await request(reissuePath,'POST',{note:'Cannot reset an established password.'},token)).status).toBe(409);
    const accounts=await request('/api/owner/accounts','GET',undefined,token);expect(JSON.stringify(accounts.data)).not.toContain(bytes.toString('base64'));
  });
  it('persists uploaded proof, permits only the assigned reviewer, and preserves manual approval', async () => {
    const bytes = Buffer.from('%PDF-1.4\nSynthetic ID proof fixture\n%%EOF');
    const result = await request('/api/auth/register', 'POST', { ...payload('caretaker'), proofReference: '', proofFile: { fileName: 'proof.pdf', fileType: 'application/pdf', fileSize: bytes.length, fileData: bytes.toString('base64') } });
    expect(result.status).toBe(201); expect(result.data.user.accessStatus).toBe('pending');
    expect(result.data.user.profile.accessVerification.proofFile.fileData).toBeUndefined();
    await initDb();
    const path = `/api/auth/access-requests/${result.data.user.id}/proof`;
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${signToken(doctor)}` } });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect((await request(path)).status).toBe(401);
    const other = { ...doctor, id: 'other-reviewer', email: 'other@example.invalid' }; await dbService.createUser(other);
    expect((await request(path, 'GET', undefined, signToken(other))).status).toBe(403);
    await reviewAccess(doctor, result.data.user.id, 'approved', ['elder-1'], 'Synthetic proof checked.');
    expect((await request(path, 'GET', undefined, signToken(await dbService.findUserById(result.data.user.id)))).status).toBe(403);
  });
  it('rejects forged content, bad encoding, empty and oversized proof uploads', async () => {
    for (const file of [
      { fileData: Buffer.from('<script>bad</script>').toString('base64'), fileSize: 20 },
      { fileData: '!bad-base64', fileSize: 5 },
      { fileData: '', fileSize: 0 },
      { fileData: 'YQ==', fileSize: 5 * 1024 * 1024 + 1 },
    ]) {
      expect((await request('/api/auth/register', 'POST', { ...payload(), proofReference: '', proofFile: { fileName: 'proof.pdf', fileType: 'application/pdf', ...file } })).status).toBe(400);
    }
  });
  it('isolates owner login, proof review, records, rejection and logout from public roles', async () => {
    vi.stubEnv('OWNER_LOCAL_ENABLED','true');
    vi.stubEnv('OWNER_EMAIL', 'owner@example.invalid'); vi.stubEnv('OWNER_PASSWORD_HASH', passwordHash);
    expect((await request('/api/owner/accounts', 'GET', undefined, signToken(doctor))).status).toBe(401);
    expect((await request('/api/auth/register', 'POST', { ...payload(), role: 'owner' })).status).toBe(400);
    expect((await request('/api/owner/login', 'POST', {email:'owner@example.invalid',password:'wrong'})).status).toBe(401);
    const login = await request('/api/owner/login','POST',{email:'owner@example.invalid',password:'TestOnly123!'});
    expect(login.status).toBe(200);const token=login.data.token;
    vi.stubEnv('NODE_ENV','production');expect((await request('/api/owner/accounts','GET',undefined,token)).status).toBe(404);vi.stubEnv('NODE_ENV','test');
    expect((await request('/api/owner/accounts','GET',undefined,token,{Origin:'https://untrusted.example'})).status).toBe(404);
    const bytes=Buffer.from('%PDF-1.4\nSynthetic owner proof fixture\n%%EOF');
    const user=(await request('/api/auth/register','POST',{...payload(),proofReference:'',proofFile:{fileName:'proof.pdf',fileType:'application/pdf',fileSize:bytes.length,fileData:bytes.toString('base64')}})).data.user;
    const list=await request('/api/owner/accounts','GET',undefined,token);expect(list.status).toBe(200);expect(list.data.find((a:any)=>a.id===user.id).passwordHash).toBeUndefined();
    const file=await fetch(base+`/api/owner/accounts/${user.id}/proof`,{headers:{Authorization:`Bearer ${token}`}});expect(file.status).toBe(200);expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
    expect((await request('/api/owner/patients','POST',{full_name:'Synthetic patient',age:72,language_pref:'kn',medical_conditions:[]},signToken(doctor))).status).toBe(401);
    const records=await request('/api/owner/records','GET',undefined,token);expect(records.status).toBe(200);expect(records.data.patients).toHaveLength(3);
    expect((await request(`/api/owner/accounts/${user.id}`,'PUT',{decision:'approved',elderIds:[],note:'Checked'},token)).status).toBe(200);
    expect((await request(`/api/owner/accounts/${user.id}`,'PUT',{decision:'rejected',elderIds:[],note:'Blood test is not professional identity proof.'},token)).status).toBe(200);
    expect((await request('/api/auth/login','POST',{email:payload().email,password:'TestOnly123!'})).status).toBe(401);
    const approval=await request(`/api/owner/accounts/${user.id}`,'PUT',{decision:'approved',elderIds:['elder-1'],note:'Valid evidence independently checked.'},token);expect(approval.status).toBe(200);
    expect((await request('/api/auth/login','POST',{email:payload().email,password:'TestOnly123!'})).status).toBe(401);
    expect((await request('/api/auth/login','POST',{email:payload().email,password:approval.data.temporaryPassword,newPassword:'FreshPassword123!'})).status).toBe(200);
    const created=await request('/api/owner/patients','POST',{full_name:'Synthetic patient',age:72,language_pref:'kn',medical_conditions:[]},token);expect(created.status).toBe(201);expect((await dbService.getElderById(created.data.id)).full_name).toBe('Synthetic patient');
    vi.stubEnv('OWNER_EMAIL','changed@example.invalid');expect((await request('/api/owner/accounts','GET',undefined,token)).status).toBe(401);vi.stubEnv('OWNER_EMAIL','owner@example.invalid');
    expect((await request('/api/owner/logout','POST',undefined,token)).status).toBe(200);expect((await request('/api/owner/accounts','GET',undefined,token)).status).toBe(401);
    vi.stubEnv('OWNER_EMAIL','');vi.stubEnv('OWNER_PASSWORD_HASH','');
    expect((await request('/api/owner/login','POST',{email:'owner@example.invalid',password:'TestOnly123!'})).status).toBe(503);
  });
  it('owner approval generates one-use credentials for doctor, independent nurse and guardian requests',async()=>{
    vi.stubEnv('OWNER_LOCAL_ENABLED','true');vi.stubEnv('OWNER_EMAIL','owner@example.invalid');vi.stubEnv('OWNER_PASSWORD_HASH',passwordHash);
    const ownerToken=(await request('/api/owner/login','POST',{email:'owner@example.invalid',password:'TestOnly123!'})).data.token;
    for(const role of ['doctor','caretaker','guardian']){
      const bytes=Buffer.from('%PDF-1.4\nSynthetic role evidence\n%%EOF');
      const body={...payload(role),supervisingDoctorId:undefined,proofReference:'',proofFile:{fileName:'proof.pdf',fileType:'application/pdf',fileSize:bytes.length,fileData:bytes.toString('base64')}};
      const registration=await request('/api/auth/register','POST',body);expect(registration.status).toBe(201);expect(registration.data.token).toBeUndefined();
      const user=registration.data.user;const oldToken=signToken(user);
      const approval=await request('/api/owner/accounts/'+user.id,'PUT',{decision:'approved',elderIds:['elder-2'],note:'Synthetic evidence reviewed by owner.'},ownerToken);expect(approval.status).toBe(200);expect(approval.data.temporaryPassword.length).toBeGreaterThan(20);
      expect((await request('/api/dashboard-data','GET',undefined,oldToken)).status).toBe(401);
      const creds={email:user.email,password:approval.data.temporaryPassword,role};expect((await request('/api/auth/login','POST',creds)).status).toBe(428);
      const login=await request('/api/auth/login','POST',{...creds,newPassword:'NewPrivatePassword123!'});expect(login.status).toBe(200);
      expect((await request('/api/dashboard-data','GET',undefined,login.data.token)).data.elders.map((e:any)=>e.id)).toEqual(['elder-2']);
      expect((await request('/api/dashboard-data','GET',undefined,oldToken)).status).toBe(401);
      const again=await request('/api/owner/accounts/'+user.id,'PUT',{decision:'approved',elderIds:['elder-2'],note:'Assignments reviewed without resetting password.'},ownerToken);expect(again.data.temporaryPassword).toBeUndefined();
      expect((await request('/api/auth/login','POST',creds)).status).toBe(401);
    }
  });
  it('requires evidence for every role, including direct API registration', async () => {
    for (const role of ['doctor', 'caretaker', 'guardian']) {
      const body = payload(role); delete (body as any).proofId;
      expect((await request('/api/auth/register', 'POST', body)).status).toBe(400);
    }
  });
  it('keeps an applicant pending, returns no JWT, and ignores forged approval/assignment fields', async () => {
    const result = await request('/api/auth/register', 'POST', { ...payload(), accessStatus: 'approved', assignedElderIds: ['elder-1'], profile: { accessVerification: { status: 'approved' } } });
    expect(result.status).toBe(201); expect(result.data.token).toBeUndefined();
    expect(result.data.user.accessStatus).toBe('pending'); expect(result.data.user.assignedElderIds).toEqual([]);
    expect((await request('/api/auth/login', 'POST', { email: payload().email, password: payload().password })).status).toBe(403);
    expect((await request('/api/dashboard-data', 'GET', undefined, signToken(result.data.user))).status).toBe(401);
  });
  it('rejects family relationship values in the nurse/assistant role', async () => {
    for (const staffKind of ['son', 'daughter', 'uncle', 'doctor']) {
      expect((await request('/api/auth/register', 'POST', { ...payload('caretaker'), staffKind })).status).toBe(400);
    }
  });
  it('requires a listed supervising doctor instead of accepting an invented doctor', async () => {
    expect((await request('/api/auth/register', 'POST', { ...payload('caretaker'), supervisingDoctorId: 'invented' })).status).toBe(400);
  });
  it('requires owner review for doctors and persists approval across database reload', async () => {
    const user = await applicant('doctor');
    await expect(reviewAccess(doctor, user.id, 'approved', ['elder-1'], 'Checked')).rejects.toMatchObject({ statusCode: 403 });
    await reviewAccess(owner, user.id, 'approved', ['elder-1'], 'Synthetic owner checked issuing authority.', true);
    await initDb();
    const login = await request('/api/auth/login', 'POST', { email: payload().email, password: payload().password, role: 'doctor' });
    expect(login.status).toBe(200); expect(login.data.token).toBeTruthy();
    expect((await request('/api/dashboard-data', 'GET', undefined, login.data.token)).data.elders.map((e: any) => e.id)).toEqual(['elder-1']);
  });
  it('lets only the applicant’s verified supervising doctor review staff and guardians', async () => {
    const user = await applicant('guardian');
    const unrelated = { ...doctor, id: 'other-doctor' };
    await expect(reviewAccess(unrelated, user.id, 'approved', ['elder-1'], 'Checked')).rejects.toMatchObject({ statusCode: 403 });
    await expect(reviewAccess(doctor, user.id, 'approved', ['elder-3'], 'Checked')).rejects.toMatchObject({ statusCode: 403 });
    const approved = await request(`/api/auth/access-requests/${user.id}`, 'PUT', { decision: 'approved', elderIds: ['elder-1'], note: 'Synthetic consent checked.' }, signToken(doctor));
    expect(approved.status).toBe(200);
  });
  it('does not grant a guardian access from a matching patient name or profile edits', async () => {
    const user = await applicant('guardian');
    const approved = await reviewAccess(doctor, user.id, 'approved', ['elder-1'], 'Synthetic consent checked.');
    const token = signToken(approved);
    await request('/api/auth/profile', 'PUT', { profile: { elderName: 'Venkatesh Rao', accessVerification: { status: 'approved', supervisingDoctorId: 'other-doctor' }, assignedElderIds: ['elder-3'] } }, token);
    const data = await request('/api/dashboard-data', 'GET', undefined, token);
    expect(data.data.elders.map((e: any) => e.id)).toEqual(['elder-1']);
    expect((await request('/api/vitals?elderId=elder-3', 'GET', undefined, token)).status).toBe(403);
    expect((await dbService.findUserById(user.id)).profile.accessVerification.supervisingDoctorId).toBe(doctor.id);
  });
  it('limits a nurse to assigned patients for dashboard, vitals, device, reports and assistant context', async () => {
    const nurse = await approvedNurse(); const token = signToken(nurse);
    expect((await request('/api/dashboard-data', 'GET', undefined, token)).data.elders.map((e: any) => e.id)).toEqual(['elder-1']);
    for (const path of ['/api/vitals?elderId=elder-3', '/api/device/vitals?elderId=elder-3', '/api/reports?elderId=elder-3']) {
      expect((await request(path, 'GET', undefined, token)).status).toBe(403);
    }
    expect((await request('/api/alerts', 'POST', { elder_id: 'elder-3', type: 'low_spo2', severity: 'warning', message: 'Test' }, token)).status).toBe(403);
    expect((await request('/api/device/telemetry', 'POST', { elderId: 'elder-3' }, token)).status).toBe(403);
    expect((await request('/api/assistant/chat', 'POST', { elderId: 'elder-3', message: 'Patient vitals' }, token)).status).toBe(403);
  });
  it('protects patient APIs and patient assistant context from anonymous demo fallback', async () => {
    for (const path of ['/api/dashboard-data', '/api/elders', '/api/alerts', '/api/device/vitals?elderId=elder-1', '/api/reports?elderId=elder-1']) {
      expect((await request(path)).status).toBe(401);
    }
    expect((await request('/api/assistant/chat', 'POST', { elderId: 'elder-1', message: 'Patient vitals' })).status).toBe(401);
  });
  it('rejects a role mismatch at login instead of changing the stored role', async () => {
    const nurse = await approvedNurse();
    expect((await request('/api/auth/login', 'POST', { email: nurse.email, password: payload().password, role: 'doctor' })).status).toBe(403);
  });
  it('suspension immediately blocks an existing JWT and removes assignments', async () => {
    const nurse = await approvedNurse(); const token = signToken(nurse);
    await reviewAccess(doctor, nurse.id, 'suspended', [], 'Synthetic access withdrawn.');
    expect((await request('/api/dashboard-data', 'GET', undefined, token)).status).toBe(401);
    expect((await dbService.findUserById(nurse.id)).assignedElderIds).toEqual([]);
  });
  it('removes nurse access when the supervising doctor loses the patient assignment', async () => {
    const nurse = await approvedNurse();
    await dbService.setUserAccess(doctor.id, doctor.profile.accessVerification, ['elder-2']);
    expect((await request('/api/dashboard-data', 'GET', undefined, signToken(nurse))).data.elders).toEqual([]);
  });
  it('rejects legacy unverified accounts and disables demo credentials in production', async () => {
    const legacy = { id: 'legacy', email: 'legacy@example.invalid', passwordHash, role: 'caretaker', name: 'Legacy', profile: {}, assignedElderIds: ['elder-1'] };
    await dbService.createUser(legacy);
    expect((await request('/api/auth/login', 'POST', { email: legacy.email, password: payload().password })).status).toBe(403);
    vi.stubEnv('NODE_ENV', 'production');
    expect((await request('/api/auth/login', 'POST', { email: 'dr.ramesh@apollo.in', password: 'Demo1234!' })).status).toBe(403);
    vi.stubEnv('NODE_ENV', 'test');
  });
  it('never exposes password hashes or applicant evidence in the public doctor directory', async () => {
    const directory = await request('/api/auth/doctors');
    expect(directory.status).toBe(200);
    expect(directory.data.find((d: any) => d.id === doctor.id)).toMatchObject({ name: doctor.name });
    expect(JSON.stringify(directory.data)).not.toMatch(/passwordHash|proofId|assignedElderIds/);
  });
  it('scopes hardware credentials to one patient without permitting portal access', async () => {
    vi.stubEnv('DEVICE_API_KEY', 'synthetic-test-device-key'); vi.stubEnv('DEVICE_ELDER_ID', 'elder-1');
    const headers = { 'x-device-key': 'synthetic-test-device-key' };
    expect((await request('/api/device/telemetry', 'POST', { elderId: 'elder-1', heartRate: 75, spo2: 98 }, undefined, headers)).status).toBe(201);
    expect((await request('/api/device/telemetry', 'POST', { elderId: 'elder-3' }, undefined, headers)).status).toBe(403);
    expect((await request('/api/dashboard-data', 'GET', undefined, undefined, headers)).status).toBe(401);
  });
  it('requires selected patients and a review note instead of approval with no verification record', async () => {
    const user = await applicant('guardian');
    await expect(reviewAccess(doctor, user.id, 'approved', [], 'Checked')).rejects.toMatchObject({ statusCode: 400 });
    await expect(reviewAccess(doctor, user.id, 'approved', ['elder-1'], '')).rejects.toMatchObject({ statusCode: 400 });
  });
});
