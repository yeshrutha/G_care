import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
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
      assignedElderIds: [],
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

// Database Connection Setup
let pool = null;
let usePostgres = false;

const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
    });
    console.log('PostgreSQL Pool initialized.');
    usePostgres = true;
  } catch (err) {
    console.error('Failed to initialize PostgreSQL pool:', err.message);
    usePostgres = false;
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
      data = JSON.parse(raw);
    } catch {
      data = await createSeedDb();
      await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      console.log('Local fallback JSON DB seeded.');
      return;
    }

    const seed = await createSeedDb();
    let changed = false;
    if (!Array.isArray(data.users)) data.users = [];
    
    for (const seedUser of seed.users) {
      if (!data.users.some(u => u.email === seedUser.email)) {
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
    return;
  }

  const client = await pool.connect();
  try {
    console.log('Initializing PostgreSQL database schema...');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        phone VARCHAR(50),
        profile JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS elders (
        id VARCHAR(100) PRIMARY KEY,
        owner_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        age INTEGER,
        medical_conditions JSONB,
        language_pref VARCHAR(50),
        connection_status VARCHAR(50),
        battery INTEGER,
        last_vitals_at TIMESTAMP WITH TIME ZONE,
        baselines_learned BOOLEAN DEFAULT FALSE,
        baseline_day INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_elders (
        user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, elder_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS medications (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        owner_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
        brand_name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        category VARCHAR(100),
        dose_amount NUMERIC,
        dose_unit VARCHAR(50),
        frequency VARCHAR(255),
        times JSONB,
        instructions TEXT,
        photo TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alarms (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        owner_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        time VARCHAR(50) NOT NULL,
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Scheduled',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vitals_readings (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        heart_rate INTEGER,
        systolic_bp INTEGER,
        diastolic_bp INTEGER,
        spo2 INTEGER,
        stress INTEGER,
        hydration INTEGER,
        breathing_rate INTEGER,
        skin_temp NUMERIC,
        shiver_detected BOOLEAN DEFAULT FALSE,
        panic_detected BOOLEAN DEFAULT FALSE,
        fall_detected BOOLEAN DEFAULT FALSE,
        source VARCHAR(50) DEFAULT 'manual',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_notes (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        doctor_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        doctor_name VARCHAR(255),
        note TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        doctor_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        doctor_name VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_url TEXT,
        category VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        owner_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
        type VARCHAR(100) NOT NULL,
        severity VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        location VARCHAR(255),
        resolved BOOLEAN DEFAULT FALSE,
        time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        role VARCHAR(50),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100),
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_id VARCHAR(255) PRIMARY KEY,
        revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count, 10) === 0) {
      console.log('Seeding initial database data into PostgreSQL...');
      const seed = await createSeedDb();

      for (const u of seed.users) {
        await client.query(
          'INSERT INTO users (id, email, password_hash, name, role, phone, profile, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [u.id, u.email, u.passwordHash, u.name, u.role, u.phone, JSON.stringify(u.profile), u.createdAt]
        );
      }

      for (const e of seed.elders) {
        await client.query(
          'INSERT INTO elders (id, owner_id, full_name, age, medical_conditions, language_pref, connection_status, battery, last_vitals_at, baselines_learned, baseline_day) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [e.id, e.ownerId, e.full_name, e.age, JSON.stringify(e.medical_conditions), e.language_pref, e.connection_status, e.battery, e.last_vitals_at, e.baselines_learned, e.baseline_day]
        );
      }

      await client.query('INSERT INTO user_elders (user_id, elder_id) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)', [
        DEMO_DOCTOR_ID, 'elder-1',
        DEMO_DOCTOR_ID, 'elder-2',
        DEMO_DOCTOR_ID, 'elder-3',
        DEMO_GUARDIAN_ID, 'elder-1'
      ]);

      for (const m of seed.medications) {
        await client.query(
          'INSERT INTO medications (id, elder_id, owner_id, brand_name, generic_name, category, dose_amount, dose_unit, frequency, times, instructions, photo, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
          [m.id, m.elder_id, m.ownerId, m.brand_name, m.generic_name, m.category, m.dose_amount, m.dose_unit, m.frequency, JSON.stringify(m.times), m.instructions, m.photo, m.active]
        );
      }

      for (const a of seed.alarms) {
        await client.query(
          'INSERT INTO alarms (id, elder_id, owner_id, title, time, type, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [a.id, a.elderId, a.ownerId, a.title, a.time, a.type, a.status, a.notes]
        );
      }
      console.log('PostgreSQL database seeded successfully.');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during database schema initialization/seeding:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Local File DB Helper APIs
export async function readDb() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
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
    return data;
  } catch {
    const data = await createSeedDb();
    await writeDb(data);
    return structuredClone(data);
  }
}

export async function writeDb(data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Main DB Service Class Interface
export const dbService = {
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
      await pool.query(
        'INSERT INTO users (id, email, password_hash, name, role, phone, profile, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [user.id, user.email, user.passwordHash, user.name, user.role, user.phone, JSON.stringify(user.profile), user.createdAt]
      );
      if (user.assignedElderIds && user.assignedElderIds.length > 0) {
        for (const elderId of user.assignedElderIds) {
          await pool.query('INSERT INTO user_elders (user_id, elder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, elderId]);
        }
      }
      return user;
    } else {
      const fileDb = await readDb();
      fileDb.users.unshift(user);
      await writeDb(fileDb);
      return user;
    }
  },

  updateUserProfile: async (id, name, phone, profile) => {
    if (usePostgres) {
      const existing = await dbService.findUserById(id);
      if (!existing) return null;

      const mergedProfile = { ...(existing.profile || {}), ...(profile || {}) };
      await pool.query(
        'UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), profile = $3 WHERE id = $4',
        [name, phone, JSON.stringify(mergedProfile), id]
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
    if (usePostgres) {
      if (user.role === 'caretaker') {
        const { rows } = await pool.query('SELECT id FROM elders WHERE owner_id = $1', [user.id]);
        return rows.map((r) => r.id);
      }
      if (user.role === 'guardian') {
        const elderName = String(user.profile?.elderName || '').trim().toLowerCase();
        const { rows: rels } = await pool.query('SELECT elder_id FROM user_elders WHERE user_id = $1', [user.id]);
        const explicitIds = rels.map((r) => r.elder_id);

        const { rows: namedElders } = await pool.query('SELECT id FROM elders WHERE LOWER(TRIM(full_name)) = $1', [elderName]);
        const namedIds = namedElders.map((r) => r.id);

        return [...new Set([...explicitIds, ...namedIds])];
      }
      if (user.role === 'doctor') {
        const { rows: rels } = await pool.query('SELECT elder_id FROM user_elders WHERE user_id = $1', [user.id]);
        if (rels.length > 0) return rels.map((r) => r.elder_id);

        const { rows: allElders } = await pool.query('SELECT id FROM elders');
        return allElders.map((r) => r.id);
      }
      return [];
    } else {
      const fileDb = await readDb();
      if (user.role === 'caretaker') {
        return fileDb.elders.filter((elder) => elder.ownerId === user.id).map((elder) => elder.id);
      }
      if (user.role === 'guardian') {
        const elderName = String(user.profile?.elderName || '').trim().toLowerCase();
        const byAssignment = user.assignedElderIds || [];
        const byName = fileDb.elders
          .filter((elder) => elder.full_name.trim().toLowerCase() === elderName)
          .map((elder) => elder.id);
        return [...new Set([...byAssignment, ...byName])];
      }
      if (user.role === 'doctor') {
        return user.assignedElderIds?.length
          ? user.assignedElderIds
          : fileDb.elders.map((elder) => elder.id);
      }
      return [];
    }
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
      await pool.query(
        'INSERT INTO elders (id, owner_id, full_name, age, medical_conditions, language_pref, connection_status, battery, last_vitals_at, baselines_learned, baseline_day) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [elder.id, elder.ownerId, elder.full_name, elder.age, JSON.stringify(elder.medical_conditions), elder.language_pref, elder.connection_status, elder.battery, elder.last_vitals_at, elder.baselines_learned, elder.baseline_day]
      );
      await pool.query('INSERT INTO user_elders (user_id, elder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, elder.id]);
      return elder;
    } else {
      const fileDb = await readDb();
      fileDb.elders.unshift(elder);
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
      id: med.id || `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      await pool.query(
        'INSERT INTO medications (id, elder_id, owner_id, brand_name, generic_name, category, dose_amount, dose_unit, frequency, times, instructions, photo, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
        [saved.id, saved.elder_id, saved.ownerId, saved.brand_name, saved.generic_name, saved.category, saved.dose_amount, saved.dose_unit, saved.frequency, JSON.stringify(saved.times), saved.instructions, saved.photo, saved.active]
      );
      return saved;
    } else {
      const fileDb = await readDb();
      fileDb.medications.unshift(saved);
      await writeDb(fileDb);
      return saved;
    }
  },

  getMedicationById: async (id) => {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT * FROM medications WHERE id = $1', [id]);
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
      await pool.query(
        'UPDATE medications SET brand_name = $1, generic_name = $2, category = $3, dose_amount = $4, dose_unit = $5, frequency = $6, times = $7, instructions = $8, photo = $9, active = $10 WHERE id = $11',
        [med.brand_name, med.generic_name, med.category, med.dose_amount, med.dose_unit, med.frequency, JSON.stringify(med.times), med.instructions, med.photo, med.active !== undefined ? med.active : true, id]
      );
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
      id: alarm.id || `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      elderId: alarm.elderId,
      ownerId: user.id,
      title: alarm.title,
      time: alarm.time,
      type: alarm.type,
      status: alarm.status || 'Scheduled',
      notes: alarm.notes || '',
    };

    if (usePostgres) {
      await pool.query(
        'INSERT INTO alarms (id, elder_id, owner_id, title, time, type, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [saved.id, saved.elderId, saved.ownerId, saved.title, saved.time, saved.type, saved.status, saved.notes]
      );
      return saved;
    } else {
      const fileDb = await readDb();
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
      };
    } else {
      const fileDb = await readDb();
      return fileDb.alarms.find((a) => a.id === id) || null;
    }
  },

  updateAlarm: async (id, alarm) => {
    if (usePostgres) {
      await pool.query(
        'UPDATE alarms SET title = $1, time = $2, type = $3, status = $4, notes = $5 WHERE id = $6',
        [alarm.title, alarm.time, alarm.type, alarm.status, alarm.notes, id]
      );
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
      await pool.query('DELETE FROM alarms WHERE id = $1', [id]);
      return { id };
    } else {
      const fileDb = await readDb();
      fileDb.alarms = fileDb.alarms.filter((a) => a.id !== id);
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
         WHERE a.owner_id = $1 OR a.elder_id = ANY($2) 
         ORDER BY a.time DESC LIMIT 200`,
        [user.id, elderIds]
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
        time: a.time ? a.time.toISOString() : null,
      }));
    } else {
      const fileDb = await readDb();
      return (fileDb.alerts || []).filter((alert) => {
        if (alert.ownerId === user.id) return true;
        if (alert.elder_id && elderIds.includes(alert.elder_id)) return true;
        if (alert.elderId && elderIds.includes(alert.elderId)) return true;
        return false;
      });
    }
  },

  createAlert: async (user, alert) => {
    const saved = {
      id: alert.id || `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      elderId: alert.elderId || alert.elder_id,
      ownerId: user.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      location: alert.location || '',
      resolved: alert.resolved !== undefined ? alert.resolved : false,
      time: alert.time || new Date().toISOString(),
    };

    if (usePostgres) {
      await pool.query(
        'INSERT INTO alerts (id, elder_id, owner_id, type, severity, message, location, resolved, time) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [saved.id, saved.elderId, saved.ownerId, saved.type, saved.severity, saved.message, saved.location, saved.resolved, saved.time]
      );
      const { rows } = await pool.query('SELECT full_name FROM elders WHERE id = $1', [saved.elderId]);
      return {
        ...saved,
        elder_id: saved.elderId,
        elderName: rows[0]?.full_name || '',
        elder_name: rows[0]?.full_name || '',
      };
    } else {
      const fileDb = await readDb();
      fileDb.alerts = fileDb.alerts || [];
      fileDb.alerts.unshift(saved);
      await writeDb(fileDb);

      const elder = fileDb.elders.find((e) => e.id === saved.elderId);
      return {
        ...saved,
        elder_id: saved.elderId,
        elderName: elder?.full_name || '',
        elder_name: elder?.full_name || '',
      };
    }
  },

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
        time: a.time ? a.time.toISOString() : null,
      };
    } else {
      const fileDb = await readDb();
      return (fileDb.alerts || []).find((a) => a.id === id) || null;
    }
  },

  updateAlert: async (id, updates) => {
    if (usePostgres) {
      const sets = [];
      const vals = [];
      let idx = 1;

      for (const [k, v] of Object.entries(updates)) {
        if (k === 'id' || k === 'elderName' || k === 'elder_name') continue;
        const col = k === 'elderId' || k === 'elder_id' ? 'elder_id' : k;
        sets.push(`${col} = $${idx}`);
        vals.push(v);
        idx++;
      }

      if (sets.length === 0) return await dbService.getAlertById(id);

      vals.push(id);
      await pool.query(`UPDATE alerts SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
      return await dbService.getAlertById(id);
    } else {
      const fileDb = await readDb();
      const idx = (fileDb.alerts || []).findIndex((a) => a.id === id);
      if (idx === -1) return null;
      fileDb.alerts[idx] = { ...fileDb.alerts[idx], ...updates, id };
      await writeDb(fileDb);
      const elder = fileDb.elders.find((e) => e.id === fileDb.alerts[idx].elderId);
      return {
        ...fileDb.alerts[idx],
        elder_name: elder?.full_name || '',
        elderName: elder?.full_name || '',
      };
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
      await pool.query(
        `INSERT INTO vitals_readings (
          id, elder_id, heart_rate, systolic_bp, diastolic_bp, spo2, stress, hydration, breathing_rate, skin_temp, shiver_detected, panic_detected, fall_detected, source, timestamp
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [saved.id, saved.elderId, saved.heart_rate, saved.systolic_bp, saved.diastolic_bp, saved.spo2, saved.stress, saved.hydration, saved.breathing_rate, saved.skin_temp, saved.shiver_detected, saved.panic_detected, saved.fall_detected, saved.source, saved.timestamp]
      );
      await pool.query('UPDATE elders SET last_vitals_at = $1 WHERE id = $2', [saved.timestamp, saved.elderId]);
      return saved;
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
        'SELECT * FROM vitals_readings WHERE elder_id = $1 ORDER BY timestamp DESC LIMIT $2',
        [elderId, limit]
      );
      return rows.map((v) => ({
        id: v.id,
        elderId: v.elder_id,
        heart_rate: v.heart_rate,
        systolic_bp: v.systolic_bp,
        diastolic_bp: v.diastolic_bp,
        spo2: v.spo2,
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

  createReport: async (doctor, elderId, title, description, category, fileUrl) => {
    const id = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saved = {
      id,
      elderId,
      doctorId: doctor.id,
      doctorName: doctor.name,
      title,
      description: description || '',
      category: category || 'General',
      fileUrl: fileUrl || '',
      createdAt: new Date().toISOString(),
    };

    if (usePostgres) {
      await pool.query(
        'INSERT INTO reports (id, elder_id, doctor_id, doctor_name, title, description, category, file_url, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [saved.id, saved.elderId, saved.doctorId, saved.doctorName, saved.title, saved.description, saved.category, saved.fileUrl, saved.createdAt]
      );
      return saved;
    } else {
      const fileDb = await readDb();
      fileDb.reports = fileDb.reports || [];
      fileDb.reports.unshift(saved);
      await writeDb(fileDb);
      return saved;
    }
  },

  getReports: async (elderId, limit = 50) => {
    if (usePostgres) {
      const { rows } = await pool.query(
        'SELECT * FROM reports WHERE elder_id = $1 ORDER BY created_at DESC LIMIT $2',
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
        createdAt: r.created_at ? r.created_at.toISOString() : null,
      }));
    } else {
      const fileDb = await readDb();
      fileDb.reports = fileDb.reports || [];
      return fileDb.reports
        .filter((r) => r.elderId === elderId)
        .slice(0, limit);
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
        'SELECT * FROM medications WHERE elder_id = ANY($1) ORDER BY brand_name ASC',
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

      return { elders, medications: cleanMedications, alarms: cleanAlarms, alerts, vitals };
    } else {
      const fileDb = await readDb();
      const medications = fileDb.medications.filter((med) => elderIds.includes(med.elder_id));
      const alarms = fileDb.alarms.filter((alarm) => elderIds.includes(alarm.elderId)).map((a) => {
        const elder = fileDb.elders.find((e) => e.id === a.elderId);
        return { ...a, elderName: elder?.full_name || '' };
      });
      const alerts = (fileDb.alerts || []).filter((alert) => {
        if (alert.ownerId === user.id) return true;
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

      return { elders, medications, alarms, alerts, vitals };
    }
  },
};

export function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
