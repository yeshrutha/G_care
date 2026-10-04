import { create } from 'zustand';
import { initializePatientVitals, simulateNextVitals, getElderBaseline } from '@/lib/vitalsSimulator';
import { DEMO_ELDERS } from '@/lib/demoData';
import { processVitalsTickWithAlerts, clearAnomalyCooldowns } from '@/lib/anomalyDetector';

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

export interface DemoVitals {
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
}

export interface DemoAlert {
  id: string;
  elder_id?: string;
  elder_name: string;
  type: 'sos' | 'fall' | 'panic' | 'high_hr' | 'low_spo2' | 'missed_med' | 'med_taken' | 'geofence';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  location?: string;
  time: string;
  resolved: boolean;
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
  resolveAlert: (id: string) => void;
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
  if (!isStorageAvailable()) return [];
  const rawAlerts = window.localStorage.getItem(ACTIVE_ALERTS_STORAGE_KEY);
  if (!rawAlerts) return [];
  try {
    const alerts = JSON.parse(rawAlerts);
    return Array.isArray(alerts) ? alerts : [];
  } catch {
    return [];
  }
}

function storeActiveAlerts(alerts: DemoAlert[]) {
  if (isStorageAvailable()) {
    window.localStorage.setItem(ACTIVE_ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }
}

function getStoredDemoMode(): boolean {
  if (!isStorageAvailable()) return false;
  return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
}

function storeDemoMode(v: boolean) {
  if (isStorageAvailable()) {
    window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, String(v));
  }
}

function getStoredMedications(): Medication[] {
  if (!isStorageAvailable()) return INITIAL_SEED_MEDICATIONS;
  const raw = window.localStorage.getItem(MEDICATIONS_STORAGE_KEY);
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
    window.localStorage.setItem(MEDICATIONS_STORAGE_KEY, JSON.stringify(meds));
  }
}

function getStoredAlarms(): StoreAlarm[] {
  if (!isStorageAvailable()) return INITIAL_SEED_ALARMS;
  const raw = window.localStorage.getItem(ALARMS_STORAGE_KEY);
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
    window.localStorage.setItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
  }
}

function getStoredActiveElderId(): string {
  if (!isStorageAvailable()) return 'elder-1';
  return window.localStorage.getItem(ACTIVE_ELDER_STORAGE_KEY) || 'elder-1';
}

function storeActiveElderId(id: string) {
  if (isStorageAvailable()) {
    window.localStorage.setItem(ACTIVE_ELDER_STORAGE_KEY, id);
  }
}

export const useAppStore = create<AppStore>((set) => ({
  demoMode: getStoredDemoMode(),
  setDemoMode: (v) => {
    storeDemoMode(v);
    set({ demoMode: v });
    if (!v) {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('gcare_demo_emergency_event');
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
    storeActiveAlerts(a);
    set({ activeAlerts: a });
  },
  addAlert: (a) => set((s) => {
    const activeAlerts = [a, ...s.activeAlerts].slice(0, 100);
    storeActiveAlerts(activeAlerts);
    return { activeAlerts };
  }),
  resolveAlert: (id) => set((s) => {
    const activeAlerts = s.activeAlerts.map(a => a.id === id ? { ...a, resolved: true } : a);
    storeActiveAlerts(activeAlerts);
    return { activeAlerts };
  }),
  demoElders: DEMO_ELDERS,
  setDemoElders: (e) => set({ demoElders: e }),
  activeElderId: getStoredActiveElderId(),
  setActiveElderId: (id) => {
    storeActiveElderId(id);
    set({ activeElderId: id });
  },
  activeWatchElderId: null,
  setActiveWatchElderId: (id) => set({ activeWatchElderId: id }),
  demoVitals: initializePatientVitals(DEMO_ELDERS),
  setDemoVitals: (id, v) => set((s) => ({ demoVitals: { ...s.demoVitals, [id]: v } })),
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
    const next = s.alarms.map((x) => x.id === id ? { ...x, ...a } : x);
    storeAlarms(next);
    return { alarms: next };
  }),
  deleteAlarm: (id) => set((s) => {
    const next = s.alarms.filter((x) => x.id !== id);
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
    const elders = state.demoElders && state.demoElders.length > 0 ? state.demoElders : DEMO_ELDERS;
    const nextVitals: Record<string, DemoVitals> = { ...state.demoVitals };
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    elders.forEach((elder) => {
      const current = nextVitals[elder.id] || getElderBaseline(elder);
      const activeOverride = state.activeAnomalyOverrides[elder.id];
      const override = (activeOverride && activeOverride.expiresAt > nowMs) ? activeOverride.overrides : undefined;
      const next = simulateNextVitals(current, undefined, elder, override);
      nextVitals[elder.id] = next;
      processVitalsTickWithAlerts(elder, next);
    });

    const updatedElders = elders.map((e) => ({
      ...e,
      last_vitals_at: nowIso,
    }));

    return {
      demoVitals: nextVitals,
      demoElders: updatedElders,
    };
  }),
  injectVitalsAnomaly: (elderId: string, overrides: Partial<DemoVitals>) => {
    set((state) => {
      const elders = state.demoElders && state.demoElders.length > 0 ? state.demoElders : DEMO_ELDERS;
      const elder = elders.find((e) => e.id === elderId) || elders[0];
      const current = state.demoVitals[elderId] || getElderBaseline(elder);
      const updated: DemoVitals = { ...current, ...overrides };

      // Force dispatch alerts immediately on manual demo trigger
      processVitalsTickWithAlerts(elder, updated, { force: true });

      return {
        activeAnomalyOverrides: {
          ...state.activeAnomalyOverrides,
          [elderId]: { overrides, expiresAt: Date.now() + 15 * 60 * 1000 },
        },
        demoVitals: {
          ...state.demoVitals,
          [elderId]: updated,
        },
      };
    });
  },
  stabilizeElderVitals: (elderId: string) => {
    set((state) => {
      const elders = state.demoElders && state.demoElders.length > 0 ? state.demoElders : DEMO_ELDERS;
      const elder = elders.find((e) => e.id === elderId) || elders[0];
      clearAnomalyCooldowns(elderId);
      const baseline = getElderBaseline(elder);

      const nextOverrides = { ...state.activeAnomalyOverrides };
      delete nextOverrides[elderId];

      return {
        activeAnomalyOverrides: nextOverrides,
        demoVitals: {
          ...state.demoVitals,
          [elderId]: baseline,
        },
      };
    });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === ACTIVE_ALERTS_STORAGE_KEY) {
      useAppStore.setState({ activeAlerts: getStoredActiveAlerts() });
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
  });
}
