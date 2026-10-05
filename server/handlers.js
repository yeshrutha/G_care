import { z } from 'zod';
import {
  hashPassword,
  sanitizeUser,
  signToken,
  validateEmail,
  validatePassword,
  verifyPassword,
} from './auth.js';
import { dbService, newId } from './db.js';
import { AssistantServiceError, generateAssistantReply } from './ai.js';
import { MAX_UPLOAD_BODY_BYTES } from './config.js';
import { validateMedicalDocument } from './medicalValidation.js';
import {
  authenticate,
  getBearerToken,
  readJsonBody,
  requireAuth,
  requireRole,
  requireSession,
  sendBinary,
  sendJson,
} from './http.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['caretaker', 'doctor', 'guardian']).default('caretaker'),
  phone: z.string().max(40).optional().default(''),
  elderName: z.string().max(120).optional().default(''),
  elderAge: z.string().max(20).optional().default(''),
  elderLanguage: z.string().max(20).optional().default(''),
  elderConditions: z.string().max(500).optional().default(''),
  hospital: z.string().max(160).optional().default(''),
  specialization: z.string().max(160).optional().default(''),
});

const elderSchema = z.object({
  full_name: z.string().min(1),
  age: z.coerce.number().int().min(0).max(125).default(0),
  medical_conditions: z.array(z.string().max(80)).default([]),
  language_pref: z.string().max(20).default('en'),
  connection_status: z.enum(['connected', 'disconnected']).optional(),
  battery: z.coerce.number().min(0).max(100).optional(),
  last_vitals_at: z.string().optional(),
  baselines_learned: z.boolean().optional(),
  baseline_day: z.number().optional(),
});

const medicationSchema = z.object({
  id: z.string().optional(),
  elder_id: z.string().min(1),
  brand_name: z.string().min(1),
  generic_name: z.string().min(1),
  category: z.string().min(1).default('General'),
  dose_amount: z.coerce.number().min(0),
  dose_unit: z.string().min(1).max(20),
  frequency: z.string().min(1).max(80),
  times: z.array(z.string().min(1)).min(1),
  instructions: z.string().max(500).default(''),
  photo: z.string().max(200000).optional().default(''),
  active: z.boolean().optional(),
});

const alarmSchema = z.object({
  id: z.string().optional(),
  elderId: z.string().min(1),
  title: z.string().min(1),
  time: z.string().min(1),
  type: z.enum(['medication', 'food', 'activity', 'appointment']),
  status: z.enum(['Due soon', 'Scheduled', 'Paused']).default('Scheduled'),
  notes: z.string().max(500).default(''),
});

const alertSchema = z.object({
  id: z.string().optional(),
  elder_id: z.string().optional(),
  elderId: z.string().optional(),
  elder_name: z.string().optional(),
  elderName: z.string().optional(),
  type: z.string().min(1),
  severity: z.enum(['critical', 'warning', 'info']),
  message: z.string().min(1).max(1000),
  location: z.string().max(200).optional(),
  time: z.string().optional(),
  resolved: z.boolean().optional(),
});

const vitalsSchema = z.object({
  elderId: z.string().min(1),
  heart_rate: z.coerce.number().int().min(0).max(300),
  systolic_bp: z.coerce.number().int().min(0).max(300),
  diastolic_bp: z.coerce.number().int().min(0).max(200),
  spo2: z.coerce.number().int().min(0).max(100),
  stress: z.coerce.number().int().min(0).max(100),
  hydration: z.coerce.number().int().min(0).max(100),
  breathing_rate: z.coerce.number().int().min(0).max(100),
  skin_temp: z.coerce.number().min(0).max(50),
  shiver_detected: z.boolean().optional().default(false),
  panic_detected: z.boolean().optional().default(false),
  fall_detected: z.boolean().optional().default(false),
  source: z.enum(['manual', 'simulator', 'device']).default('manual'),
  timestamp: z.string().optional(),
});

const clinicalNoteSchema = z.object({
  elderId: z.string().min(1),
  note: z.string().min(1).max(5000),
});

const reportSchema = z.object({
  elderId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional().default(''),
  category: z.string().min(1).max(100).default('General'),
  fileUrl: z.string().max(500).optional().default(''),
  fileName: z.string().max(255).optional().default(''),
  fileData: z.string().min(1, 'Please attach a document file.'),
  fileType: z.string().max(100).optional().default('application/pdf'),
  fileSize: z.coerce.number().optional().default(0),
});

const assistantChatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  elderId: z.string().min(1).max(160).nullish(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string().trim().min(1).max(4000),
  })).max(12).default([]),
});

function parseBody(schema, body, res, req) {
  const result = schema.safeParse(body);
  if (!result.success) {
    sendJson(res, 400, { error: result.error.issues[0]?.message || 'Invalid request body' }, req);
    return null;
  }
  return result.data;
}

export async function handleRequest(req, res, pathName) {
  if (req.method === 'GET' && pathName === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'GuardianCare API', version: '2.0.0' }, req);
  }

  if (pathName.startsWith('/api/auth/')) {
    return handleAuth(req, res, pathName);
  }

  if (req.method === 'GET' && pathName === '/api/dashboard-data') {
    const session = await authenticate(req);
    const user = session?.user || { id: 'user-demo-caretaker', role: 'caretaker' };
    const dashboardData = await dbService.filterDashboardForUser(user);
    return sendJson(res, 200, dashboardData, req);
  }

  if (req.method === 'POST' && pathName === '/api/assistant/chat') {
    const session = await authenticate(req);
    return handleAssistantChat(req, res, session?.user || null);
  }

  if (req.method === 'GET' && pathName === '/api/tts') {
    return handleTts(req, res);
  }

  const session = await authenticate(req);
  let user = session?.user;
  if (!user) {
    const token = getBearerToken(req);
    if (token) {
      return sendJson(res, 401, { error: 'Session expired or invalid. Please log in again.' }, req);
    }
    user = (await dbService.findUserById('user-demo-caretaker')) || {
      id: 'user-demo-caretaker',
      role: 'caretaker',
      name: 'Demo Caretaker',
      assignedElderIds: ['elder-1', 'elder-2', 'elder-3'],
    };
  }

  if (pathName.startsWith('/api/elders')) {
    return handleElders(req, res, pathName, user);
  }

  if (pathName.startsWith('/api/alerts')) {
    return handleAlerts(req, res, pathName, user);
  }

  if (pathName.startsWith('/api/medications')) {
    return handleMedications(req, res, pathName, user);
  }

  if (pathName.startsWith('/api/alarms')) {
    return handleAlarms(req, res, pathName, user);
  }

  if (pathName.startsWith('/api/vitals')) {
    return handleVitals(req, res, pathName, user);
  }

  if (pathName.startsWith('/api/clinical-notes')) {
    return handleClinicalNotes(req, res, pathName, user);
  }

  if (pathName.startsWith('/api/reports') || pathName.startsWith('/api/medical-records')) {
    return handleReports(req, res, pathName, user);
  }

  if (pathName.startsWith('/api/care-team')) {
    return handleCareTeam(req, res, pathName, user);
  }

  if (pathName.startsWith('/api/device')) {
    return handleDevice(req, res, pathName, user);
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleAssistantChat(req, res, user) {
  const body = parseBody(assistantChatSchema, await readJsonBody(req), res, req);
  if (!body) return;

  let healthContext = null;
  if (body.elderId) {
    let data = null;
    let elder = null;

    if (user) {
      const canAccess = await dbService.userOwnsElder(user, body.elderId);
      if (!canAccess) return sendJson(res, 403, { error: 'Not allowed to access this patient context' }, req);

      data = await dbService.filterDashboardForUser(user);
      elder = data.elders.find((item) => item.id === body.elderId);
      if (!elder) return sendJson(res, 404, { error: 'Patient not found' }, req);
    } else {
      // Demo preview context on Landing Page
      const demoUser = { id: 'user-demo-caretaker', role: 'caretaker' };
      data = await dbService.filterDashboardForUser(demoUser);
      elder = data.elders.find((item) => item.id === body.elderId) || data.elders[0];
    }

    if (elder) {
      const msgLower = body.message.toLowerCase();
      const elderNameParts = elder.full_name.toLowerCase().split(/\s+/);
      const patientKeywords = [
        'bp', 'blood pressure', 'vitals', 'heart', 'pulse', 'spo2', 'oxygen', 'steps', 
        'medicine', 'medication', 'medicines', 'pill', 'pills', 'alarm', 'alarms', 
        'health', 'condition', 'conditions', 'illness', 'sick', 'patient', 'elder', 
        'she', 'her', 'he', 'his', 'him', 'mother', 'father', 'mom', 'dad', 'parent', 
        'grandma', 'grandpa', 'grandparent', 'report', 'reports',
        ...elderNameParts
      ];

      const needsPatientContext = patientKeywords.some(keyword => keyword && msgLower.includes(keyword));

      if (needsPatientContext) {
        healthContext = {
          patient: {
            name: elder.full_name,
            age: elder.age,
            medicalConditions: elder.medical_conditions || []
          }
        };

        const vitalsKeywords = ['bp', 'blood pressure', 'vitals', 'heart', 'pulse', 'spo2', 'oxygen', 'steps', 'health'];
        const medsKeywords = ['medicine', 'medication', 'medicines', 'pill', 'pills', 'health'];
        const alarmsKeywords = ['alarm', 'alarms', 'time', 'reminder', 'reminders'];

        if (vitalsKeywords.some(k => msgLower.includes(k))) {
          healthContext.latestVitals = data.vitals?.[elder.id] || null;
        }
        if (medsKeywords.some(k => msgLower.includes(k))) {
          healthContext.medications = (data.medications || [])
            .filter((item) => item.elder_id === elder.id && item.active !== false)
            .map(({ brand_name, generic_name, dose_amount, dose_unit, frequency, times, instructions }) => ({
              name: brand_name, genericName: generic_name, dose: `${dose_amount}${dose_unit}`, frequency, times, instructions,
            }));
        }
        if (alarmsKeywords.some(k => msgLower.includes(k))) {
          healthContext.alarms = (data.alarms || [])
            .filter((item) => item.elderId === elder.id)
            .map(({ title, time, type, status, notes }) => ({ title, time, type, status, notes }));
        }

        // Default to basic status (vitals) if it mentions the patient name but not specific metrics
        if (!healthContext.latestVitals && !healthContext.medications && !healthContext.alarms) {
          healthContext.latestVitals = data.vitals?.[elder.id] || null;
        }
      }
    }
  }

  try {
    const response = await generateAssistantReply({
      message: body.message,
      conversationHistory: body.conversationHistory,
      healthContext,
    });
    if (user) {
      await dbService.addAuditLog(user, 'assistant_chat', 'assistant', body.elderId || 'general');
    }
    return sendJson(res, 200, { response }, req);
  } catch (error) {
    const status = error instanceof AssistantServiceError ? error.statusCode : 502;
    const message = error instanceof Error ? error.message : 'AI request failed';
    return sendJson(res, status, { error: message }, req);
  }
}

async function handleAuth(req, res, pathName) {
  if (req.method === 'POST' && pathName === '/api/auth/register') {
    const parsed = parseBody(registerSchema, await readJsonBody(req), res, req);
    if (!parsed) return;
    const email = parsed.email.trim().toLowerCase();
    const password = parsed.password;
    const name = parsed.name.trim();
    const role = parsed.role;

    const emailError = validateEmail(email);
    if (emailError) return sendJson(res, 400, { error: emailError }, req);

    const passwordError = validatePassword(password);
    if (passwordError) return sendJson(res, 400, { error: passwordError }, req);

    if (!name) return sendJson(res, 400, { error: 'Name is required' }, req);

    if (!['caretaker', 'doctor', 'guardian'].includes(role)) {
      return sendJson(res, 400, { error: 'Invalid role' }, req);
    }

    const existingUser = await dbService.findUserByEmail(email);
    if (existingUser) {
      return sendJson(res, 409, { error: 'Email already registered' }, req);
    }

    const user = {
      id: newId('user'),
      email,
      passwordHash: await hashPassword(password),
      name,
      role,
      phone: parsed.phone,
      profile: {
        elderName: parsed.elderName,
        elderAge: parsed.elderAge,
        elderLanguage: parsed.elderLanguage,
        elderConditions: parsed.elderConditions,
        hospital: parsed.hospital,
        specialization: parsed.specialization,
      },
      assignedElderIds: [],
      createdAt: new Date().toISOString(),
    };

    await dbService.createUser(user);
    await dbService.addAuditLog(user, 'register', 'user', user.id);

    const token = signToken(user);
    return sendJson(res, 201, { token, user: sanitizeUser(user) }, req);
  }

  if (req.method === 'POST' && pathName === '/api/auth/login') {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    const user = await dbService.findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return sendJson(res, 401, { error: 'Invalid email or password' }, req);
    }

    const token = signToken(user);
    return sendJson(res, 200, { token, user: sanitizeUser(user) }, req);
  }

  if (req.method === 'POST' && pathName === '/api/auth/logout') {
    const session = await requireSession(req, res);
    if (!session) return;
    if (session.payload?.jti) {
      await dbService.revokeToken(session.payload.jti);
    }
    await dbService.addAuditLog(session.user, 'logout', 'session', session.payload?.jti || session.user.id);
    return sendJson(res, 200, { ok: true }, req);
  }

  if (req.method === 'GET' && pathName === '/api/auth/me') {
    const user = await requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, { user: sanitizeUser(user) }, req);
  }

  if (req.method === 'PUT' && pathName === '/api/auth/profile') {
    const user = await requireAuth(req, res);
    if (!user) return;

    const body = await readJsonBody(req);
    const updated = await dbService.updateUserProfile(user.id, body.name, body.phone, body.profile);
    if (!updated) return sendJson(res, 404, { error: 'User not found' }, req);

    await dbService.addAuditLog(user, 'update_profile', 'user', user.id);
    return sendJson(res, 200, { user: sanitizeUser(updated) }, req);
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleElders(req, res, pathName, user) {
  if (!requireRole(user, ['caretaker', 'doctor'], res, req)) return;

  if (req.method === 'GET' && pathName === '/api/elders') {
    const elders = await dbService.getElders(user);
    return sendJson(res, 200, elders, req);
  }

  if (req.method === 'POST' && pathName === '/api/elders') {
    if (!requireRole(user, ['caretaker'], res, req)) return;

    const body = parseBody(elderSchema, await readJsonBody(req), res, req);
    if (!body) return;

    const elder = await dbService.createElder(user, body);
    await dbService.addAuditLog(user, 'create', 'elder', elder.id);
    return sendJson(res, 201, elder, req);
  }

  const elderMatch = pathName.match(/^\/api\/elders\/([^/]+)$/);
  if (elderMatch) {
    const elderId = decodeURIComponent(elderMatch[1]);
    const existing = await dbService.getElderById(elderId);
    if (!existing) return sendJson(res, 404, { error: 'Elder not found' }, req);

    if (req.method === 'PUT') {
      if (!requireRole(user, ['caretaker'], res, req)) return;
      if (existing.ownerId !== user.id) {
        return sendJson(res, 403, { error: 'Not allowed to edit this elder' }, req);
      }

      const body = parseBody(elderSchema.partial(), await readJsonBody(req), res, req);
      if (!body) return;
      const updated = await dbService.updateElder(elderId, body);
      await dbService.addAuditLog(user, 'update', 'elder', elderId);
      return sendJson(res, 200, updated, req);
    }

    if (req.method === 'DELETE') {
      if (!requireRole(user, ['caretaker'], res, req)) return;
      if (existing.ownerId !== user.id) {
        return sendJson(res, 403, { error: 'Not allowed to delete this elder' }, req);
      }

      await dbService.deleteElder(elderId);
      await dbService.addAuditLog(user, 'delete', 'elder', elderId);
      return sendJson(res, 200, { id: elderId }, req);
    }
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleAlerts(req, res, pathName, user) {
  if (req.method === 'GET' && pathName === '/api/alerts') {
    const alerts = await dbService.getAlerts(user);
    return sendJson(res, 200, alerts, req);
  }

  if (req.method === 'POST' && pathName === '/api/alerts') {
    const alert = parseBody(alertSchema, await readJsonBody(req), res, req);
    if (!alert) return;
    const elderId = alert.elder_id || alert.elderId;
    if (elderId) {
      const owns = await dbService.userOwnsElder(user, elderId);
      if (!owns && user.role !== 'caretaker') {
        return sendJson(res, 403, { error: 'Not allowed to create alert for this elder' }, req);
      }
    }

    const saved = await dbService.createAlert(user, alert);
    await dbService.addAuditLog(user, 'create', 'alert', saved.id, { severity: saved.severity, type: saved.type });
    return sendJson(res, 201, saved, req);
  }

  const alertMatch = pathName.match(/^\/api\/alerts\/([^/]+)$/);
  if (alertMatch && req.method === 'PUT') {
    const id = decodeURIComponent(alertMatch[1]);
    const updates = await readJsonBody(req);
    const existing = await dbService.getAlertById(id);
    if (!existing) return sendJson(res, 404, { error: 'Alert not found' }, req);

    const updated = await dbService.updateAlert(id, updates);
    await dbService.addAuditLog(user, 'update', 'alert', id, updates);
    return sendJson(res, 200, updated, req);
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleMedications(req, res, pathName, user) {
  if (!requireRole(user, ['caretaker', 'doctor', 'guardian'], res, req)) return;

  if (req.method === 'POST' && pathName === '/api/medications') {
    const medication = parseBody(medicationSchema, await readJsonBody(req), res, req);
    if (!medication) return;

    const owns = await dbService.userOwnsElder(user, medication.elder_id);
    if (!owns) {
      return sendJson(res, 403, { error: 'Not allowed to add medication for this elder' }, req);
    }

    const saved = await dbService.createMedication(user, medication);
    await dbService.addAuditLog(user, 'create', 'medication', saved.id, { elderId: saved.elder_id });
    return sendJson(res, 201, saved, req);
  }

  const medMatch = pathName.match(/^\/api\/medications\/([^/]+)$/);
  if (medMatch) {
    const id = decodeURIComponent(medMatch[1]);
    const existing = await dbService.getMedicationById(id);
    if (!existing) return sendJson(res, 404, { error: 'Medication not found' }, req);

    const owns = await dbService.userOwnsElder(user, existing.elder_id);
    if (!owns) {
      return sendJson(res, 403, { error: 'Not allowed to modify this medication' }, req);
    }

    if (req.method === 'PUT') {
      const medication = parseBody(medicationSchema, await readJsonBody(req), res, req);
      if (!medication) return;
      const updated = await dbService.updateMedication(id, medication);
      await dbService.addAuditLog(user, 'update', 'medication', id, { elderId: medication.elder_id });
      return sendJson(res, 200, updated, req);
    }

    if (req.method === 'DELETE') {
      await dbService.deleteMedication(id);
      await dbService.addAuditLog(user, 'delete', 'medication', id, { elderId: existing.elder_id });
      return sendJson(res, 200, { id }, req);
    }
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleAlarms(req, res, pathName, user) {
  if (!requireRole(user, ['caretaker', 'doctor', 'guardian'], res, req)) return;

  if (req.method === 'POST' && pathName === '/api/alarms') {
    const alarm = parseBody(alarmSchema, await readJsonBody(req), res, req);
    if (!alarm) return;

    const owns = await dbService.userOwnsElder(user, alarm.elderId);
    if (!owns) {
      return sendJson(res, 403, { error: 'Not allowed to add alarm for this elder' }, req);
    }

    const saved = await dbService.createAlarm(user, alarm);
    await dbService.addAuditLog(user, 'create', 'alarm', saved.id, { elderId: saved.elderId });
    return sendJson(res, 201, saved, req);
  }

  const alarmMatch = pathName.match(/^\/api\/alarms\/([^/]+)$/);
  if (alarmMatch) {
    const id = decodeURIComponent(alarmMatch[1]);
    const existing = await dbService.getAlarmById(id);
    if (!existing) return sendJson(res, 404, { error: 'Alarm not found' }, req);

    const owns = await dbService.userOwnsElder(user, existing.elderId);
    if (!owns) {
      return sendJson(res, 403, { error: 'Not allowed to modify this alarm' }, req);
    }

    if (req.method === 'PUT') {
      const alarm = parseBody(alarmSchema, await readJsonBody(req), res, req);
      if (!alarm) return;
      const updated = await dbService.updateAlarm(id, alarm);
      await dbService.addAuditLog(user, 'update', 'alarm', id, { elderId: alarm.elderId });
      return sendJson(res, 200, updated, req);
    }

    if (req.method === 'DELETE') {
      await dbService.deleteAlarm(id);
      await dbService.addAuditLog(user, 'delete', 'alarm', id, { elderId: existing.elderId });
      return sendJson(res, 200, { id }, req);
    }
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleVitals(req, res, pathName, user) {
  if (req.method === 'POST' && pathName === '/api/vitals') {
    const parsed = parseBody(vitalsSchema, await readJsonBody(req), res, req);
    if (!parsed) return;

    const owns = await dbService.userOwnsElder(user, parsed.elderId);
    if (!owns && user.role !== 'caretaker') {
      return sendJson(res, 403, { error: 'Not allowed to submit vitals for this elder' }, req);
    }

    const saved = await dbService.createVitalsReading(parsed);
    await dbService.addAuditLog(user, 'submit_vitals', 'vitals', saved.id, { elderId: saved.elderId });
    return sendJson(res, 201, saved, req);
  }

  if (req.method === 'GET' && pathName === '/api/vitals') {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const elderId = url.searchParams.get('elderId');
    if (!elderId) return sendJson(res, 400, { error: 'elderId parameter is required' }, req);

    const owns = await dbService.userOwnsElder(user, elderId);
    if (!owns) return sendJson(res, 403, { error: 'Not allowed to view vitals for this elder' }, req);

    const limit = Number(url.searchParams.get('limit') || 100);
    const readings = await dbService.getVitalsReadings(elderId, limit);
    return sendJson(res, 200, readings, req);
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleClinicalNotes(req, res, pathName, user) {
  if (req.method === 'POST' && pathName === '/api/clinical-notes') {
    if (!requireRole(user, ['doctor'], res, req)) return;

    const parsed = parseBody(clinicalNoteSchema, await readJsonBody(req), res, req);
    if (!parsed) return;

    const owns = await dbService.userOwnsElder(user, parsed.elderId);
    if (!owns) {
      return sendJson(res, 403, { error: 'Not allowed to save clinical note for this patient' }, req);
    }

    const saved = await dbService.createClinicalNote(user, parsed.elderId, parsed.note);
    await dbService.addAuditLog(user, 'add_clinical_note', 'clinical_note', saved.id, { elderId: saved.elderId });
    return sendJson(res, 201, saved, req);
  }

  if (req.method === 'GET' && pathName === '/api/clinical-notes') {
    if (!requireRole(user, ['doctor', 'caretaker', 'guardian'], res, req)) return;

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const elderId = url.searchParams.get('elderId');
    if (!elderId) return sendJson(res, 400, { error: 'elderId parameter is required' }, req);

    const owns = await dbService.userOwnsElder(user, elderId);
    if (!owns) return sendJson(res, 403, { error: 'Not allowed to view clinical notes for this elder' }, req);

    const limit = Number(url.searchParams.get('limit') || 50);
    const notes = await dbService.getClinicalNotes(elderId, limit);
    return sendJson(res, 200, notes, req);
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleReports(req, res, pathName, user) {
  // 1. Stream/download report document file: GET /api/reports/:id/file or /api/medical-records/:id/file
  const fileMatch = pathName.match(/^\/api\/(?:reports|medical-records)\/([^/]+)\/file$/);
  if (req.method === 'GET' && fileMatch) {
    const reportId = fileMatch[1];
    const report = await dbService.getReportById(reportId);
    if (!report) {
      return sendJson(res, 404, { error: 'Medical report not found' }, req);
    }

    const owns = await dbService.userOwnsElder(user, report.elderId);
    if (!owns) {
      return sendJson(res, 403, { error: 'Not authorized to access this patient medical report' }, req);
    }

    if (!report.fileData) {
      return sendJson(res, 404, { error: 'No attached document found for this report' }, req);
    }

    const buffer = Buffer.from(report.fileData, 'base64');
    return sendBinary(res, buffer, report.fileType || 'application/pdf', report.fileName || `${report.title}.pdf`, req);
  }

  // 2. Upload clinical report: POST /api/reports or /api/medical-records
  if (req.method === 'POST' && (pathName === '/api/reports' || pathName === '/api/medical-records' || pathName === '/api/reports/upload' || pathName === '/api/medical-records/upload')) {
    if (!requireRole(user, ['doctor'], res, req)) return;

    let body;
    try {
      body = await readJsonBody(req, MAX_UPLOAD_BODY_BYTES);
    } catch (err) {
      return sendJson(res, err.statusCode || 400, { error: err.message || 'Invalid request body' }, req);
    }

    const parsed = parseBody(reportSchema, body, res, req);
    if (!parsed) return;

    const owns = await dbService.userOwnsElder(user, parsed.elderId);
    if (!owns) {
      return sendJson(res, 403, { error: 'Not allowed to add clinical reports for this patient' }, req);
    }

    if (!parsed.fileData || typeof parsed.fileData !== 'string') {
      return sendJson(res, 400, { error: 'Please attach a valid document file.' }, req);
    }

    // Strip optional data URI prefix
    const cleanBase64 = parsed.fileData.replace(/^data:[^;]+;base64,/, '').trim();
    if (!cleanBase64) {
      return sendJson(res, 400, { error: 'Attached document is empty.' }, req);
    }

    let fileBuffer;
    try {
      fileBuffer = Buffer.from(cleanBase64, 'base64');
    } catch {
      return sendJson(res, 400, { error: 'Corrupted document data.' }, req);
    }

    const fileName = parsed.fileName || `${parsed.title.toLowerCase().replace(/\s+/g, '_')}.pdf`;
    const mimeType = parsed.fileType || 'application/pdf';

    const validation = await validateMedicalDocument(fileBuffer, fileName, mimeType, {
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
    });
    if (!validation.isValid) {
      return sendJson(res, 400, {
        error: validation.error || 'Invalid medical report. Please upload a valid clinical/checkup report.',
      }, req);
    }

    const saved = await dbService.createReport(
      user,
      parsed.elderId,
      parsed.title,
      parsed.description,
      parsed.category,
      parsed.fileUrl || fileName,
      fileName,
      cleanBase64,
      mimeType,
      fileBuffer.length
    );

    await dbService.addAuditLog(user, 'add_clinical_report', 'report', saved.id, {
      elderId: saved.elderId,
      fileName,
      category: saved.category,
      fileSize: fileBuffer.length,
    });

    return sendJson(res, 201, saved, req);
  }

  // 3. List reports for an elder: GET /api/reports or /api/medical-records
  if (req.method === 'GET' && (pathName === '/api/reports' || pathName === '/api/medical-records')) {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const elderId = url.searchParams.get('elderId');
    if (!elderId) return sendJson(res, 400, { error: 'elderId parameter is required' }, req);

    const owns = await dbService.userOwnsElder(user, elderId);
    if (!owns) return sendJson(res, 403, { error: 'Not allowed to view reports for this elder' }, req);

    const limit = Number(url.searchParams.get('limit') || 50);
    const reports = await dbService.getReports(elderId, limit);
    return sendJson(res, 200, reports, req);
  }

  // 4. Delete clinical report: DELETE /api/reports/:id or /api/medical-records/:id
  const deleteMatch = pathName.match(/^\/api\/(?:reports|medical-records)\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    if (!requireRole(user, ['doctor'], res, req)) return;
    const reportId = deleteMatch[1];
    const report = await dbService.getReportById(reportId);
    if (!report) {
      return sendJson(res, 404, { error: 'Medical report not found' }, req);
    }

    const owns = await dbService.userOwnsElder(user, report.elderId);
    if (!owns) {
      return sendJson(res, 403, { error: 'Not allowed to delete reports for this patient' }, req);
    }

    await dbService.deleteReport(reportId);
    await dbService.addAuditLog(user, 'delete_clinical_report', 'report', reportId, {
      elderId: report.elderId,
      title: report.title,
    });

    return sendJson(res, 200, { success: true, id: reportId }, req);
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleCareTeam(req, res, pathName, user) {
  if (req.method === 'GET' && pathName === '/api/care-team') {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const elderId = url.searchParams.get('elderId');
    if (!elderId) return sendJson(res, 400, { error: 'elderId parameter is required' }, req);

    const owns = await dbService.userOwnsElder(user, elderId);
    if (!owns) return sendJson(res, 403, { error: 'Not allowed to view care team for this elder' }, req);

    const team = await dbService.getCareTeam(elderId);
    return sendJson(res, 200, team, req);
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}

async function handleTts(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const text = url.searchParams.get('text') || '';
  const lang = url.searchParams.get('lang') || 'kn';
  if (!text) {
    return sendJson(res, 400, { error: 'Text parameter required' }, req);
  }

  const cleanText = text.replace(/[*_#`~]/g, '').slice(0, 1000).trim();
  const ttsLang = lang.split('-')[0].toLowerCase();

  try {
    // Split long sentences into 120-character chunks
    const rawSentences = cleanText.match(/[^.!?।\n]+[.!?।\n]*/g) || [cleanText];
    const chunks = [];

    for (const sentence of rawSentences) {
      if (sentence.length <= 130) {
        if (sentence.trim()) chunks.push(sentence.trim());
      } else {
        const words = sentence.split(' ');
        let current = '';
        for (const word of words) {
          if ((current + ' ' + word).trim().length <= 130) {
            current = (current + ' ' + word).trim();
          } else {
            if (current.trim()) chunks.push(current.trim());
            current = word;
          }
        }
        if (current.trim()) chunks.push(current.trim());
      }
    }

    const validChunks = chunks.filter((c) => c.length > 0).slice(0, 8);
    const audioBuffers = await Promise.all(
      validChunks.map(async (chunk) => {
        const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(ttsLang)}&client=tw-ob`;
        const ttsRes = await fetch(googleTtsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (!ttsRes.ok) return Buffer.alloc(0);
        return Buffer.from(await ttsRes.arrayBuffer());
      })
    );

    const mergedBuffer = Buffer.concat(audioBuffers.filter((b) => b.length > 0));
    if (mergedBuffer.length === 0) {
      return sendJson(res, 502, { error: 'TTS audio could not be generated' }, req);
    }

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': mergedBuffer.length,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(mergedBuffer);
  } catch (err) {
    return sendJson(res, 500, { error: 'TTS request failed' }, req);
  }
}

async function handleDevice(req, res, pathName, user) {
  if (req.method === 'POST' && (pathName === '/api/device/vitals' || pathName === '/api/device/telemetry')) {
    const body = await readJsonBody(req);
    const elderId = body.elderId || body.elder_id || 'elder-1';

    // Parse hardware metrics (accepts camelCase and snake_case from ESP32)
    const heart_rate = Math.round(Number(body.heartRate ?? body.heart_rate ?? 75));
    const spo2 = Math.round(Number(body.spo2 ?? 98));
    const skin_temp = Number(body.temperature ?? body.skin_temp ?? body.temp ?? 36.6);
    const systolic_bp = Math.round(Number(body.systolicBp ?? body.systolic_bp ?? 120));
    const diastolic_bp = Math.round(Number(body.diastolicBp ?? body.diastolic_bp ?? 80));
    const stress = Math.round(Number(body.stress ?? 15));
    const hydration = Math.round(Number(body.hydration ?? 85));
    const breathing_rate = Math.round(Number(body.breathingRate ?? body.breathing_rate ?? 16));
    const fall_detected = Boolean(body.fallDetected ?? body.fall_detected ?? false);
    const panic_detected = Boolean(body.panicDetected ?? body.panic_detected ?? false);
    const shiver_detected = Boolean(body.shiverDetected ?? body.shiver_detected ?? false);

    const reading = {
      elderId,
      heart_rate,
      systolic_bp,
      diastolic_bp,
      spo2,
      stress,
      hydration,
      breathing_rate,
      skin_temp,
      shiver_detected,
      panic_detected,
      fall_detected,
      source: 'device',
      timestamp: body.timestamp || new Date().toISOString(),
    };

    const saved = await dbService.createVitalsReading(reading);

    if (fall_detected) {
      await dbService.createAlert(user, {
        elder_id: elderId,
        type: 'fall',
        severity: 'critical',
        message: `Wearable fall detected for elder ${elderId}!`,
      });
    }

    return sendJson(res, 201, {
      ok: true,
      message: 'Hardware telemetry recorded',
      reading: saved,
    }, req);
  }

  if (req.method === 'GET' && pathName === '/api/device/vitals') {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const elderId = url.searchParams.get('elderId') || 'elder-1';
    const readings = await dbService.getVitalsReadings(elderId, 1);
    return sendJson(res, 200, {
      ok: true,
      latest: readings[0] || null,
    }, req);
  }

  return sendJson(res, 404, { error: 'Route not found' }, req);
}
