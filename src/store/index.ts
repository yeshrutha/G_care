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
  type: 'sos' | 'fall' | 'panic' | 'high_hr' | 'low_spo2' | 'missed_med' | 'geofence';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  location?: string;
  time: string;
  resolved: boolean;
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
  demoStep: number;
  setDemoStep: (s: number) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  demoMode: false,
  setDemoMode: (v) => set({ demoMode: v }),
  language: 'en',
  setLanguage: (v) => set({ language: v }),
  authUser: null,
  setAuthUser: (u) => set({ authUser: u }),
  activeAlerts: [],
  setActiveAlerts: (a) => set({ activeAlerts: a }),
  addAlert: (a) => set((s) => ({ activeAlerts: [a, ...s.activeAlerts] })),
  resolveAlert: (id) => set((s) => ({ activeAlerts: s.activeAlerts.map(a => a.id === id ? { ...a, resolved: true } : a) })),
  demoElders: [],
  setDemoElders: (e) => set({ demoElders: e }),
  demoVitals: {},
  setDemoVitals: (id, v) => set((s) => ({ demoVitals: { ...s.demoVitals, [id]: v } })),
  demoStep: 0,
  setDemoStep: (s) => set({ demoStep: s }),
}));
