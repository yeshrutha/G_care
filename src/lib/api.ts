export type UserRole = 'caretaker' | 'doctor' | 'guardian';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  profile?: {
    elderName?: string;
    elderAge?: string;
    elderLanguage?: string;
    elderConditions?: string;
    elderPhone?: string;
    elderAddress?: string;
    hospital?: string;
    specialization?: string;
  };
  assignedElderIds?: string[];
  createdAt?: string;
}

const TOKEN_KEY = 'gcare_auth_token';
const USER_KEY = 'gcare_auth_user';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const endpoint = path.startsWith('/api') ? path : `/api${path}`;
  const origin = typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
    ? window.location.origin
    : 'http://127.0.0.1:8787';
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${origin}${endpoint}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  }

  return data as T;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function loginRequest(email: string, password: string) {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function registerRequest(payload: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string;
  elderName?: string;
  hospital?: string;
  specialization?: string;
}) {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMe() {
  return apiFetch<{ user: AuthUser }>('/auth/me');
}

export async function logoutRequest() {
  return apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}

