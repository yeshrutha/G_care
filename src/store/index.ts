import { create } from 'zustand';

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
  elder_name: string;
  type: 'sos' | 'fall' | 'panic' | 'high_hr' | 'low_spo2' | 'missed_med' | 'med_taken' | 'geofence';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  location?: string;
  time: string;
  resolved: boolean;
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
  demoVitals: Record<string, DemoVitals>;
  setDemoVitals: (id: string, v: DemoVitals) => void;
  medications: Medication[];
  setMedications: (m: Medication[] | ((current: Medication[]) => Medication[])) => void;
  demoStep: number;
  setDemoStep: (s: number) => void;
}

const ACTIVE_ALERTS_STORAGE_KEY = 'gcare_active_alerts';

function getStoredActiveAlerts(): DemoAlert[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawAlerts = window.localStorage.getItem(ACTIVE_ALERTS_STORAGE_KEY);
  if (!rawAlerts) {
    return [];
  }

  try {
    const alerts = JSON.parse(rawAlerts);
    return Array.isArray(alerts) ? alerts : [];
  } catch {
    return [];
  }
}

function storeActiveAlerts(alerts: DemoAlert[]) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVE_ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }
}

export const useAppStore = create<AppStore>((set) => ({
  demoMode: false,
  setDemoMode: (v) => set({ demoMode: v }),
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
  demoElders: [],
  setDemoElders: (e) => set({ demoElders: e }),
  demoVitals: {},
  setDemoVitals: (id, v) => set((s) => ({ demoVitals: { ...s.demoVitals, [id]: v } })),
  medications: [],
  setMedications: (m) => set((s) => ({
    medications: typeof m === 'function' ? m(s.medications) : m,
  })),
  demoStep: 0,
  setDemoStep: (s) => set({ demoStep: s }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== ACTIVE_ALERTS_STORAGE_KEY) {
      return;
    }

    useAppStore.setState({ activeAlerts: getStoredActiveAlerts() });
  });
}
