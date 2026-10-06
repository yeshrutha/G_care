export interface ProofUpload { fileName: string; fileType: string; fileSize: number; fileData: string }
export interface ProofMetadata { id: string; fileName: string; fileType: string; fileSize: number }
export type UserRole = 'caretaker' | 'doctor' | 'guardian';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  accessStatus?: 'approved' | 'pending' | 'rejected' | 'suspended' | 'demo';
  profile?: {
    elderName?: string;
    elderAge?: string;
    elderLanguage?: string;
    elderConditions?: string;
    elderPhone?: string;
    elderAddress?: string;
    hospital?: string;
    specialization?: string;
    accessVerification?: { proofFile?: ProofMetadata; status: string; proofId: string; issuer: string; proofReference: string; staffKind?: string; relationship?: string; supervisingDoctorId?: string; reviewNote?: string };
  };
  assignedElderIds?: string[];
  createdAt?: string;
}

const TOKEN_KEY = 'gcare_auth_token';
const USER_KEY = 'gcare_auth_user';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
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

export function getReportFileUrl(reportId: string): string {
  const token = getStoredToken();
  const envApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const origin = envApiUrl
    ? (envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl)
    : (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
        ? window.location.origin
        : 'http://127.0.0.1:8787');
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${origin}/api/reports/${reportId}/file${tokenParam}`;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(typeof FormData !== 'undefined' && options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const endpoint = path.startsWith('/api') ? path : `/api${path}`;
  const envApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const origin = envApiUrl
    ? (envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl)
    : (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
        ? window.location.origin
        : 'http://127.0.0.1:8787');
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${origin}${endpoint}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('gcare:session-invalid'));
    }
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  }

  return data as T;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function loginRequest(email: string, password: string, role?: UserRole, newPassword?: string) {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role, newPassword }),
  });
}

export interface RegistrationPayload {
  proofFile?: ProofUpload;
  email: string; password: string; name: string; role: UserRole;
  phone?: string; elderName?: string; hospital?: string; specialization?: string;
  proofId: string; issuer: string; proofReference: string;
  staffKind?: string; relationship?: string; supervisingDoctorId?: string;
}
export async function registerRequest(payload: RegistrationPayload) {
  return apiFetch<{ pending: true; message: string; user: AuthUser }>('/auth/register', {
    method: 'POST', body: JSON.stringify(payload),
  });
}

export async function fetchMe() {
  return apiFetch<{ user: AuthUser }>('/auth/me');
}

export async function logoutRequest() {
  return apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}


export async function downloadVerificationProof(accountId: string, fileName: string) {
  const origin = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || window.location.origin;
  const response = await fetch(`${origin}/api/auth/access-requests/${encodeURIComponent(accountId)}/proof`, { headers: { Authorization: `Bearer ${getStoredToken() || ''}` } });
  if (!response.ok) throw new Error('Proof could not be downloaded. Check your reviewer access.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
