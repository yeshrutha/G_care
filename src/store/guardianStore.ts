import { create } from 'zustand';

export interface Reminder {
  id: string;
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

function getStoredGuardianUser(): GuardianStore['guardianUser'] {
  if (typeof window === 'undefined') {
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

export const useGuardianStore = create<GuardianStore>((set) => ({
  guardianUser: INITIAL_GUARDIAN_USER,
  setGuardianUser: (u) => {
    if (typeof window !== 'undefined') {
      if (u) {
        window.localStorage.setItem(GUARDIAN_USER_STORAGE_KEY, JSON.stringify(u));
      } else {
        window.localStorage.removeItem(GUARDIAN_USER_STORAGE_KEY);
      }
    }

    set((s) => ({
      guardianUser: u,
      alerts: u?.elderName
        ? s.alerts.map((alert) => ({
            ...alert,
            elderName: u.elderName,
          }))
        : s.alerts,
    }));
  },
  reminders: [
    {
      id: 'rem-1', type: 'medication', title: 'Metformin 500mg', time: '08:00',
      repeat: 'daily', verified: false, pillName: 'Metformin', dosage: '500mg',
      photo: '',
    },
    {
      id: 'rem-2', type: 'medication', title: 'Amlodipine 5mg', time: '08:00',
      repeat: 'daily', verified: false, pillName: 'Amlodipine', dosage: '5mg',
    },
    {
      id: 'rem-3', type: 'food', title: 'Breakfast', time: '08:30',
      repeat: 'daily', verified: false, mealType: 'Breakfast',
    },
    {
      id: 'rem-4', type: 'food', title: 'Lunch', time: '12:30',
      repeat: 'daily', verified: false, mealType: 'Lunch',
    },
    {
      id: 'rem-5', type: 'activity', title: 'Morning Walk', time: '06:30',
      repeat: 'daily', verified: false, routineDescription: '30 min walk in park',
      videoUrl: 'https://www.youtube.com/watch?v=example',
    },
    {
      id: 'rem-6', type: 'appointment', title: 'Dr. Ramesh Cardiology', time: '10:00',
      repeat: 'once', verified: false, doctorName: 'Dr. Ramesh Kumar',
      hospitalName: 'Apollo Hospitals', appointmentDate: '2026-04-05',
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
  alerts: [
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
  ],
  addGuardianAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts] })),
  acknowledgeAlert: (id) => set((s) => ({
    alerts: s.alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a),
  })),
  clearAlerts: () => set({ alerts: [] }),
  activeTab: 'feed',
  setActiveTab: (t) => set({ activeTab: t }),
  smartTvMode: false,
  setSmartTvMode: (v) => set({ smartTvMode: v }),
}));
