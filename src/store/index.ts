import { patientStorage } from '@/lib/patientStorage';
import { getStoredToken, getStoredUser } from '@/lib/api';
import { create } from 'zustand';
import { initializePatientVitals, simulateNextVitals, getElderBaseline } from '@/lib/vitalsSimulator';
import { reconcileAlertEpisodes } from '@/lib/alertEpisodeIdentity.js';
import { DEMO_ELDERS, DEMO_ALERTS } from '@/lib/demoData';
import { processVitalsTickWithAlerts, clearAnomalyCooldowns, getAlertEpisodeKey, markEpisodeAcknowledged, persistEpisodeAlert } from '@/lib/anomalyDetector';
import { broadcastGcareMessage, subscribeToGcareBroadcast, calculateMinutesBefore, formatTime12Hour } from '@/lib/syncChannel';

export interface DemoElder {
  id: string;
  full_name: string;
  age: number;
  photo_url?: string;
  medical_conditions: string[];
  language_pref: string;
  connection_status: 'connected' | 'disconnected';
  battery: number;
  last_vitals_at: string;
  baselines_learned: boolean;
  baseline_day?: number;
}

export type MotionState = 'walking' | 'sitting' | 'standing' | 'lying_down';

export interface DemoVitals {
  source?: 'manual'|'simulator'|'device';
  timestamp?: string;
  heart_rate: number;
  systolic_bp: number;
  diastolic_bp: number;
  spo2: number;
  stress: number;
  hydration: number;
  breathing_rate: number;
  skin_temp: number;
  shiver_detected: boolean;
  panic_detected: boolean;
  fall_detected: boolean;
  motion_state?: MotionState;
}

export interface DemoAlert {
  id: string;
  elder_id?: string;
  elder_name: string;
  type: 'sos' | 'fall' | 'panic' | 'high_hr' | 'low_spo2' | 'missed_med' | 'med_taken' | 'geofence' | 'vital_abnormal' | 'appointment';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  location?: string;
  time: string;
  resolved: boolean;
  anomaly_type?: string;
  episode_recovered?: boolean;
  duplicate_of?: string;
}

export interface StoreAlarm {
  id: string;
  elderId: string;
  elderName?: string;
  title: string;
  time: string;
  type: 'medication' | 'food' | 'activity' | 'appointment' | 'checkup';
  status: 'Scheduled' | 'Due soon' | 'Completed' | 'Missed' | 'Paused';
  notes?: string;
  repeat?: string;
  enabled?: boolean;
  appointmentId?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  doctorName?: string;
  reminderType?: 'appointment';
  isOneHourReminder?: boolean;
}

export interface Medication {
  id: string;
  elder_id: string;
  brand_name: string;
  generic_name: string;
  category: string;
  dose_amount: number;
  dose_unit: string;
  frequency: string;
  times: string[];
  instructions: string;
  photo?: string;
  photo_url?: string;
  pronunciation_en?: string;
  pronunciation_kn?: string;
  pronunciation_hi?: string;
  pronunciation_ta?: string;
  pill_description?: string;
  active?: boolean;
}

interface AppStore {
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  language: string;
  setLanguage: (v: string) => void;
  authUser: { id: string; name: string; role: 'caretaker' | 'doctor'; email: string } | null;
  setAuthUser: (u: AppStore['authUser']) => void;
  activeAlerts: DemoAlert[];
  setActiveAlerts: (a: DemoAlert[]) => void;
  addAlert: (a: DemoAlert) => void;
  updateAlertInPlace: (id: string, updates: Partial<DemoAlert>) => void;
  resolveAlert: (id: string) => void;
  clearAlerts: (mode?: 'all' | 'resolved', elderId?: string) => void;
  removeAlert: (id: string) => void;
  demoElders: DemoElder[];
  setDemoElders: (e: DemoElder[]) => void;
  activeElderId: string;
  setActiveElderId: (id: string) => void;
  demoVitals: Record<string, DemoVitals>;
  setDemoVitals: (id: string, v: DemoVitals) => void;
  medications: Medication[];
  setMedications: (m: Medication[] | ((current: Medication[]) => Medication[])) => void;
  addMedication: (m: Medication) => void;
  updateMedication: (id: string, m: Partial<Medication>) => void;
  deleteMedication: (id: string) => void;
  alarms: StoreAlarm[];
  setAlarms: (a: StoreAlarm[] | ((current: StoreAlarm[]) => StoreAlarm[])) => void;
  addAlarm: (a: StoreAlarm) => void;
  updateAlarm: (id: string, a: Partial<StoreAlarm>) => void;
  deleteAlarm: (id: string) => void;
  demoStep: number;
  setDemoStep: (s: number) => void;
  simulationEnabled: boolean;
  setSimulationEnabled: (v: boolean) => void;
  updateLiveVitalsTick: () => void;
  activeAnomalyOverrides: Record<string, { overrides: Partial<DemoVitals>; expiresAt: number }>;
  injectVitalsAnomaly: (elderId: string, overrides: Partial<DemoVitals>) => void;
  stabilizeElderVitals: (elderId: string) => void;
  activeWatchElderId: string | null;
  setActiveWatchElderId: (id: string | null) => void;
}

const ACTIVE_ALERTS_STORAGE_KEY = 'gcare_active_alerts';
const DEMO_MODE_STORAGE_KEY = 'gcare_demo_mode';
const MEDICATIONS_STORAGE_KEY = 'gcare_stored_medications';
const ALARMS_STORAGE_KEY = 'gcare_stored_alarms';
const ACTIVE_ELDER_STORAGE_KEY = 'gcare_active_elder_id';

const INITIAL_SEED_MEDICATIONS: Medication[] = [
  {
    id: 'med-1', elder_id: 'elder-1', brand_name: 'Glucophage', generic_name: 'Metformin HCl',
    category: 'Antidiabetic', dose_amount: 500, dose_unit: 'mg', frequency: 'Twice daily',
    times: ['08:00', '20:00'], pronunciation_en: 'GLOO-koh-fahzh', pronunciation_kn: 'ಗ್ಲುಕೋಫೇಜ್',
    pronunciation_hi: 'ग्लूकोफेज', pronunciation_ta: 'குளூக்கோபேஜ்', pill_description: 'White oval tablet',
    instructions: 'Take with food', photo_url: '', active: true,
  },
  {
    id: 'med-2', elder_id: 'elder-1', brand_name: 'Amlodac', generic_name: 'Amlodipine',
    category: 'Antihypertensive', dose_amount: 5, dose_unit: 'mg', frequency: 'Once daily',
    times: ['08:00'], pronunciation_en: 'am-LOH-dak', pronunciation_kn: 'ಆಮ್ಲೋಡಾಕ್',
    pronunciation_hi: 'एम्लोडैक', pronunciation_ta: 'ஆம்லோடாக்', pill_description: 'Small yellow round tablet',
    instructions: 'Take in the morning', photo_url: '', active: true,
  },
  {
    id: 'med-3', elder_id: 'elder-2', brand_name: 'Ecosprin', generic_name: 'Aspirin',
    category: 'Antiplatelet', dose_amount: 75, dose_unit: 'mg', frequency: 'Once daily',
    times: ['09:00'], pronunciation_en: 'EE-koh-sprin', pronunciation_kn: 'ಇಕೋಸ್ಪ್ರಿನ್',
    pronunciation_hi: 'इकोस्प्रिन', pronunciation_ta: 'ஈகோஸ்பிரின்', pill_description: 'Small pink round tablet',
    instructions: 'Take after breakfast', photo_url: '', active: true,
  },
];

const INITIAL_SEED_ALARMS: StoreAlarm[] = [
  { id: 'alarm-1', time: '08:00', title: 'Morning medicines', elderId: 'elder-1', status: 'Due soon', type: 'medication', notes: 'Morning medication reminder', repeat: 'Daily', enabled: true },
  { id: 'alarm-2', time: '08:30', title: 'Breakfast reminder', elderId: 'elder-1', status: 'Scheduled', type: 'food', notes: 'Breakfast reminder', repeat: 'Daily', enabled: true },
  { id: 'alarm-3', time: '12:30', title: 'Lunch reminder', elderId: 'elder-2', status: 'Scheduled', type: 'food', notes: 'Lunch reminder', repeat: 'Daily', enabled: true },
  { id: 'alarm-4', time: '18:30', title: 'Evening walk', elderId: 'elder-3', status: 'Scheduled', type: 'activity', notes: 'Evening activity reminder', repeat: 'Daily', enabled: true },
];

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage) && typeof window.localStorage.getItem === 'function';
}

function getStoredActiveAlerts(): DemoAlert[] {
  if (!isStorageAvailable()) return DEMO_ALERTS;
  const rawAlerts = patientStorage().getItem(ACTIVE_ALERTS_STORAGE_KEY);
  if (rawAlerts === null) return DEMO_ALERTS;
  try {
    const alerts = JSON.parse(rawAlerts);
    if (!Array.isArray(alerts)) return DEMO_ALERTS;
    if (alerts.length === 0) return [];

    const cleaned = reconcileAlertEpisodes(alerts, DEMO_ELDERS);
    if (JSON.stringify(cleaned) !== JSON.stringify(alerts)) storeActiveAlerts(cleaned);
    return cleaned;
  } catch {
    return DEMO_ALERTS;
  }
}

function storeActiveAlerts(alerts: DemoAlert[]) {
  if (isStorageAvailable()) {
    patientStorage().setItem(ACTIVE_ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }
}

function getStoredDemoMode(): boolean {
  if (!isStorageAvailable()) return false;
  return patientStorage().getItem(DEMO_MODE_STORAGE_KEY) === 'true';
}

function storeDemoMode(v: boolean) {
  if (isStorageAvailable()) {
    patientStorage().setItem(DEMO_MODE_STORAGE_KEY, String(v));
  }
}

function getStoredMedications(): Medication[] {
  if (!isStorageAvailable()) return INITIAL_SEED_MEDICATIONS;
  const raw = patientStorage().getItem(MEDICATIONS_STORAGE_KEY);
  if (!raw) return INITIAL_SEED_MEDICATIONS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SEED_MEDICATIONS;
  } catch {
    return INITIAL_SEED_MEDICATIONS;
  }
}

function storeMedications(meds: Medication[]) {
  if (isStorageAvailable()) {
    patientStorage().setItem(MEDICATIONS_STORAGE_KEY, JSON.stringify(meds));
  }
}

function getStoredAlarms(): StoreAlarm[] {
  if (!isStorageAvailable()) return INITIAL_SEED_ALARMS;
  const raw = patientStorage().getItem(ALARMS_STORAGE_KEY);
  if (!raw) return INITIAL_SEED_ALARMS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SEED_ALARMS;
  } catch {
    return INITIAL_SEED_ALARMS;
  }
}

function storeAlarms(alarms: StoreAlarm[]) {
  if (isStorageAvailable()) {
    patientStorage().setItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
  }
}

function getStoredActiveElderId(): string {
  if (!isStorageAvailable()) return 'elder-1';
  return patientStorage().getItem(ACTIVE_ELDER_STORAGE_KEY) || 'elder-1';
}

function storeActiveElderId(id: string) {
  if (isStorageAvailable()) {
    patientStorage().setItem(ACTIVE_ELDER_STORAGE_KEY, id);
  }
}

const LIVE_VITALS_STORAGE_KEY = 'gcare_live_vitals';

interface StoredLiveVitalsPayload {
  updatedAt: number;
  vitals: Record<string, DemoVitals>;
}

let vitalsBroadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    vitalsBroadcastChannel = new BroadcastChannel('gcare_vitals_sync_channel');
  } catch {}
}

function getStoredLiveVitalsPayload(): StoredLiveVitalsPayload | null {
  if (!isStorageAvailable()) return null;
  const raw = patientStorage().getItem(LIVE_VITALS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if ('vitals' in parsed && typeof parsed.vitals === 'object' && parsed.vitals !== null) {
        return { updatedAt: Number(parsed.updatedAt) || 0, vitals: parsed.vitals as Record<string, DemoVitals> };
      }
      return { updatedAt: 0, vitals: parsed as Record<string, DemoVitals> };
    }
    return null;
  } catch {
    return null;
  }
}

function getStoredLiveVitals(): Record<string, DemoVitals> | null {
  const payload = getStoredLiveVitalsPayload();
  return payload ? payload.vitals : null;
}

function storeLiveVitals(vitals: Record<string, DemoVitals>) {
  if (isStorageAvailable()) {
    try {
      const payload: StoredLiveVitalsPayload = {
        updatedAt: Date.now(),
        vitals,
      };
      patientStorage().setItem(LIVE_VITALS_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }
  try {
    vitalsBroadcastChannel?.postMessage({ type: 'SYNC_VITALS', vitals });
  } catch {}
}

export const useAppStore = create<AppStore>((set) => ({
  demoMode: getStoredDemoMode(),
  setDemoMode: (v) => {
    storeDemoMode(v);
    set({ demoMode: v });
    if (!v) {
      if (typeof window !== 'undefined') {
        patientStorage().removeItem('gcare_demo_emergency_event');
        window.dispatchEvent(new CustomEvent('gcare_demo_emergency_event', { detail: null }));
      }
    }
  },
  language: 'en',
  setLanguage: (v) => set({ language: v }),
  authUser: null,
  setAuthUser: (u) => set({ authUser: u }),
  activeAlerts: getStoredActiveAlerts(),
  setActiveAlerts: (a) => {
    if (getStoredToken()) {
      const patients = useAppStore.getState().demoElders;
      a = a.filter(alert => patients.some(e => e.id === alert.elder_id || e.full_name === alert.elder_name));
    }
    const alerts = reconcileAlertEpisodes(a, useAppStore.getState().demoElders);
    storeActiveAlerts(alerts);
    set({ activeAlerts: alerts });
  },
  addAlert: (a) => set((s) => {
    if (getStoredToken() && !s.demoElders.some(e => e.id === a.elder_id || e.full_name === a.elder_name)) return {};
    // Delayed create broadcasts/HTTP replies cannot reopen this same ID.
    if (!a.resolved && s.activeAlerts.some(existing => existing.id === a.id && existing.resolved)) return {};
    // If incoming alert is active (unresolved), check if an active alert already exists for this canonical episode
    if (!a.resolved) {
      const incomingKey = getAlertEpisodeKey(a);
      const existingIdx = s.activeAlerts.findIndex(
        (x) => !x.resolved && !x.episode_recovered && !a.episode_recovered && getAlertEpisodeKey(x) === incomingKey
      );
      if (existingIdx >= 0) {
        const nextAlerts = [...s.activeAlerts];
        nextAlerts[existingIdx] = {
          ...nextAlerts[existingIdx],
          ...a,
          id: nextAlerts[existingIdx].id,
          time: a.time || new Date().toISOString(),
          message: a.message,
          severity: a.severity === 'critical' ? 'critical' : nextAlerts[existingIdx].severity,
        };
        storeActiveAlerts(nextAlerts);
        return { activeAlerts: nextAlerts };
      }
    }

    const activeAlerts = [a, ...s.activeAlerts.filter((x) => x.id !== a.id)];
    storeActiveAlerts(activeAlerts);
    return { activeAlerts };
  }),
  updateAlertInPlace: (id, updates) => set((s) => {
    const activeAlerts = s.activeAlerts.map((a) => (a.id === id ? { ...a, ...updates } : a));
    storeActiveAlerts(activeAlerts);
    return { activeAlerts };
  }),
  resolveAlert: (id) => {
    const state = useAppStore.getState();
    const target = state.activeAlerts.find(a => a.id === id);
    if (!target || target.resolved) return;
    const episodeKey = getAlertEpisodeKey(target);
    state.updateAlertInPlace(id, { resolved: true });
    if (!target.episode_recovered) markEpisodeAcknowledged(episodeKey);
    persistEpisodeAlert(target, { resolved: true });
    const detail = { id, episodeKey, elderId: target.elder_id, elderName: target.elder_name };
    window.dispatchEvent(new CustomEvent('gcare:acknowledge-alert', { detail }));
    broadcastGcareMessage({ type: 'ALERT_ACKNOWLEDGED', ...detail, timestamp: Date.now() });
  },
  clearAlerts: (mode: 'all' | 'resolved' = 'resolved', elderId?: string) => set((s) => {
    const activeAlerts = s.activeAlerts.filter((a) => {
      // If elderId is passed, only clear alerts for that elder
      if (elderId && a.elder_id && a.elder_id !== elderId) {
        return true;
      }
      if (mode === 'resolved') {
        // Keep unacknowledged/unresolved alerts safe!
        return !a.resolved;
      }
      // Mode 'all': clears all
      return false;
    });
    storeActiveAlerts(activeAlerts);
    return { activeAlerts };
  }),
  removeAlert: (id: string) => set((s) => {
    const activeAlerts = s.activeAlerts.filter((a) => a.id !== id);
    storeActiveAlerts(activeAlerts);
    return { activeAlerts };
  }),
  demoElders: import.meta.env.PROD ? [] : DEMO_ELDERS,
  setDemoElders: (e) => set({ demoElders: e }),
  activeElderId: getStoredActiveElderId(),
  setActiveElderId: (id) => {
    storeActiveElderId(id);
    set({ activeElderId: id });
  },
  activeWatchElderId: null,
  setActiveWatchElderId: (id) => set({ activeWatchElderId: id }),
  demoVitals: import.meta.env.PROD ? {} : getStoredLiveVitals() || initializePatientVitals(DEMO_ELDERS),
  setDemoVitals: (id, v) => set((s) => {
    if (getStoredToken() && !s.demoElders.some(e => e.id === id)) return {};
    const next = { ...s.demoVitals, [id]: v };
    storeLiveVitals(next);
    return { demoVitals: next };
  }),
  medications: getStoredMedications(),
  setMedications: (m) => set((s) => {
    const next = typeof m === 'function' ? m(s.medications) : m;
    storeMedications(next);
    return { medications: next };
  }),
  addMedication: (m) => set((s) => {
    const next = [m, ...s.medications.filter((x) => x.id !== m.id)];
    storeMedications(next);
    return { medications: next };
  }),
  updateMedication: (id, m) => set((s) => {
    const next = s.medications.map((x) => x.id === id ? { ...x, ...m } : x);
    storeMedications(next);
    return { medications: next };
  }),
  deleteMedication: (id) => set((s) => {
    const next = s.medications.filter((x) => x.id !== id);
    storeMedications(next);
    return { medications: next };
  }),
  alarms: getStoredAlarms(),
  setAlarms: (a) => set((s) => {
    const next = typeof a === 'function' ? a(s.alarms) : a;
    storeAlarms(next);
    return { alarms: next };
  }),
  addAlarm: (a) => set((s) => {
    const next = [a, ...s.alarms.filter((x) => x.id !== a.id)];
    storeAlarms(next);
    return { alarms: next };
  }),
  updateAlarm: (id, a) => set((s) => {
    const target = s.alarms.find(x => x.id === id);
    const appointmentId = target?.appointmentId || a.appointmentId;
    let next = s.alarms.map((x) => x.id === id ? { ...x, ...a } : x);

    // If an appointment alarm was rescheduled, update its linked 1-hour prep alarm!
    if (appointmentId && (a.time || a.appointmentTime)) {
      const newTime = a.time || a.appointmentTime || target?.time || '10:00';
      const newDate = a.appointmentDate || target?.appointmentDate;
      const newPrepTime = calculateMinutesBefore(newTime, 60);

      next = next.map((item) => {
        if (item.appointmentId === appointmentId && item.isOneHourReminder) {
          return {
            ...item,
            time: newPrepTime,
            appointmentTime: newTime,
            appointmentDate: newDate || item.appointmentDate,
            notes: `Preparation reminder: Leave 60 minutes early for checkup at ${formatTime12Hour(newTime)}${newDate ? ` on ${newDate}` : ''}.`,
          };
        }
        return item;
      });
    }

    storeAlarms(next);
    return { alarms: next };
  }),
  deleteAlarm: (id) => set((s) => {
    const target = s.alarms.find(x => x.id === id);
    const appointmentId = target?.appointmentId;
    // Remove both the main appointment alarm and its associated 1-hour prep reminder
    const next = s.alarms.filter((x) => {
      if (x.id === id) return false;
      if (appointmentId && x.appointmentId === appointmentId) return false;
      return true;
    });
    storeAlarms(next);
    return { alarms: next };
  }),
  demoStep: 0,
  setDemoStep: (s) => set({ demoStep: s }),
  simulationEnabled: true,
  setSimulationEnabled: (v) => set({ simulationEnabled: v }),
  activeAnomalyOverrides: {},
  updateLiveVitalsTick: () => set((state) => {
    if (!state.simulationEnabled) return {};
    const nowMs = Date.now();
    const storedPayload = getStoredLiveVitalsPayload();
    // If another tab/runner generated vitals less than 3200ms ago, adopt them instead of creating drift
    if (storedPayload && storedPayload.updatedAt && (nowMs - storedPayload.updatedAt < 3200)) {
      return { demoVitals: storedPayload.vitals };
    }

    const elders = getStoredToken() ? state.demoElders : (state.demoElders.length > 0 ? state.demoElders : DEMO_ELDERS);
    const nextVitals: Record<string, DemoVitals> = { ...state.demoVitals };
    const nowIso = new Date().toISOString();

    elders.forEach((elder) => {
      const current = nextVitals[elder.id] || getElderBaseline(elder);
      const activeOverride = state.activeAnomalyOverrides[elder.id];
      const override = (activeOverride && activeOverride.expiresAt > nowMs) ? activeOverride.overrides : undefined;
      const next = simulateNextVitals(current, undefined, elder, override);
      nextVitals[elder.id] = next;

      // Evaluates telemetry: detects safe recovery or deduplicated anomalies
      processVitalsTickWithAlerts(elder, next);
    });

    const updatedElders = elders.map((e) => ({
      ...e,
      last_vitals_at: nowIso,
    }));

    storeLiveVitals(nextVitals);

    return {
      demoVitals: nextVitals,
      demoElders: updatedElders,
    };
  }),
  injectVitalsAnomaly: (elderId: string, overrides: Partial<DemoVitals>) => {
    set((state) => {
      const elders = getStoredToken() ? state.demoElders : (state.demoElders.length > 0 ? state.demoElders : DEMO_ELDERS);
      const elder = elders.find((e) => e.id === elderId) || elders[0];
      const current = state.demoVitals[elderId] || getElderBaseline(elder);
      const updated: DemoVitals = { ...current, ...overrides };

      // Force dispatch alerts immediately on manual demo trigger
      processVitalsTickWithAlerts(elder, updated, { force: true });

      const nextVitals = {
        ...state.demoVitals,
        [elderId]: updated,
      };
      storeLiveVitals(nextVitals);

      return {
        activeAnomalyOverrides: {
          ...state.activeAnomalyOverrides,
          [elderId]: { overrides, expiresAt: Date.now() + 15 * 60 * 1000 },
        },
        demoVitals: nextVitals,
      };
    });
  },
  stabilizeElderVitals: (elderId: string) => {
    set((state) => {
      const elders = getStoredToken() ? state.demoElders : (state.demoElders.length > 0 ? state.demoElders : DEMO_ELDERS);
      const elder = elders.find((e) => e.id === elderId) || elders[0];
      clearAnomalyCooldowns(elderId);
      const baseline = getElderBaseline(elder);

      const nextOverrides = { ...state.activeAnomalyOverrides };
      delete nextOverrides[elderId];

      const nextVitals = {
        ...state.demoVitals,
        [elderId]: baseline,
      };
      storeLiveVitals(nextVitals);

      return {
        activeAnomalyOverrides: nextOverrides,
        demoVitals: nextVitals,
      };
    });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (getStoredToken()) return;
    if (event.key === ACTIVE_ALERTS_STORAGE_KEY) {
      useAppStore.getState().setActiveAlerts(getStoredActiveAlerts());
    }
    if (event.key === DEMO_MODE_STORAGE_KEY) {
      useAppStore.setState({ demoMode: getStoredDemoMode() });
    }
    if (event.key === MEDICATIONS_STORAGE_KEY) {
      useAppStore.setState({ medications: getStoredMedications() });
    }
    if (event.key === ALARMS_STORAGE_KEY) {
      useAppStore.setState({ alarms: getStoredAlarms() });
    }
    if (event.key === ACTIVE_ELDER_STORAGE_KEY) {
      useAppStore.setState({ activeElderId: getStoredActiveElderId() });
    }
    if (event.key === LIVE_VITALS_STORAGE_KEY) {
      const stored = getStoredLiveVitals();
      if (stored) {
        useAppStore.setState({ demoVitals: stored });
      }
    }
  });

  if (vitalsBroadcastChannel) {
    vitalsBroadcastChannel.onmessage = (event) => {
      if (event.data?.type === 'SYNC_VITALS' && event.data?.vitals) {
        const allowed = useAppStore.getState().demoElders.map(e => e.id);
        const vitals = getStoredToken() ? Object.fromEntries(Object.entries(event.data.vitals).filter(([id]) => allowed.includes(id))) : event.data.vitals;
        useAppStore.setState({ demoVitals: vitals });
      }
    };
  }

  window.addEventListener('gcare:acknowledge-alert', (event: Event) => {
    const { id, episodeKey, elderId, elderName } = (event as CustomEvent).detail || {};
    const state = useAppStore.getState();
    const nextAlerts = state.activeAlerts.map(a => {
      // Named episode/ID acknowledgements never resolve other conditions.
      const matches = id ? a.id === id :
        episodeKey ? getAlertEpisodeKey(a) === episodeKey : (elderId && a.elder_id === elderId) || (elderName && a.elder_name === elderName);
      if (!matches || a.resolved) return a;
      if (!a.episode_recovered) markEpisodeAcknowledged(getAlertEpisodeKey(a));
      persistEpisodeAlert(a, { resolved: true });
      return { ...a, resolved: true };
    });
    storeActiveAlerts(nextAlerts);
    useAppStore.setState({ activeAlerts: nextAlerts });
  });

  subscribeToGcareBroadcast(msg => {
    if (msg.type === 'EPISODE_STATE_SYNC' && msg.episodeStatus === 'NORMAL' && msg.episodeKey) {
      const state = useAppStore.getState();
      state.setActiveAlerts(state.activeAlerts.map(a => getAlertEpisodeKey(a) === msg.episodeKey
        ? { ...a, episode_recovered: true } : a));
    } else if (msg.type === 'ALERT_CREATED' && msg.alert) {
      useAppStore.getState().addAlert(msg.alert);
    } else if (msg.type === 'ALERT_UPDATED' && msg.alert) {
      const target = useAppStore.getState().activeAlerts.find(a => a.id === msg.id);
      // An outdated update must not reopen an acknowledged record.
      if (target && !target.resolved)
        useAppStore.getState().updateAlertInPlace(target.id, msg.alert);
    } else if (msg.type === 'ALERT_ACKNOWLEDGED' || msg.type === 'ALERT_RESOLVED') {
      const state = useAppStore.getState();
      const target = state.activeAlerts.find(a => a.id === msg.id);
      const key = msg.episodeKey || (target ? getAlertEpisodeKey(target) : undefined);
      if (!key && !msg.id) return;
      const next = state.activeAlerts.map(a =>
        (msg.id ? a.id === msg.id : getAlertEpisodeKey(a) === key) ? { ...a, resolved: true } : a);
      state.setActiveAlerts(next);
      if (key && !target?.episode_recovered) markEpisodeAcknowledged(key);
    }
  });

  window.addEventListener('gcare:cross-event', (e: Event) => {
    const custom = e as CustomEvent<{ type?: string; mode?: 'all' | 'resolved' }>;
    if (custom.detail?.type === 'ALERTS_CLEARED') {
      const mode = custom.detail.mode || 'all';
      useAppStore.getState().clearAlerts(mode);
    }
  });
}
