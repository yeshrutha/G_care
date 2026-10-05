import { create } from 'zustand';
import {
  AuthUser,
  apiFetch,
  RegistrationPayload,
  clearSession,
  fetchMe,
  getStoredToken,
  getStoredUser,
  loginRequest,
  logoutRequest,
  registerRequest,
  storeSession,
  UserRole,
} from '@/lib/api';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  initialized: boolean;
  loading: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string, role?: UserRole) => Promise<AuthUser>;
  register: (payload: RegistrationPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  syncLegacyStores: (user: AuthUser | null) => void;
}

function syncLegacyStores(user: AuthUser | null) {
  const appStore = useAppStore.getState();
  const guardianStore = useGuardianStore.getState();

  if (!user) {
    appStore.setAuthUser(null);
    guardianStore.setGuardianUser(null);
    return;
  }

  if (user.role === 'guardian') {
    guardianStore.setGuardianUser({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      elderName: user.profile?.elderName || 'Registered elder',
      elderAge: user.profile?.elderAge,
      elderLanguage: user.profile?.elderLanguage,
      elderConditions: user.profile?.elderConditions,
      elderPhone: user.profile?.elderPhone,
      elderAddress: user.profile?.elderAddress,
    });
    appStore.setAuthUser(null);
    return;
  }

  appStore.setAuthUser({
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
  });
}

function clearPatientState() {
  if (typeof window !== 'undefined') {
    // Remove per-tab patient caches when the account changes; server history is retained.
    for (const key of Object.keys(window.sessionStorage)) if (key.startsWith('gcare_') && !key.startsWith('gcare_auth_')) window.sessionStorage.removeItem(key);
  }
  useAppStore.setState({ demoElders: [], demoVitals: {}, activeAlerts: [], medications: [], alarms: [], demoMode: false });
  useGuardianStore.setState({ alerts: [], reminders: [] });
}
async function loadPatientState(user: AuthUser) {
  clearPatientState();
  const data = await apiFetch<any>('/dashboard-data');
  const elders = data.elders || [];
  user = { ...user, assignedElderIds: elders.map((e: any) => e.id) };
  useAppStore.setState({ demoElders: elders, demoVitals: data.vitals || {}, activeAlerts: data.alerts || [], medications: data.medications || [], alarms: data.alarms || [] });
  const d=new Date(); const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const reminders=[...(data.medications || []).flatMap((m:any)=>(m.times || []).map((time:string,index:number)=>({id:`med-${m.id}-${index}`,elderId:m.elder_id,elderName:elders.find((e:any)=>e.id===m.elder_id)?.full_name,type:'medication',title:`${m.brand_name} ${m.dose_amount}${m.dose_unit}`,pillName:m.brand_name,dosage:`${m.dose_amount}${m.dose_unit}`,photo:m.photo,time,repeat:'daily',verified:false}))),...(data.alarms || []).map((a:any)=>({...a,id:`alarm-${a.id}`,repeat:a.repeat || 'daily',verified:false}))];
  useGuardianStore.setState({reminders:reminders.map((r:any)=>{const ack=(data.reminderAcknowledgements || []).find((a:any)=>a.elderId===r.elderId && a.reminderId===r.id && a.occurrenceDate===today);return ack?{...r,verified:true,acknowledgementDate:today}:r;})});
  if (user.role === 'guardian' && elders[0]) {
    const e = elders[0];
    user = { ...user, profile: { ...user.profile, elderName: e.full_name, elderAge: String(e.age), elderLanguage: e.language_pref, elderConditions: (e.medical_conditions || []).join(', ') } };
  }
  syncLegacyStores(user);
  return user;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: getStoredUser(),
  token: getStoredToken(),
  initialized: false,
  loading: false,

  syncLegacyStores,

  hydrate: async () => {
    const token = getStoredToken();
    const storedUser = getStoredUser();
    if (!token) {
      clearPatientState();
      syncLegacyStores(null);
      set({ initialized: true, user: null, token: null });
      return;
    }

    try {
      const result = await fetchMe();
      const user = await loadPatientState(result.user);
      storeSession(token, user);
      set({ user, token, initialized: true });
    } catch {
      clearSession(); clearPatientState(); syncLegacyStores(null);
      set({ user: null, token: null, initialized: true });
    }
  },

  login: async (email, password, role) => {
    set({ loading: true });
    try {
      const result = await loginRequest(email, password, role);
      const token = result.token;
      storeSession(token, result.user);
      const user = await loadPatientState(result.user);
      storeSession(token, user);
      set({ user, token, loading: false });
      return user;
    } catch (error) {
      clearSession(); clearPatientState(); syncLegacyStores(null);
      set({ user: null, token: null, loading: false });
      throw error;
    }
  },

  register: async (payload) => {
    set({ loading: true });
    try {
      const { user } = await registerRequest(payload);
      set({ loading: false });
      return user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      if (getStoredToken()) await logoutRequest();
    } catch {
      // Local cleanup still happens when the session is already expired or the API is offline.
    } finally {
      clearPatientState();
      clearSession();
      syncLegacyStores(null);
      set({ user: null, token: null });
    }
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('gcare:session-invalid', () => {
    clearPatientState(); clearSession(); syncLegacyStores(null);
    useAuthStore.setState({ user: null, token: null, initialized: true });
  });
  void useAuthStore.getState().hydrate();
}

