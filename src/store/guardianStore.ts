import { create } from 'zustand';

export interface Reminder {
  id: string;
  elderId?: string;
  elderName?: string;
  type: 'medication' | 'food' | 'activity' | 'appointment';
  title: string;
  time: string;
  repeat: 'daily' | 'weekly' | 'custom' | 'once';
  verified: boolean;
  createdAt?: string;
  // Medication specific
  photo?: string;
  pillName?: string;
  dosage?: string;
  // Food specific
  mealType?: string;
  // Activity specific
  videoUrl?: string;
  routineDescription?: string;
  // Appointment specific
  doctorName?: string;
  hospitalName?: string;
  appointmentDate?: string;
}

export interface GuardianAlert {
  id: string;
  type: 'medicine_missed' | 'sos' | 'fall' | 'vital_abnormal' | 'geofence';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  time: string;
  acknowledged: boolean;
  elderName: string;
  elderId?: string;
}

export interface GuardianLog {
  id: string;
  date: string;
  type: string;
  message: string;
  value?: number;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
  primary: boolean;
}

export interface GuardianUser {
  name: string;
  email: string;
  phone: string;
  elderName: string;
  elderAge?: string;
  elderLanguage?: string;
  elderConditions?: string;
  elderPhone?: string;
  elderAddress?: string;
  emergencyContacts?: EmergencyContact[];
}

interface GuardianStore {
  guardianUser: GuardianUser | null;
  setGuardianUser: (u: GuardianStore['guardianUser']) => void;
  reminders: Reminder[];
  addReminder: (r: Reminder) => void;
  removeReminder: (id: string) => void;
  updateReminder: (id: string, r: Partial<Reminder>) => void;
  verifyReminder: (id: string) => void;
  setReminders: (reminders: Reminder[]) => void;
  alerts: GuardianAlert[];
  addGuardianAlert: (a: GuardianAlert) => void;
  acknowledgeAlert: (id: string) => void;
  clearAlerts: () => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  smartTvMode: boolean;
  setSmartTvMode: (v: boolean) => void;
}

const GUARDIAN_USER_STORAGE_KEY = 'gcare_guardian_user';

export function resolveAlertElderName(alert: { elderName?: string; message?: string }): string {
  const msg = alert.message || '';
  if (msg.includes('Venkatesh Rao')) return 'Venkatesh Rao';
  if (msg.includes('Lakshmi Devi')) return 'Lakshmi Devi';
  if (msg.includes('Usha')) return 'Usha';
  return alert.elderName || '';
}

export function isAlertForElder(alert: GuardianAlert, targetElderName?: string): boolean {
  if (!targetElderName || targetElderName === 'Registered elder') {
    return true;
  }
  const cleanTarget = targetElderName.trim().toLowerCase();
  const trueElderName = resolveAlertElderName(alert).trim().toLowerCase();

  if (trueElderName) {
    return trueElderName === cleanTarget || trueElderName.includes(cleanTarget) || cleanTarget.includes(trueElderName);
  }

  const fallbackElder = (alert.elderName || '').trim().toLowerCase();
  if (fallbackElder && fallbackElder !== 'registered elder') {
    return fallbackElder === cleanTarget || fallbackElder.includes(cleanTarget) || cleanTarget.includes(fallbackElder);
  }

  const msg = (alert.message || '').toLowerCase();
  if (msg.includes('venkatesh rao') && !cleanTarget.includes('venkatesh')) return false;
  if (msg.includes('lakshmi devi') && !cleanTarget.includes('lakshmi')) return false;
  if (msg.includes('usha') && !cleanTarget.includes('usha')) return false;

  return true;
}

export function sanitizeAlert(alert: GuardianAlert): GuardianAlert {
  const inferred = resolveAlertElderName(alert);
  return {
    ...alert,
    elderName: inferred || alert.elderName,
  };
}

function getStoredGuardianUser(): GuardianStore['guardianUser'] {
  if (typeof window === 'undefined' || !window.localStorage || typeof window.localStorage.getItem !== 'function') {
    return null;
  }

  const rawUser = window.localStorage.getItem(GUARDIAN_USER_STORAGE_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as GuardianStore['guardianUser'];
  } catch {
    return null;
  }
}

const INITIAL_GUARDIAN_USER = getStoredGuardianUser();
const INITIAL_ELDER_NAME = INITIAL_GUARDIAN_USER?.elderName || 'Registered elder';

const GUARDIAN_ALERTS_STORAGE_KEY = 'gcare_guardian_alerts';

const INITIAL_GUARDIAN_ALERTS: GuardianAlert[] = [
  {
    id: 'ga-1', type: 'medicine_missed', severity: 'warning',
    message: 'Metformin 500mg was not taken at 8:00 AM', time: new Date(Date.now() - 3600000).toISOString(),
    acknowledged: false, elderName: INITIAL_ELDER_NAME,
  },
  {
    id: 'ga-2', type: 'vital_abnormal', severity: 'warning',
    message: 'Heart rate elevated to 98 bpm for 10 minutes', time: new Date(Date.now() - 7200000).toISOString(),
    acknowledged: false, elderName: INITIAL_ELDER_NAME,
  },
];

function getStoredGuardianAlerts(): GuardianAlert[] {
  if (typeof window === 'undefined' || !window.localStorage || typeof window.localStorage.getItem !== 'function') return INITIAL_GUARDIAN_ALERTS;
  const raw = window.localStorage.getItem(GUARDIAN_ALERTS_STORAGE_KEY);
  if (!raw) return INITIAL_GUARDIAN_ALERTS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.map(sanitizeAlert) : INITIAL_GUARDIAN_ALERTS;
  } catch {
    return INITIAL_GUARDIAN_ALERTS;
  }
}

function storeGuardianAlerts(alerts: GuardianAlert[]) {
  if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
    window.localStorage.setItem(GUARDIAN_ALERTS_STORAGE_KEY, JSON.stringify(alerts.slice(0, 100)));
  }
}

export const useGuardianStore = create<GuardianStore>((set) => ({
  guardianUser: INITIAL_GUARDIAN_USER,
  setGuardianUser: (u) => {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
      if (u) {
        window.localStorage.setItem(GUARDIAN_USER_STORAGE_KEY, JSON.stringify(u));
      } else {
        window.localStorage.removeItem(GUARDIAN_USER_STORAGE_KEY);
      }
    }

    set({ guardianUser: u });
  },
  reminders: [
    {
      id: 'rem-1', elderId: 'elder-1', elderName: 'Usha', type: 'medication', title: 'Metformin 500mg', time: '08:00',
      repeat: 'daily', verified: false, pillName: 'Metformin', dosage: '500mg',
      photo: '',
    },
    {
      id: 'rem-2', elderId: 'elder-1', elderName: 'Usha', type: 'medication', title: 'Amlodipine 5mg', time: '08:00',
      repeat: 'daily', verified: false, pillName: 'Amlodipine', dosage: '5mg',
    },
    {
      id: 'rem-3', elderId: 'elder-1', elderName: 'Usha', type: 'food', title: 'Breakfast', time: '08:30',
      repeat: 'daily', verified: false, mealType: 'Breakfast',
    },
    {
      id: 'rem-4', elderId: 'elder-1', elderName: 'Usha', type: 'food', title: 'Lunch', time: '12:30',
      repeat: 'daily', verified: false, mealType: 'Lunch',
    },
    {
      id: 'rem-5', elderId: 'elder-1', elderName: 'Usha', type: 'activity', title: 'Morning Walk', time: '06:30',
      repeat: 'daily', verified: false, routineDescription: '30 min walk in park',
      videoUrl: 'https://www.youtube.com/watch?v=example',
    },
    {
      id: 'rem-6', elderId: 'elder-1', elderName: 'Usha', type: 'appointment', title: 'Dr. Ramesh Cardiology', time: '10:00',
      repeat: 'once', verified: false, doctorName: 'Dr. Ramesh Kumar',
      hospitalName: 'Apollo Hospitals', appointmentDate: '2026-04-05',
    },
    {
      id: 'rem-7', elderId: 'elder-2', elderName: 'Lakshmi Devi', type: 'medication', title: 'Ecosprin 75mg', time: '09:00',
      repeat: 'daily', verified: false, pillName: 'Ecosprin', dosage: '75mg',
      photo: '',
    },
    {
      id: 'rem-8', elderId: 'elder-3', elderName: 'Venkatesh Rao', type: 'medication', title: 'Deriphyllin 150mg', time: '10:00',
      repeat: 'daily', verified: false, pillName: 'Deriphyllin', dosage: '150mg',
      photo: '',
    },
  ],
  addReminder: (r) => set((s) => ({ reminders: [...s.reminders, r] })),
  removeReminder: (id) => set((s) => ({ reminders: s.reminders.filter(r => r.id !== id) })),
  updateReminder: (id, updates) => set((s) => ({
    reminders: s.reminders.map(r => r.id === id ? { ...r, ...updates } : r),
  })),
  verifyReminder: (id) => set((s) => ({
    reminders: s.reminders.map(r => r.id === id ? { ...r, verified: true } : r),
  })),
  setReminders: (reminders) => set({ reminders }),
  alerts: getStoredGuardianAlerts(),
  addGuardianAlert: (a) => set((s) => {
    const sanitized = sanitizeAlert(a);
    const nextAlerts = [sanitized, ...s.alerts.filter((item) => item.id !== sanitized.id)].slice(0, 100);
    storeGuardianAlerts(nextAlerts);
    return { alerts: nextAlerts };
  }),
  acknowledgeAlert: (id) => set((s) => {
    const nextAlerts = s.alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a);
    storeGuardianAlerts(nextAlerts);
    return { alerts: nextAlerts };
  }),
  clearAlerts: () => {
    storeGuardianAlerts([]);
    set({ alerts: [] });
  },
  activeTab: 'feed',
  setActiveTab: (t) => set({ activeTab: t }),
  smartTvMode: false,
  setSmartTvMode: (v) => set({ smartTvMode: v }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === GUARDIAN_ALERTS_STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed)) {
          useGuardianStore.setState({ alerts: parsed.map(sanitizeAlert) });
        }
      } catch {}
    }
  });
}

