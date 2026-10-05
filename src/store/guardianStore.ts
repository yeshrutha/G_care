import { create } from 'zustand';
import { calculateMinutesBefore } from '@/lib/syncChannel';

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
  appointmentId?: string;
  doctorName?: string;
  hospitalName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  isOneHourReminder?: boolean;
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
  clearAlerts: (mode?: 'all' | 'resolved') => void;
  removeAlert: (id: string) => void;
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
    id: 'ga-appt-1', type: 'vital_abnormal', severity: 'info',
    message: 'Appointment booked & resolved: Follow-up consultation for Usha with Dr. Ramesh Kumar.',
    time: new Date(Date.now() - 3600000).toISOString(),
    acknowledged: true, elderName: 'Usha',
  },
  {
    id: 'ga-appt-2', type: 'vital_abnormal', severity: 'info',
    message: 'Appointment booked & resolved: Cardiology review for Lakshmi Devi with Dr. Ramesh Kumar.',
    time: new Date(Date.now() - 7200000).toISOString(),
    acknowledged: true, elderName: 'Lakshmi Devi',
  },
  {
    id: 'ga-appt-3', type: 'vital_abnormal', severity: 'info',
    message: 'Appointment booked & resolved: Pulmonology review for Venkatesh Rao with Dr. Ramesh Kumar.',
    time: new Date(Date.now() - 10800000).toISOString(),
    acknowledged: true, elderName: 'Venkatesh Rao',
  },
];

function getStoredGuardianAlerts(): GuardianAlert[] {
  if (typeof window === 'undefined' || !window.localStorage || typeof window.localStorage.getItem !== 'function') return INITIAL_GUARDIAN_ALERTS;
  const raw = window.localStorage.getItem(GUARDIAN_ALERTS_STORAGE_KEY);
  if (raw === null) return INITIAL_GUARDIAN_ALERTS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return INITIAL_GUARDIAN_ALERTS;
    if (parsed.length === 0) return [];
    const sanitized = parsed.map(sanitizeAlert);
    // Deduplicate repetitive alerts for the same elder and type to eliminate accumulated spam
    const seen = new Set<string>();
    const deduplicated: GuardianAlert[] = [];
    for (const a of sanitized) {
      const key = `${a.elderName || ''}-${a.type}-${a.severity}-${a.acknowledged}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(a);
      }
    }
    return deduplicated.slice(0, 15);
  } catch {
    return INITIAL_GUARDIAN_ALERTS;
  }
}

function storeGuardianAlerts(alerts: GuardianAlert[]) {
  if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
    window.localStorage.setItem(GUARDIAN_ALERTS_STORAGE_KEY, JSON.stringify(alerts.slice(0, 15)));
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
  removeReminder: (id) => set((s) => {
    const target = s.reminders.find(r => r.id === id);
    const appointmentId = target?.appointmentId;
    return {
      reminders: s.reminders.filter(r => {
        if (r.id === id) return false;
        if (appointmentId && r.appointmentId === appointmentId) return false;
        return true;
      }),
    };
  }),
  updateReminder: (id, updates) => set((s) => {
    const target = s.reminders.find(r => r.id === id);
    const appointmentId = target?.appointmentId || updates.appointmentId;
    let next = s.reminders.map(r => r.id === id ? { ...r, ...updates } : r);

    // If an appointment was rescheduled, update its associated 1-hour prep alarm!
    if (appointmentId && (updates.time || updates.appointmentTime)) {
      const newTime = updates.time || updates.appointmentTime || target?.time || '10:00';
      const newDate = updates.appointmentDate || target?.appointmentDate;
      const newPrepTime = calculateMinutesBefore(newTime, 60);

      next = next.map((item) => {
        if (item.appointmentId === appointmentId && item.isOneHourReminder) {
          return {
            ...item,
            time: newPrepTime,
            appointmentTime: newTime,
            appointmentDate: newDate || item.appointmentDate,
          };
        }
        return item;
      });
    }

    return { reminders: next };
  }),
  verifyReminder: (id) => set((s) => ({
    reminders: s.reminders.map(r => r.id === id ? { ...r, verified: true } : r),
  })),
  setReminders: (reminders) => set({ reminders }),
  addGuardianAlert: (a) => set((s) => {
    const sanitized = sanitizeAlert(a);
    // Prevent duplicate unacknowledged alerts for the same elder & condition
    if (!sanitized.acknowledged) {
      const alreadyHas = s.alerts.some(
        (existing) =>
          !existing.acknowledged &&
          existing.elderName?.trim().toLowerCase() === sanitized.elderName?.trim().toLowerCase() &&
          existing.type === sanitized.type
      );
      if (alreadyHas) return s;
    }
    const nextAlerts = [sanitized, ...s.alerts.filter((item) => item.id !== sanitized.id)].slice(0, 15);
    storeGuardianAlerts(nextAlerts);
    return { alerts: nextAlerts };
  }),
  acknowledgeAlert: (id) => set((s) => {
    const target = s.alerts.find(a => a.id === id);
    const nextAlerts = s.alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a);
    storeGuardianAlerts(nextAlerts);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gcare:acknowledge-alert', {
          detail: { id, elderName: target?.elderName, elderId: target?.elderId },
        })
      );
    }

    return { alerts: nextAlerts };
  }),
  clearAlerts: (mode: 'all' | 'resolved' = 'resolved', elderName?: string) => set((s) => {
    const nextAlerts = s.alerts.filter((a) => {
      // If elderName is specified, only clear for that elder (RBAC)
      if (elderName && a.elderName && a.elderName.trim().toLowerCase() !== elderName.trim().toLowerCase()) {
        return true;
      }
      if (mode === 'resolved') {
        // Keep active emergency alerts untouched!
        return !a.acknowledged;
      }
      return false;
    });
    storeGuardianAlerts(nextAlerts);
    return { alerts: nextAlerts };
  }),
  removeAlert: (id: string) => set((s) => {
    const nextAlerts = s.alerts.filter((a) => a.id !== id);
    storeGuardianAlerts(nextAlerts);
    return { alerts: nextAlerts };
  }),
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

  window.addEventListener('gcare:cross-event', (e: Event) => {
    const custom = e as CustomEvent<{ type?: string; mode?: 'all' | 'resolved' }>;
    if (custom.detail?.type === 'ALERTS_CLEARED') {
      const mode = custom.detail.mode || 'all';
      useGuardianStore.getState().clearAlerts(mode);
    }
  });

  window.addEventListener('gcare:acknowledge-alert', (e: Event) => {
    const customEvent = e as CustomEvent<{ id?: string; elderId?: string; elderName?: string }>;
    const { id, elderId, elderName } = customEvent.detail || {};
    const state = useGuardianStore.getState();
    let changed = false;
    const nextAlerts = state.alerts.map((a) => {
      const matchesId = id && a.id === id;
      const matchesElder =
        (elderName && a.elderName?.trim().toLowerCase() === elderName.trim().toLowerCase()) ||
        (elderId && a.elderId === elderId);
      if ((matchesId || matchesElder) && !a.acknowledged) {
        changed = true;
        return { ...a, acknowledged: true };
      }
      return a;
    });

    if (changed) {
      storeGuardianAlerts(nextAlerts);
      useGuardianStore.setState({ alerts: nextAlerts });
    }
  });
}

