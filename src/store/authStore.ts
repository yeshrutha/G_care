import { create } from 'zustand';
import {
  AuthUser,
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
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    phone?: string;
    elderName?: string;
    hospital?: string;
    specialization?: string;
  }) => Promise<AuthUser>;
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

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: getStoredUser(),
  token: getStoredToken(),
  initialized: false,
  loading: false,

  syncLegacyStores,

  hydrate: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ initialized: true, user: null, token: null });
      return;
    }

    try {
      const { user } = await fetchMe();
      storeSession(token, user);
      syncLegacyStores(user);
      set({ user, token, initialized: true });
    } catch {
      clearSession();
      syncLegacyStores(null);
      set({ user: null, token: null, initialized: true });
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const { token, user } = await loginRequest(email, password);
      storeSession(token, user);
      syncLegacyStores(user);
      set({ user, token, loading: false });
      return user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (payload) => {
    set({ loading: true });
    try {
      const { token, user } = await registerRequest(payload);
      storeSession(token, user);
      syncLegacyStores(user);
      set({ user, token, loading: false });
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
      clearSession();
      syncLegacyStores(null);
      set({ user: null, token: null });
    }
  },
}));

if (typeof window !== 'undefined') {
  void useAuthStore.getState().hydrate();
}

