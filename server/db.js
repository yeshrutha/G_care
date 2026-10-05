import { saveReportFile, loadReportFile } from './reportFiles.js';
import { hasApprovedAccess, isDemoAccount, DEMO_PATIENT_IDS, safeEditableProfile } from './accessPolicy.js';
import { mkdir, readFile, writeFile, rename, unlink, copyFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import crypto from 'node:crypto';
import { verifyMigrations } from './migrate.js';
import { getAlertEpisodeKey, getCanonicalAnomalyType, isPhysiologicalEpisode } from '../src/lib/alertEpisodeIdentity.js';
import { DATA_DIR, DATA_FILE } from './config.js';
import { hashPassword } from './auth.js';

const { Pool } = pg;

export const DEMO_CARETAKER_ID = 'user-demo-caretaker';
export const DEMO_DOCTOR_ID = 'user-demo-doctor';
export const DEMO_GUARDIAN_ID = 'user-demo-guardian';

const seedElders = [
  {
    id: 'elder-1',
    ownerId: DEMO_CARETAKER_ID,
    full_name: 'Usha',
    age: 77,
    medical_conditions: ['Hypertension', 'Type 2 Diabetes', 'Mild Arthritis'],
    language_pref: 'kn',
    connection_status: 'connected',
    battery: 78,
    last_vitals_at: new Date().toISOString(),
    baselines_learned: true,
  },
  {
    id: 'elder-2',
    ownerId: DEMO_CARETAKER_ID,
    full_name: 'Lakshmi Devi',
    age: 82,
    medical_conditions: ['Atrial Fibrillation', 'Osteoporosis'],
    language_pref: 'ta',
    connection_status: 'connected',
    battery: 54,
    last_vitals_at: new Date(Date.now() - 120000).toISOString(),
    baselines_learned: true,
  },
  {
    id: 'elder-3',
    ownerId: DEMO_CARETAKER_ID,
    full_name: 'Venkatesh Rao',
    age: 71,
    medical_conditions: ['COPD', 'Anxiety'],
    language_pref: 'hi',
    connection_status: 'connected',
    battery: 91,
    last_vitals_at: new Date(Date.now() - 60000).toISOString(),
    baselines_learned: false,
    baseline_day: 3,
  },
];

const seedMedications = [
  {
    id: 'med-1',
    elder_id: 'elder-1',
    ownerId: DEMO_CARETAKER_ID,
    brand_name: 'Glucophage',
    generic_name: 'Metformin HCl',
    category: 'Antidiabetic',
    dose_amount: 500,
    dose_unit: 'mg',
    frequency: 'Twice daily',
    times: ['08:00', '20:00'],
    instructions: 'Take with food',
    photo: '',
    active: true,
  },
  {
    id: 'med-2',
    elder_id: 'elder-1',
    ownerId: DEMO_CARETAKER_ID,
    brand_name: 'Amlodac',
    generic_name: 'Amlodipine',
    category: 'Antihypertensive',
    dose_amount: 5,
    dose_unit: 'mg',
    frequency: 'Once daily',
    times: ['08:00'],
    instructions: 'Take in the morning',
    photo: '',
    active: true,
  },
  {
    id: 'med-3',
    elder_id: 'elder-2',
    ownerId: DEMO_CARETAKER_ID,
    brand_name: 'Ecosprin',
    generic_name: 'Aspirin',
    category: 'Antiplatelet',
    dose_amount: 75,
    dose_unit: 'mg',
    frequency: 'Once daily',
    times: ['09:00'],
    instructions: 'Take after breakfast',
    photo: '',
    active: true,
  },
];

const seedAlarms = [
  { id: 'alarm-1', time: '08:00', title: 'Morning medicines', elderId: 'elder-1', ownerId: DEMO_CARETAKER_ID, status: 'Due soon', type: 'medication', notes: 'Morning medication reminder' },
  { id: 'alarm-2', time: '08:30', title: 'Breakfast reminder', elderId: 'elder-1', ownerId: DEMO_CARETAKER_ID, status: 'Scheduled', type: 'food', notes: 'Breakfast reminder' },
  { id: 'alarm-3', time: '12:30', title: 'Lunch reminder', elderId: 'elder-2', ownerId: DEMO_CARETAKER_ID, status: 'Scheduled', type: 'food', notes: 'Lunch reminder' },
  { id: 'alarm-4', time: '18:30', title: 'Evening walk', elderId: 'elder-3', ownerId: DEMO_CARETAKER_ID, status: 'Scheduled', type: 'activity', notes: 'Evening activity reminder' },
];

async function buildSeedUsers() {
  const demoPassword = await hashPassword('Demo1234!');
  return [
    {
      id: DEMO_CARETAKER_ID,
      email: 'demo@guardianwatch.in',
      passwordHash: demoPassword,
      name: 'Demo Caretaker',
      role: 'caretaker',
      phone: '+91 98765 43210',
      profile: {},
      assignedElderIds: ['elder-1', 'elder-2', 'elder-3'],
      createdAt: new Date().toISOString(),
    },
    {
      id: DEMO_DOCTOR_ID,
      email: 'dr.ramesh@apollo.in',
      passwordHash: demoPassword,
      name: 'Dr. Ramesh Kumar',
      role: 'doctor',
      phone: '+91 98765 43211',
      profile: { hospital: 'Apollo Hospitals', specialization: 'Cardiologist' },
      assignedElderIds: ['elder-1', 'elder-2', 'elder-3'],
      createdAt: new Date().toISOString(),
    },
    {
      id: DEMO_GUARDIAN_ID,
      email: 'guardian@example.com',
      passwordHash: demoPassword,
      name: 'Guardian User',
      role: 'guardian',
      phone: '+91 98765 43212',
      profile: {
        elderName: 'Usha',
        elderAge: '77',
        elderLanguage: 'kn',
        elderConditions: 'Hypertension, Type 2 Diabetes',
      },
      assignedElderIds: ['elder-1'],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-1790536871126-xdfb0l',
      email: 'vishwamohansn@gmail.com',
      passwordHash: demoPassword,
      name: 'Vishwa',
      role: 'guardian',
      phone: '+91 98765 43212',
      profile: {
        elderName: 'Usha',
        elderAge: '77',
        elderLanguage: 'kn',
        elderConditions: 'Hypertension, Type 2 Diabetes',
      },
      assignedElderIds: ['elder-1'],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-1790535155932-ufytv9',
      email: 'yeshruthagowda@gmail.com',
      passwordHash: demoPassword,
      name: 'Yeshrutha S',
      role: 'caretaker',
      phone: '+91 98765 43210',
      profile: {},
      assignedElderIds: ['elder-1', 'elder-2', 'elder-3'],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-1790535120996-1p6bav',
      email: 'dr.ramesh@gmail.com',
      passwordHash: demoPassword,
      name: 'Ramesh',
      role: 'doctor',
      phone: '+91 98765 43211',
      profile: { hospital: 'Apollo Hospitals', specialization: 'Cardiologist' },
      assignedElderIds: ['elder-1', 'elder-2', 'elder-3'],
      createdAt: new Date().toISOString(),
    },
  ];
}

export async function createSeedDb() {
  return {
    users: await buildSeedUsers(),
    elders: structuredClone(seedElders),
    medications: structuredClone(seedMedications),
    alarms: structuredClone(seedAlarms),
    alerts: [],
    auditLogs: [],
    revokedTokens: [],
    vitalsReadings: [],
    clinicalNotes: [],
    reports: [],
  };
}

// Windows tools can prefix UTF-8 files with a byte-order mark. Strip it before
// parsing so a valid local database is never mistaken for a corrupt one.
function parseLocalDb(raw) {
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

// Database Connection Setup
let pool = null;
let usePostgres = false;
let memoryDb = null;
let writeQueue = Promise.resolve();

const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
      connectionTimeoutMillis: 5000, max: Number(process.env.PG_POOL_MAX || 10),
    });
    pool.on?.('error', () => console.error('PostgreSQL connection lost; subsequent requests will retry through the pool.'));
    console.log('PostgreSQL persistence selected.');
    usePostgres = true;
  } catch (err) {
    throw new Error('Unable to initialize the configured PostgreSQL connection.');
  }
} else {
  console.log('DATABASE_URL not set. Using JSON file database fallback.');
}

// Initialize tables if Postgres is used
export async function initDb() {
  if (!usePostgres) {
    await mkdir(DATA_DIR, { recursive: true });
    let data;
    try {
      const raw = await readFile(DATA_FILE, 'utf8');
      data = parseLocalDb(raw);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
      data = await createSeedDb();
      await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      console.log('Local fallback JSON DB seeded.');
      memoryDb = data;
      return;


      }
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 60));
        try {
          const raw = await readFile(DATA_FILE, 'utf8');
          data = parseLocalDb(raw);
          break;
        } catch {}
      }
      if (!data) {
        data = memoryDb || (await createSeedDb());
      }
    }

    const seed = await createSeedDb();
    let changed = false;
    if (!Array.isArray(data.users)) data.users = [];

    for (const seedUser of seed.users) {
      const existing = data.users.find((u) => u.email === seedUser.email);
      if (!existing) {
        data.users.push(seedUser);
        changed = true;
      }
    }

    if (!Array.isArray(data.elders) || data.elders.length === 0) {
      data.elders = seed.elders;
      changed = true;
    }
    if (!Array.isArray(data.medications) || data.medications.length === 0) {
      data.medications = seed.medications;
      changed = true;
    }
    if (!Array.isArray(data.alarms) || data.alarms.length === 0) {
      data.alarms = seed.alarms;
      changed = true;
    }

    if (changed) {
      await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      console.log('Local fallback JSON DB updated with demo seeds.');
    }
    memoryDb = data;
    return;
  }

  await verifyMigrations(pool);
}

// Local File DB Helper APIs
export async function readDb() {
  if (memoryDb) return memoryDb;
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    const data = parseLocalDb(raw);
    data.users = Array.isArray(data.users) ? data.users : [];
    data.elders = Array.isArray(data.elders) ? data.elders : [];
    data.medications = Array.isArray(data.medications) ? data.medications : [];
    data.alarms = Array.isArray(data.alarms) ? data.alarms : [];
    data.alerts = Array.isArray(data.alerts) ? data.alerts : [];
    data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
    data.revokedTokens = Array.isArray(data.revokedTokens) ? data.revokedTokens : [];
    data.vitalsReadings = Array.isArray(data.vitalsReadings) ? data.vitalsReadings : [];
    data.clinicalNotes = Array.isArray(data.clinicalNotes) ? data.clinicalNotes : [];
    data.reports = Array.isArray(data.reports) ? data.reports : [];
    memoryDb = data;
    return data;
  } catch (err) {
    if (memoryDb) return memoryDb;
    if (err && err.code === 'ENOENT') {
    const data = await createSeedDb();
    await writeDb(data);
    return structuredClone(data);
    }
    for (let retry = 0; retry < 5; retry++) {
      await new Promise((r) => setTimeout(r, 60));
      try {
        const raw = await readFile(DATA_FILE, 'utf8');
        const data = parseLocalDb(raw);
        memoryDb = data;
        return data;
      } catch {}
    }
    if (memoryDb) return memoryDb;
    throw err;
  }
}

export async function writeDb(data) {
  memoryDb = data;
  await mkdir(DATA_DIR, { recursive: true });
  writeQueue = writeQueue.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const json = JSON.stringify(data, null, 2);
    const tempFile = path.join(DATA_DIR, `db.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);
    try {
      await writeFile(tempFile, json, 'utf8');
      try {
        await rename(tempFile, DATA_FILE);
      } catch {
        await copyFile(tempFile, DATA_FILE);
        await unlink(tempFile).catch(() => {});
      }
    } catch {
      await writeFile(DATA_FILE, json, 'utf8');
    }
  }).catch((err) => {
    console.error('Failed to write local database file:', err);
  });
  return writeQueue;
}

// Serialize read/modify/write for the JSON adapter. PostgreSQL additionally
// locks the elder row within a transaction, including across server processes.
let alertMutationQueue = Promise.resolve();
function serializeAlertMutation(operation) {
  const result = alertMutationQueue.then(operation);
  alertMutationQueue = result.catch(() => {});
  return result;
}

async function createAlertRecord(user, alert) {
  const elderId = alert.elderId || alert.elder_id;
  const resolved = alert.resolved ?? false;
  const key = getAlertEpisodeKey({ ...alert, elderId });
  const managed = isPhysiologicalEpisode(alert);
  const saved = {
    id: alert.id || 'alert-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    elderId, ownerId: user.role === 'device' ? null : user.id, type: alert.type, severity: alert.severity,
    message: alert.message, location: alert.location || '', resolved,
    anomaly_type: managed ? getCanonicalAnomalyType(alert) : null,
    episode_recovered: false, time: alert.time || new Date().toISOString(),
  };
  let client;
  try {
    let records, fileDb;
    if (usePostgres) {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query('SELECT id FROM elders WHERE id = $1 FOR UPDATE', [elderId]);
      const result = await client.query('SELECT * FROM alerts WHERE elder_id = $1 ORDER BY time DESC', [elderId]);
      records = result.rows;
    } else {
      fileDb = await readDb();
      fileDb.alerts ||= [];
      records = fileDb.alerts;
    }
    const matching = records.filter(a => getAlertEpisodeKey(a) === key)
      .sort((a, b) => new Date(b.time) - new Date(a.time));
    // Idempotent retries must never reopen a resolved alert.
    const sameId = records.find(a => a.id === saved.id);
    const latest = matching[0];
    const acknowledged = managed && latest?.resolved && latest.anomaly_type && !latest.episode_recovered;
    const existing = sameId || (!resolved && (acknowledged ? latest : matching.find(a => !a.resolved && !a.episode_recovered)));
    let result;
    if (existing) {
      result = { ...existing };
      if (!existing.resolved) {
        result.message = saved.message;
        result.time = saved.time;
        result.severity = saved.severity === 'critical' ? 'critical' : existing.severity;
        result.anomaly_type ||= saved.anomaly_type;
        if (usePostgres) await client.query(
          'UPDATE alerts SET message = $1, time = $2, severity = $3, anomaly_type = $4 WHERE id = $5',
          [result.message, result.time, result.severity, result.anomaly_type, existing.id]);
        else Object.assign(existing, result);
      }
    } else {
      result = saved;
      if (usePostgres) await client.query(
        'INSERT INTO alerts (id, elder_id, owner_id, type, severity, message, location, resolved, time, anomaly_type, episode_recovered) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [saved.id, elderId, saved.ownerId, saved.type, saved.severity, saved.message, saved.location, resolved, saved.time, saved.anomaly_type, false]);
      else fileDb.alerts.unshift(saved);
    }
    let name;
    if (usePostgres) {
      const { rows } = await client.query('SELECT full_name FROM elders WHERE id = $1', [elderId]);
      name = rows[0]?.full_name || '';
      await client.query('COMMIT');
    } else {
      await writeDb(fileDb);
      name = fileDb.elders.find(e => e.id === elderId)?.full_name || '';
    }
    return { ...result, elderId, elder_id: elderId, elderName: name, elder_name: name,
      time: result.time instanceof Date ? result.time.toISOString() : result.time };
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err;
  } finally { client?.release(); }
}

// Main DB Service Class Interface
export const dbService = {
  acknowledgeReminder: async (user, body) => {
    if (usePostgres) {
      await pool.query('INSERT INTO reminder_acknowledgements(elder_id,reminder_id,occurrence_date,user_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [body.elderId,body.reminderId,body.occurrenceDate,user.id]);
    } else { const data=await readDb(); data.reminderAcknowledgements ||= []; if (!data.reminderAcknowledgements.some(r=>r.elderId===body.elderId && r.reminderId===body.reminderId && r.occurrenceDate===body.occurrenceDate)) { data.reminderAcknowledgements.push({...body,userId:user.id,acknowledgedAt:new Date().toISOString()}); await writeDb(data); } }
    return { ...body, verified:true };
  },
  getReminderAcknowledgements: async (user) => {
    const ids=await dbService.getAccessibleElderIds(user);
    if (usePostgres) { const {rows}=await pool.query('SELECT * FROM reminder_acknowledgements WHERE elder_id=ANY($1) ORDER BY acknowledged_at DESC',[ids]); return rows.map(r=>({elderId:r.elder_id,reminderId:r.reminder_id,occurrenceDate:String(r.occurrence_date).slice(0,10),acknowledgedAt:r.acknowledged_at})); }
    return ((await readDb()).reminderAcknowledgements || []).filter(r=>ids.includes(r.elderId));
  },
  // --- USERS ---
  findUserByEmail: async (email) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (usePostgres) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalized]);
      if (!rows.length) return null;
      const u = rows[0];
      const { rows: rels } = await pool.query('SELECT elder_id FROM user_elders WHERE user_id = $1', [u.id]);
      return {
        id: u.id,
        email: u.email,
        passwordHash: u.password_hash,
        name: u.name,
        role: u.role,
        phone: u.phone,
        profile: u.profile,
        assignedElderIds: rels.map((r) => r.elder_id),
        createdAt: u.created_at ? u.created_at.toISOString() : new Date().toISOString(),
      };
    } else {
      const fileDb = await readDb();
      return fileDb.users.find((u) => u.email === normalized) || null;
    }
  },

  findUserById: async (id) => {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (!rows.length) return null;
      const u = rows[0];
      const { rows: rels } = await pool.query('SELECT elder_id FROM user_elders WHERE user_id = $1', [u.id]);
      return {
        id: u.id,
        email: u.email,
        passwordHash: u.password_hash,
        name: u.name,
        role: u.role,
        phone: u.phone,
        profile: u.profile,
        assignedElderIds: rels.map((r) => r.elder_id),
        createdAt: u.created_at ? u.created_at.toISOString() : new Date().toISOString(),
      };
    } else {
      const fileDb = await readDb();
      return fileDb.users.find((u) => u.id === id) || null;
    }
  },

  createUser: async (user) => {
    if (usePostgres) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
      await client.query(
        'INSERT INTO users (id, email, password_hash, name, role, phone, profile, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [user.id, user.email, user.passwordHash, user.name, user.role, user.phone, JSON.stringify(user.profile), user.createdAt]
      );
      if (user.assignedElderIds && user.assignedElderIds.length > 0) {
        for (const elderId of user.assignedElderIds) {
          await client.query('INSERT INTO user_elders (user_id, elder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, elderId]);
        }
      }
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      return user;
    } else {
      const fileDb = await readDb();
      fileDb.users.unshift(user);
      await writeDb(fileDb);
      return user;
    }
  },

  listUsers: async () => {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT id FROM users');
      return Promise.all(rows.map(u => dbService.findUserById(u.id)));
    }
    return (await readDb()).users;
  },
  setUserAccess: async (id, verification, assignedElderIds) => {
    if (usePostgres) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT profile FROM users WHERE id = $1 FOR UPDATE', [id]);
        if (!rows.length) throw new Error('Account not found');
        const profile = { ...(rows[0].profile || {}), accessVerification: verification };
        await client.query('UPDATE users SET profile = $1 WHERE id = $2', [JSON.stringify(profile), id]);
        await client.query('DELETE FROM user_elders WHERE user_id = $1', [id]);
        for (const elderId of assignedElderIds) await client.query('INSERT INTO user_elders (user_id, elder_id) VALUES ($1,$2)', [id, elderId]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } else {
      const data = await readDb();
      const account = data.users.find(u => u.id === id);
      if (!account) throw new Error('Account not found');
      account.profile = { ...(account.profile || {}), accessVerification: verification };
      account.assignedElderIds = [...new Set(assignedElderIds)];
      await writeDb(data);
    }
    return dbService.findUserById(id);
  },

  updateUserProfile: async (id, name, phone, profile) => {
    profile = safeEditableProfile(profile);
    if (usePostgres) {
      const existing = await dbService.findUserById(id);
      if (!existing) return null;

      const mergedProfile = { ...(existing.profile || {}), ...(profile || {}) };
      await pool.query(
        "UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), profile = COALESCE(profile, '{}'::jsonb) || $3::jsonb WHERE id = $4",
        [name, phone, JSON.stringify(profile), id]
      );
      return await dbService.findUserById(id);
    } else {
      const fileDb = await readDb();
      const idx = fileDb.users.findIndex((u) => u.id === id);
      if (idx === -1) return null;

      fileDb.users[idx] = {
        ...fileDb.users[idx],
        name: name !== undefined ? name : fileDb.users[idx].name,
        phone: phone !== undefined ? phone : fileDb.users[idx].phone,
        profile: {
          ...(fileDb.users[idx].profile || {}),
          ...(profile || {}),
        },
      };
      await writeDb(fileDb);
      return fileDb.users[idx];
    }
  },

  // --- ELDERS ---
  getAccessibleElderIds: async (user) => {
    const stored = await dbService.findUserById(user?.id);
    if (!stored || !hasApprovedAccess(stored)) return [];
    let ids = stored.assignedElderIds || [];
    if (isDemoAccount(stored)) {
      // Known demo accounts never inherit real patients, even through ownership.
      if (stored.id === DEMO_CARETAKER_ID && ids.length === 0) ids = DEMO_PATIENT_IDS;
      return ids.filter(id => DEMO_PATIENT_IDS.includes(id));
    }
    if (stored.role === 'caretaker' || stored.role === 'guardian') {
      const verification = stored.profile?.accessVerification;
      if (stored.role === 'caretaker' && !['nurse', 'assistant'].includes(verification?.staffKind)) return [];
      const doctor = await dbService.findUserById(verification.supervisingDoctorId);
      if (doctor?.role !== 'doctor' || doctor.profile?.accessVerification?.status !== 'approved') return [];
      ids = ids.filter(id => doctor.assignedElderIds?.includes(id));
    }
    return [...new Set(ids)];
  },

  getElders: async (user) => {
    const elderIds = await dbService.getAccessibleElderIds(user);
    if (usePostgres) {
      if (elderIds.length === 0) return [];
      const { rows } = await pool.query(
        'SELECT * FROM elders WHERE id = ANY($1) ORDER BY created_at DESC',
        [elderIds]
      );
      return rows.map((e) => ({
        id: e.id,
        ownerId: e.owner_id,
        full_name: e.full_name,
        age: e.age,
        medical_conditions: e.medical_conditions,
        language_pref: e.language_pref,
        connection_status: e.connection_status,
        battery: e.battery,
        last_vitals_at: e.last_vitals_at ? e.last_vitals_at.toISOString() : null,
        baselines_learned: e.baselines_learned,
        baseline_day: e.baseline_day,
      }));
    } else {
      const fileDb = await readDb();
      return fileDb.elders.filter((e) => elderIds.includes(e.id));
    }
  },

  getElderById: async (id) => {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT * FROM elders WHERE id = $1', [id]);
      if (!rows.length) return null;
      const e = rows[0];
      return {
        id: e.id,
        ownerId: e.owner_id,
        full_name: e.full_name,
        age: e.age,
        medical_conditions: e.medical_conditions,
        language_pref: e.language_pref,
        connection_status: e.connection_status,
        battery: e.battery,
        last_vitals_at: e.last_vitals_at ? e.last_vitals_at.toISOString() : null,
        baselines_learned: e.baselines_learned,
        baseline_day: e.baseline_day,
      };
    } else {
      const fileDb = await readDb();
      return fileDb.elders.find((e) => e.id === id) || null;
    }
  },

  createElder: async (user, body) => {
    const elder = {
      id: `${body.id || 'elder-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)}`,
      ownerId: user.id,
      full_name: body.full_name,
      age: body.age || 0,
      medical_conditions: body.medical_conditions || [],
      language_pref: body.language_pref || 'en',
      connection_status: body.connection_status || 'disconnected',
      battery: body.battery ?? 100,
      last_vitals_at: body.last_vitals_at || new Date().toISOString(),
      baselines_learned: body.baselines_learned ?? false,
      baseline_day: body.baseline_day,
    };

    if (usePostgres) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
      await client.query(
        'INSERT INTO elders (id, owner_id, full_name, age, medical_conditions, language_pref, connection_status, battery, last_vitals_at, baselines_learned, baseline_day) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [elder.id, elder.ownerId, elder.full_name, elder.age, JSON.stringify(elder.medical_conditions), elder.language_pref, elder.connection_status, elder.battery, elder.last_vitals_at, elder.baselines_learned, elder.baseline_day]
      );
      await client.query('INSERT INTO user_elders (user_id, elder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, elder.id]);
      const doctorId = user.profile?.accessVerification?.supervisingDoctorId;
      if (doctorId) await client.query('INSERT INTO user_elders (user_id, elder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [doctorId, elder.id]);
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      return elder;
    } else {
      const fileDb = await readDb();
      fileDb.elders.unshift(elder);
      const staff = fileDb.users.find(u => u.id === user.id);
      if (staff) staff.assignedElderIds = [...new Set([...(staff.assignedElderIds || []), elder.id])];
      const doctorId = user.profile?.accessVerification?.supervisingDoctorId;
      const doctor = fileDb.users.find(u => u.id === doctorId);
      if (doctor) doctor.assignedElderIds = [...new Set([...(doctor.assignedElderIds || []), elder.id])];
      await writeDb(fileDb);
      return elder;
    }
  },

  updateElder: async (id, body) => {
    if (usePostgres) {
      const sets = [];
      const vals = [];
      let idx = 1;

      for (const [k, v] of Object.entries(body)) {
        if (k === 'id' || k === 'ownerId') continue;
        const col = k === 'ownerId' ? 'owner_id' : k;
        sets.push(`${col} = $${idx}`);
        vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
        idx++;
      }

      if (sets.length === 0) return await dbService.getElderById(id);

      vals.push(id);
      await pool.query(`UPDATE elders SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
      return await dbService.getElderById(id);
    } else {
      const fileDb = await readDb();
      const idx = fileDb.elders.findIndex((e) => e.id === id);
      if (idx === -1) return null;
      fileDb.elders[idx] = { ...fileDb.elders[idx], ...body, id };
      await writeDb(fileDb);
      return fileDb.elders[idx];
    }
  },

  deleteElder: async (id) => {
    if (usePostgres) {
      await pool.query('DELETE FROM elders WHERE id = $1', [id]);
      return { id };
    } else {
      const fileDb = await readDb();
      fileDb.elders = fileDb.elders.filter((e) => e.id !== id);
      fileDb.medications = fileDb.medications.filter((med) => med.elder_id !== id);
      fileDb.alarms = fileDb.alarms.filter((alarm) => alarm.elderId !== id);
      await writeDb(fileDb);
      return { id };
    }
  },

  userOwnsElder: async (user, elderId) => {
    const ids = await dbService.getAccessibleElderIds(user);
    return ids.includes(elderId);
  },

  // --- MEDICATIONS ---
  createMedication: async (user, med) => {
    const saved = {
      id: med.id || 'med-' + crypto.createHash('sha256').update(JSON.stringify([med.elder_id,med.brand_name,med.generic_name,med.dose_amount,med.dose_unit,med.frequency,[...(med.times || [])].sort()])).digest('hex').slice(0,32),
      elder_id: med.elder_id,
      ownerId: user.id,
      brand_name: med.brand_name,
      generic_name: med.generic_name || '',
      category: med.category || 'General',
      dose_amount: med.dose_amount || 0,
      dose_unit: med.dose_unit || 'mg',
      frequency: med.frequency || 'Once daily',
      times: med.times || ['09:00'],
      instructions: med.instructions || '',
      photo: med.photo || '',
      active: med.active !== undefined ? med.active : true,
    };

    if (usePostgres) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
      const inserted=await client.query(
        'INSERT INTO medications (id, elder_id, owner_id, brand_name, generic_name, category, dose_amount, dose_unit, frequency, times, instructions, photo, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING',
        [saved.id, saved.elder_id, saved.ownerId, saved.brand_name, saved.generic_name, saved.category, saved.dose_amount, saved.dose_unit, saved.frequency, JSON.stringify(saved.times), saved.instructions, saved.photo, saved.active]
      );
        const storedIdentity=(await client.query('SELECT elder_id FROM medications WHERE id=$1 FOR UPDATE',[saved.id])).rows[0];
        if (storedIdentity?.elder_id !== saved.elder_id) throw Object.assign(new Error('Record identity conflicts with another patient.'),{statusCode:409});
      if(inserted.rowCount) for (const [position,time] of saved.times.entries()) await client.query('INSERT INTO medication_schedules(medication_id,time,position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[saved.id,time,position]);
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      return dbService.getMedicationById(saved.id);
    } else {
      const fileDb = await readDb();
      const existing=fileDb.medications.find(m=>m.id===saved.id);
      if(existing){if(existing.elder_id!==saved.elder_id)throw Object.assign(new Error('Record identity conflict.'),{statusCode:409});return existing;}
      fileDb.medications.unshift(saved);
      await writeDb(fileDb);
      return saved;
    }
  },

  getMedicationById: async (id) => {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT m.*, COALESCE((SELECT jsonb_agg(s.time ORDER BY s.position) FROM medication_schedules s WHERE s.medication_id=m.id), m.times) AS times FROM medications m WHERE id = $1', [id]);
      if (!rows.length) return null;
      const m = rows[0];
      return {
        id: m.id,
        elder_id: m.elder_id,
        ownerId: m.owner_id,
        brand_name: m.brand_name,
        generic_name: m.generic_name,
        category: m.category,
        dose_amount: Number(m.dose_amount),
        dose_unit: m.dose_unit,
        frequency: m.frequency,
        times: m.times,
        instructions: m.instructions,
        photo: m.photo,
        active: m.active,
      };
    } else {
      const fileDb = await readDb();
      return fileDb.medications.find((m) => m.id === id) || null;
    }
  },

  updateMedication: async (id, med) => {
    if (usePostgres) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
      await client.query(
        'UPDATE medications SET brand_name = $1, generic_name = $2, category = $3, dose_amount = $4, dose_unit = $5, frequency = $6, times = $7, instructions = $8, photo = $9, active = $10 WHERE id = $11',
        [med.brand_name, med.generic_name, med.category, med.dose_amount, med.dose_unit, med.frequency, JSON.stringify(med.times), med.instructions, med.photo, med.active !== undefined ? med.active : true, id]
      );
      await client.query('DELETE FROM medication_schedules WHERE medication_id=$1',[id]);
      for (const [position,time] of med.times.entries()) await client.query('INSERT INTO medication_schedules(medication_id,time,position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[id,time,position]);
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      return await dbService.getMedicationById(id);
    } else {
      const fileDb = await readDb();
      const idx = fileDb.medications.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      fileDb.medications[idx] = { ...fileDb.medications[idx], ...med, id };
      await writeDb(fileDb);
      return fileDb.medications[idx];
    }
  },

  deleteMedication: async (id) => {
    if (usePostgres) {
      await pool.query('DELETE FROM medications WHERE id = $1', [id]);
      return { id };
    } else {
      const fileDb = await readDb();
      fileDb.medications = fileDb.medications.filter((m) => m.id !== id);
      await writeDb(fileDb);
      return { id };
    }
  },

  // --- ALARMS ---
  createAlarm: async (user, alarm) => {
    const saved = {
      id: alarm.id || 'alarm-' + crypto.createHash('sha256').update(JSON.stringify([alarm.elderId,alarm.title,alarm.time,alarm.type,alarm.appointmentId,alarm.appointmentDate,alarm.isOneHourReminder])).digest('hex').slice(0,32),
      elderId: alarm.elderId,
      ownerId: user.id,
      title: alarm.title,
      time: alarm.time,
      type: alarm.type,
      status: alarm.status || 'Scheduled',
      notes: alarm.notes || '',
      appointmentId: alarm.appointmentId, appointmentDate: alarm.appointmentDate,
      appointmentTime: alarm.appointmentTime, doctorName: alarm.doctorName,
      isOneHourReminder: alarm.isOneHourReminder || false, repeat: alarm.repeat || 'daily',
    };

    if (usePostgres) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
      if(saved.appointmentId && user.role!=='doctor')throw Object.assign(new Error('Only doctors book an appointment.'),{statusCode:403});
      if (saved.appointmentId) await client.query('INSERT INTO appointments (id, elder_id, doctor_id, appointment_date, appointment_time, doctor_name, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING', [saved.appointmentId, saved.elderId, user.id, saved.appointmentDate, saved.appointmentTime, saved.doctorName, saved.notes]);
      if(saved.appointmentId){const appointment=(await client.query('SELECT elder_id,doctor_id FROM appointments WHERE id=$1 FOR UPDATE',[saved.appointmentId])).rows[0];if(appointment.elder_id!==saved.elderId || appointment.doctor_id!==user.id)throw Object.assign(new Error('Appointment identity conflict.'),{statusCode:409});}
      await client.query(
        'INSERT INTO alarms (id, elder_id, owner_id, title, time, type, status, notes, appointment_id, appointment_date, appointment_time, doctor_name, is_one_hour_reminder, repeat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING',
        [saved.id, saved.elderId, saved.ownerId, saved.title, saved.time, saved.type, saved.status, saved.notes, saved.appointmentId, saved.appointmentDate, saved.appointmentTime, saved.doctorName, saved.isOneHourReminder, saved.repeat]
      );
        const storedIdentity=(await client.query('SELECT elder_id FROM alarms WHERE id=$1 FOR UPDATE',[saved.id])).rows[0];
        if (storedIdentity?.elder_id !== saved.elderId) throw Object.assign(new Error('Record identity conflicts with another patient.'),{statusCode:409});
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      return dbService.getAlarmById(saved.id);
    } else {
      const fileDb = await readDb();
      const existing=fileDb.alarms.find(a=>a.id===saved.id);
      if(existing){if(existing.elderId!==saved.elderId)throw Object.assign(new Error('Record identity conflict.'),{statusCode:409});return existing;}
      fileDb.alarms.unshift(saved);
      await writeDb(fileDb);
      return saved;
    }
  },

  getAlarmById: async (id) => {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT * FROM alarms WHERE id = $1', [id]);
      if (!rows.length) return null;
      const a = rows[0];
      return {
        id: a.id,
        elderId: a.elder_id,
        ownerId: a.owner_id,
        title: a.title,
        time: a.time,
        type: a.type,
        status: a.status,
        notes: a.notes,
        appointmentId: a.appointment_id, appointmentDate: a.appointment_date ? String(a.appointment_date).slice(0,10) : undefined,
        appointmentTime: a.appointment_time, doctorName: a.doctor_name, isOneHourReminder: a.is_one_hour_reminder, repeat: a.repeat,
      };
    } else {
      const fileDb = await readDb();
      return fileDb.alarms.find((a) => a.id === id) || null;
    }
  },

  updateAlarm: async (id, alarm) => {
    if (usePostgres) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
      await client.query(
        'UPDATE alarms SET title = $1, time = $2, type = $3, status = $4, notes = $5 WHERE id = $6',
        [alarm.title, alarm.time, alarm.type, alarm.status, alarm.notes, id]
      );
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      return await dbService.getAlarmById(id);
    } else {
      const fileDb = await readDb();
      const idx = fileDb.alarms.findIndex((a) => a.id === id);
      if (idx === -1) return null;
      fileDb.alarms[idx] = { ...fileDb.alarms[idx], ...alarm, id };
      await writeDb(fileDb);
      return fileDb.alarms[idx];
    }
  },

  deleteAlarm: async (id) => {
    if (usePostgres) {
      await pool.query('DELETE FROM alarms WHERE id = $1 OR appointment_id = (SELECT appointment_id FROM alarms WHERE id = $1)', [id]);
      return { id };
    } else {
      const fileDb = await readDb();
      const target = (fileDb.alarms || []).find((a) => a.id === id);
      const apptId = target?.appointmentId;
      fileDb.alarms = (fileDb.alarms || []).filter((a) => {
        if (a.id === id) return false;
        if (apptId && a.appointmentId === apptId) return false;
        return true;
      });
      await writeDb(fileDb);
      return { id };
    }
  },

  // --- ALERTS ---
  getAlerts: async (user) => {
    const elderIds = await dbService.getAccessibleElderIds(user);
    if (usePostgres) {
      if (elderIds.length === 0) return [];
      const { rows } = await pool.query(
        `SELECT a.*, e.full_name as elder_name FROM alerts a
         LEFT JOIN elders e ON a.elder_id = e.id
         WHERE a.elder_id = ANY($1)
         ORDER BY a.time DESC LIMIT 200`,
        [elderIds]
      );
      return rows.map((a) => ({
        id: a.id,
        elderId: a.elder_id,
        elder_id: a.elder_id,
        elderName: a.elder_name,
        elder_name: a.elder_name,
        ownerId: a.owner_id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        location: a.location,
        resolved: a.resolved,
        anomaly_type: a.anomaly_type,
        episode_recovered: a.episode_recovered,
        appointmentDetails: a.appointment_details,
        time: a.time ? a.time.toISOString() : null,
      }));
    } else {
      const fileDb = await readDb();
      return (fileDb.alerts || []).filter((alert) => {
        if (elderIds.length === 0) return false;
        if (alert.elder_id && elderIds.includes(alert.elder_id)) return true;
        if (alert.elderId && elderIds.includes(alert.elderId)) return true;
        return false;
      });
    }
  },

  createAlert: async (user, alert) => serializeAlertMutation(() => createAlertRecord(user, alert)),

  getAlertById: async (id) => {
    if (usePostgres) {
      const { rows } = await pool.query(
        'SELECT a.*, e.full_name as elder_name FROM alerts a LEFT JOIN elders e ON a.elder_id = e.id WHERE a.id = $1',
        [id]
      );
      if (!rows.length) return null;
      const a = rows[0];
      return {
        id: a.id,
        elderId: a.elder_id,
        elder_id: a.elder_id,
        elderName: a.elder_name,
        elder_name: a.elder_name,
        ownerId: a.owner_id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        location: a.location,
        resolved: a.resolved,
        anomaly_type: a.anomaly_type,
        episode_recovered: a.episode_recovered,
        appointmentDetails: a.appointment_details,
        time: a.time ? a.time.toISOString() : null,
      };
    } else {
      const fileDb = await readDb();
      return (fileDb.alerts || []).find((a) => a.id === id) || null;
    }
  },

  updateAlert: async (id, updates) => serializeAlertMutation(async () => {
    // Only alert-state fields can be updated; callers cannot change ownership.
    const allowed = ['message', 'severity', 'time', 'location', 'resolved', 'episode_recovered', 'appointmentDetails'];
    const patch = Object.fromEntries(Object.entries(updates).filter(([key]) => allowed.includes(key)));
    if (usePostgres) {
      const existing = await dbService.getAlertById(id);
      if (!existing) return null;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM elders WHERE id = $1 FOR UPDATE', [existing.elderId]);
        const sets = [];
        const values = [];
        for (const [key, value] of Object.entries(patch)) {
          values.push(key === 'appointmentDetails' ? JSON.stringify(value) : value);
          const position = '$' + values.length;
          sets.push(key === 'episode_recovered' || key === 'resolved' ? key + ' = COALESCE(' + key + ', false) OR ' + position : (key === 'appointmentDetails' ? 'appointment_details' : key) + ' = ' + position);
        }
        if (sets.length) {
          values.push(id);
          await client.query('UPDATE alerts SET ' + sets.join(', ') + ' WHERE id = $' + values.length, values);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK'); throw err;
      } finally { client.release(); }
      return dbService.getAlertById(id);
    }
    const fileDb = await readDb();
    const index = (fileDb.alerts || []).findIndex(a => a.id === id);
    if (index < 0) return null;
    const existing = fileDb.alerts[index];
    fileDb.alerts[index] = { ...existing, ...patch,
      resolved: existing.resolved || patch.resolved || false,
      episode_recovered: existing.episode_recovered || patch.episode_recovered || false };
    await writeDb(fileDb);
    return fileDb.alerts[index];
  }),

  clearAlerts: async (user, onlyResolved = false) => {
    const elderIds = await dbService.getAccessibleElderIds(user);
    if (usePostgres) {
      let query = 'DELETE FROM alerts WHERE elder_id = ANY($1)';
      const params = [elderIds];
      if (onlyResolved) {
        query += ' AND resolved = true';
      }
      const res = await pool.query(query, params);
      return { count: res.rowCount };
    } else {
      const fileDb = await readDb();
      const initialCount = (fileDb.alerts || []).length;
      fileDb.alerts = (fileDb.alerts || []).filter((alert) => {
        const belongsToUser =
          (alert.elder_id && elderIds.includes(alert.elder_id)) ||
          (alert.elderId && elderIds.includes(alert.elderId));
        if (!belongsToUser) return true;
        if (onlyResolved) {
          return !alert.resolved;
        }
        return false;
      });
      await writeDb(fileDb);
      return { count: initialCount - fileDb.alerts.length };
    }
  },

  deleteAlert: async (id) => {
    if (usePostgres) {
      const res = await pool.query('DELETE FROM alerts WHERE id = $1', [id]);
      return res.rowCount > 0;
    } else {
      const fileDb = await readDb();
      const before = (fileDb.alerts || []).length;
      fileDb.alerts = (fileDb.alerts || []).filter((a) => a.id !== id);
      await writeDb(fileDb);
      return fileDb.alerts.length < before;
    }
  },

  // --- VITALS READINGS ---
  createVitalsReading: async (reading) => {
    const id = `vit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saved = {
      id,
      elderId: reading.elderId,
      heart_rate: reading.heart_rate,
      systolic_bp: reading.systolic_bp,
      diastolic_bp: reading.diastolic_bp,
      spo2: reading.spo2,
      stress: reading.stress,
      hydration: reading.hydration,
      breathing_rate: reading.breathing_rate,
      skin_temp: reading.skin_temp,
      shiver_detected: reading.shiver_detected || false,
      panic_detected: reading.panic_detected || false,
      fall_detected: reading.fall_detected || false,
      source: reading.source || 'manual',
      timestamp: reading.timestamp || new Date().toISOString(),
    };

    if (usePostgres) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM elders WHERE id=$1 FOR UPDATE',[saved.elderId]);
        const current=(await client.query('SELECT * FROM vitals_latest WHERE elder_id=$1',[saved.elderId])).rows[0];
        if(saved.source==='simulator' && current?.source==='device' && Date.now()-new Date(current.timestamp).getTime()<60000) {
          await client.query('COMMIT');return {...current,elderId:saved.elderId,spo2:Number(current.spo2),skin_temp:Number(current.skin_temp)};
        }

      await client.query(
        `INSERT INTO vitals_latest (
          id, elder_id, heart_rate, systolic_bp, diastolic_bp, spo2, stress, hydration, breathing_rate, skin_temp, shiver_detected, panic_detected, fall_detected, source, timestamp
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ON CONFLICT (elder_id) DO UPDATE SET id=EXCLUDED.id, heart_rate=EXCLUDED.heart_rate, systolic_bp=EXCLUDED.systolic_bp, diastolic_bp=EXCLUDED.diastolic_bp, spo2=EXCLUDED.spo2, stress=EXCLUDED.stress, hydration=EXCLUDED.hydration, breathing_rate=EXCLUDED.breathing_rate, skin_temp=EXCLUDED.skin_temp, shiver_detected=EXCLUDED.shiver_detected, panic_detected=EXCLUDED.panic_detected, fall_detected=EXCLUDED.fall_detected, source=EXCLUDED.source, timestamp=EXCLUDED.timestamp WHERE vitals_latest.timestamp <= EXCLUDED.timestamp`,
        [saved.id, saved.elderId, saved.heart_rate, saved.systolic_bp, saved.diastolic_bp, saved.spo2, saved.stress, saved.hydration, saved.breathing_rate, saved.skin_temp, saved.shiver_detected, saved.panic_detected, saved.fall_detected, saved.source, saved.timestamp]
      );
        const previous=(await client.query('SELECT timestamp FROM vitals_readings WHERE elder_id=$1 ORDER BY timestamp DESC LIMIT 1',[saved.elderId])).rows[0];
        const interval=Math.max(1000,Number(process.env.TELEMETRY_HISTORY_INTERVAL_MS || 10000));
        if (!previous || saved.fall_detected || new Date(saved.timestamp)-new Date(previous.timestamp)>=interval) {
      await client.query(
        `INSERT INTO vitals_readings (
          id, elder_id, heart_rate, systolic_bp, diastolic_bp, spo2, stress, hydration, breathing_rate, skin_temp, shiver_detected, panic_detected, fall_detected, source, timestamp
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [saved.id, saved.elderId, saved.heart_rate, saved.systolic_bp, saved.diastolic_bp, saved.spo2, saved.stress, saved.hydration, saved.breathing_rate, saved.skin_temp, saved.shiver_detected, saved.panic_detected, saved.fall_detected, saved.source, saved.timestamp]
      );
        }
        await client.query('UPDATE elders SET last_vitals_at=GREATEST(last_vitals_at,$1::timestamptz) WHERE id=$2',[saved.timestamp,saved.elderId]);
        await client.query('COMMIT'); return saved;
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    } else {
      const fileDb = await readDb();
      fileDb.vitalsReadings = fileDb.vitalsReadings || [];
      fileDb.vitalsReadings.unshift(saved);

      const idx = fileDb.elders.findIndex((e) => e.id === saved.elderId);
      if (idx !== -1) {
        fileDb.elders[idx].last_vitals_at = saved.timestamp;
      }
      await writeDb(fileDb);
      return saved;
    }
  },

  getVitalsReadings: async (elderId, limit = 100) => {
    if (usePostgres) {
      const { rows } = await pool.query(
        limit === 1 ? 'SELECT * FROM vitals_latest WHERE elder_id = $1 ORDER BY timestamp DESC LIMIT $2' : 'SELECT * FROM vitals_readings WHERE elder_id = $1 ORDER BY timestamp DESC LIMIT $2',
        [elderId, limit]
      );
      return rows.map((v) => ({
        id: v.id,
        elderId: v.elder_id,
        heart_rate: v.heart_rate,
        systolic_bp: v.systolic_bp,
        diastolic_bp: v.diastolic_bp,
        spo2: Number(v.spo2),
        stress: v.stress,
        hydration: v.hydration,
        breathing_rate: v.breathing_rate,
        skin_temp: Number(v.skin_temp),
        shiver_detected: v.shiver_detected,
        panic_detected: v.panic_detected,
        fall_detected: v.fall_detected,
        source: v.source,
        timestamp: v.timestamp ? v.timestamp.toISOString() : null,
      }));
    } else {
      const fileDb = await readDb();
      return (fileDb.vitalsReadings || [])
        .filter((r) => r.elderId === elderId)
        .slice(0, limit);
    }
  },

  // --- CLINICAL NOTES ---
  createClinicalNote: async (doctor, elderId, note) => {
    const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saved = {
      id,
      elderId,
      doctorId: doctor.id,
      doctorName: doctor.name,
      note,
      createdAt: new Date().toISOString(),
    };

    if (usePostgres) {
      await pool.query(
        'INSERT INTO clinical_notes (id, elder_id, doctor_id, doctor_name, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [saved.id, saved.elderId, saved.doctorId, saved.doctorName, saved.note, saved.createdAt]
      );
      return saved;
    } else {
      const fileDb = await readDb();
      fileDb.clinicalNotes = fileDb.clinicalNotes || [];
      fileDb.clinicalNotes.unshift(saved);
      await writeDb(fileDb);
      return saved;
    }
  },

  getClinicalNotes: async (elderId, limit = 50) => {
    if (usePostgres) {
      const { rows } = await pool.query(
        'SELECT * FROM clinical_notes WHERE elder_id = $1 ORDER BY created_at DESC LIMIT $2',
        [elderId, limit]
      );
      return rows.map((n) => ({
        id: n.id,
        elderId: n.elder_id,
        doctorId: n.doctor_id,
        doctorName: n.doctor_name,
        note: n.note,
        createdAt: n.created_at ? n.created_at.toISOString() : null,
      }));
    } else {
      const fileDb = await readDb();
      fileDb.clinicalNotes = fileDb.clinicalNotes || [];
      return fileDb.clinicalNotes
        .filter((n) => n.elderId === elderId)
        .slice(0, limit);
    }
  },

  createReport: async (doctor, elderId, title, description, category, fileUrl = '', fileName = '', fileData = '', fileType = 'application/pdf', fileSize = 0) => {
    const id = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saved = {
      id,
      elderId,
      doctorId: doctor.id,
      doctorName: doctor.name,
      title,
      description: description || '',
      category: category || 'General',
      fileUrl: fileUrl || fileName || '',
      fileName: fileName || '',
      fileData: fileData || '',
      fileType: fileType || 'application/pdf',
      fileSize: fileSize || 0,
      createdAt: new Date().toISOString(),
    };

    if (usePostgres) {
      const filePath=fileData ? await saveReportFile(fileData) : null;
      await pool.query(
        'INSERT INTO reports (id, elder_id, doctor_id, doctor_name, title, description, category, file_url, file_name, file_data, file_type, file_size, created_at, file_path) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
        [saved.id, saved.elderId, saved.doctorId, saved.doctorName, saved.title, saved.description, saved.category, saved.fileUrl, saved.fileName, null, saved.fileType, saved.fileSize, saved.createdAt, filePath]
      );
      const { fileData: _, ...meta } = saved;
      return meta;
    } else {
      const fileDb = await readDb();
      fileDb.reports = fileDb.reports || [];
      fileDb.reports.unshift(saved);
      await writeDb(fileDb);
      const { fileData: _, ...meta } = saved;
      return meta;
    }
  },

  getReports: async (elderId, limit = 50) => {
    if (usePostgres) {
      const { rows } = await pool.query(
        'SELECT id, elder_id, doctor_id, doctor_name, title, description, category, file_url, file_name, file_type, file_size, created_at FROM reports WHERE elder_id = $1 ORDER BY created_at DESC LIMIT $2',
        [elderId, limit]
      );
      return rows.map((r) => ({
        id: r.id,
        elderId: r.elder_id,
        doctorId: r.doctor_id,
        doctorName: r.doctor_name,
        title: r.title,
        description: r.description,
        category: r.category,
        fileUrl: r.file_url,
        fileName: r.file_name,
        fileType: r.file_type,
        fileSize: r.file_size,
        createdAt: r.created_at ? r.created_at.toISOString() : null,
      }));
    } else {
      const fileDb = await readDb();
      fileDb.reports = fileDb.reports || [];
      return fileDb.reports
        .filter((r) => r.elderId === elderId)
        .slice(0, limit)
        .map(({ fileData: _, ...meta }) => meta);
    }
  },

  getReportById: async (id) => {
    if (usePostgres) {
      const { rows } = await pool.query(
        'SELECT * FROM reports WHERE id = $1',
        [id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        elderId: r.elder_id,
        doctorId: r.doctor_id,
        doctorName: r.doctor_name,
        title: r.title,
        description: r.description,
        category: r.category,
        fileUrl: r.file_url,
        fileName: r.file_name,
        fileData: r.file_path ? (await loadReportFile(r.file_path)).toString('base64') : r.file_data,
        fileType: r.file_type,
        fileSize: r.file_size,
        createdAt: r.created_at ? r.created_at.toISOString() : null,
      };
    } else {
      const fileDb = await readDb();
      fileDb.reports = fileDb.reports || [];
      return fileDb.reports.find((r) => r.id === id) || null;
    }
  },

  deleteReport: async (id) => {
    if (usePostgres) {
      await pool.query('DELETE FROM reports WHERE id = $1', [id]);
      return { id };
    } else {
      const fileDb = await readDb();
      fileDb.reports = (fileDb.reports || []).filter((r) => r.id !== id);
      await writeDb(fileDb);
      return { id };
    }
  },

  getCareTeam: async (elderId) => {
    if (usePostgres) {
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.phone, u.profile
         FROM users u
         JOIN user_elders ue ON u.id = ue.user_id
         WHERE ue.elder_id = $1 AND u.role = 'doctor'`,
        [elderId]
      );
      return rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        specialization: u.profile?.specialization || 'Clinical Specialist',
        hospital: u.profile?.hospital || 'GuardianCare Partner Clinic',
      }));
    } else {
      const fileDb = await readDb();
      return fileDb.users
        .filter((u) => u.role === 'doctor' && u.assignedElderIds?.includes(elderId))
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          specialization: u.profile?.specialization || 'Clinical Specialist',
          hospital: u.profile?.hospital || 'GuardianCare Partner Clinic',
        }));
    }
  },

  // --- TOKENS ---
  isTokenRevoked: async (jti) => {
    if (!jti) return true;
    if (usePostgres) {
      const { rows } = await pool.query('SELECT 1 FROM revoked_tokens WHERE token_id = $1', [jti]);
      return rows.length > 0;
    } else {
      const fileDb = await readDb();
      return (fileDb.revokedTokens || []).includes(jti);
    }
  },

  revokeToken: async (jti) => {
    if (!jti) return;
    if (usePostgres) {
      await pool.query('INSERT INTO revoked_tokens (token_id) VALUES ($1) ON CONFLICT DO NOTHING', [jti]);
    } else {
      const fileDb = await readDb();
      fileDb.revokedTokens = [jti, ...(fileDb.revokedTokens || [])].slice(0, 1000);
      await writeDb(fileDb);
    }
  },

  // --- AUDIT LOGS ---
  addAuditLog: async (user, action, entityType, entityId, details = {}) => {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const log = {
      id,
      userId: user?.id || 'system',
      role: user?.role || 'system',
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };

    if (usePostgres) {
      await pool.query(
        'INSERT INTO audit_logs (id, user_id, role, action, entity_type, entity_id, details, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [log.id, log.userId, log.role, log.action, log.entityType, log.entityId, JSON.stringify(log.details), log.createdAt]
      );
    } else {
      const fileDb = await readDb();
      fileDb.auditLogs = [log, ...(fileDb.auditLogs || [])].slice(0, 500);
      await writeDb(fileDb);
    }
  },

  // --- DASHBOARD FILTER ---
  filterDashboardForUser: async (user) => {
    const elders = await dbService.getElders(user);
    const elderIds = elders.map((e) => e.id);

    if (usePostgres) {
      if (elderIds.length === 0) {
        return { elders: [], medications: [], alarms: [], alerts: [] };
      }

      const { rows: medications } = await pool.query(
        'SELECT m.*, COALESCE((SELECT jsonb_agg(s.time ORDER BY s.position) FROM medication_schedules s WHERE s.medication_id=m.id), m.times) AS times FROM medications m WHERE elder_id = ANY($1) ORDER BY brand_name ASC',
        [elderIds]
      );
      const cleanMedications = medications.map((m) => ({
        id: m.id,
        elder_id: m.elder_id,
        ownerId: m.owner_id,
        brand_name: m.brand_name,
        generic_name: m.generic_name,
        category: m.category,
        dose_amount: Number(m.dose_amount),
        dose_unit: m.dose_unit,
        frequency: m.frequency,
        times: m.times,
        instructions: m.instructions,
        photo: m.photo,
        active: m.active,
      }));

      const { rows: alarms } = await pool.query(
        'SELECT a.*, e.full_name as elder_name FROM alarms a LEFT JOIN elders e ON a.elder_id = e.id WHERE a.elder_id = ANY($1) ORDER BY a.time ASC',
        [elderIds]
      );
      const cleanAlarms = alarms.map((a) => ({
        id: a.id,
        elderId: a.elder_id,
        elderName: a.elder_name,
        ownerId: a.owner_id,
        title: a.title,
        time: a.time,
        type: a.type,
        status: a.status,
        notes: a.notes,
        appointmentId: a.appointment_id, appointmentDate: a.appointment_date ? String(a.appointment_date).slice(0,10) : undefined,
        appointmentTime: a.appointment_time, doctorName: a.doctor_name, isOneHourReminder: a.is_one_hour_reminder, repeat: a.repeat,
      }));

      const alerts = await dbService.getAlerts(user);

      // Fetch latest vitals for each elder
      const vitals = {};
      for (const eId of elderIds) {
        const readings = await dbService.getVitalsReadings(eId, 1);
        if (readings.length > 0) {
          vitals[eId] = readings[0];
        }
      }

      return { elders, medications: cleanMedications, alarms: cleanAlarms, alerts, vitals, reminderAcknowledgements: await dbService.getReminderAcknowledgements(user) };
    } else {
      const fileDb = await readDb();
      const medications = fileDb.medications.filter((med) => elderIds.includes(med.elder_id));
      const alarms = fileDb.alarms.filter((alarm) => elderIds.includes(alarm.elderId)).map((a) => {
        const elder = fileDb.elders.find((e) => e.id === a.elderId);
        return { ...a, elderName: elder?.full_name || '' };
      });
      const alerts = (fileDb.alerts || []).filter((alert) => {
        if (elderIds.length === 0) return false;
        if (alert.elder_id && elderIds.includes(alert.elder_id)) return true;
        if (alert.elderId && elderIds.includes(alert.elderId)) return true;
        const elderName = alert.elder_name || alert.elderName;
        return elders.some((elder) => elder.full_name === elderName);
      }).map((a) => {
        const elder = fileDb.elders.find((e) => e.id === (a.elderId || a.elder_id));
        return { ...a, elderName: elder?.full_name || '', elder_name: elder?.full_name || '' };
      });

      // Fetch latest vitals for each elder
      const vitals = {};
      for (const eId of elderIds) {
        const readings = (fileDb.vitalsReadings || [])
          .filter((r) => r.elderId === eId)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (readings.length > 0) {
          vitals[eId] = readings[0];
        }
      }

      return { elders, medications, alarms, alerts, vitals, reminderAcknowledgements: await dbService.getReminderAcknowledgements(user) };
    }
  },
};

export async function closeDb() { if (pool) await pool.end(); }
export const databasePool = pool;
export function persistenceMode() { return usePostgres ? 'postgresql' : 'json'; }

export function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
