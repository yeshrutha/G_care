import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render(element: React.ReactNode) {
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(element); });
}
function cleanup() { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); }
function labelElement(text: string) {
  const label = [...document.querySelectorAll('label')].find(l => l.textContent === text);
  return label?.htmlFor ? document.getElementById(label.htmlFor) : null;
}
const screen = {
  getByLabelText: (text: string) => { const element = labelElement(text); if (!element) throw new Error('Label not found: ' + text); return element; },
  queryByLabelText: labelElement,
};
const fireEvent = { change: (element: HTMLSelectElement, event: { target: { value: string } }) => {
  act(() => { element.value = event.target.value; element.dispatchEvent(new Event('change', { bubbles: true })); });
} };

import VerificationFields, { emptyVerification } from '@/components/VerificationFields';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { apiFetch, loginRequest, registerRequest, getStoredToken, getStoredUser } from '@/lib/api';
import { patientStorage } from '@/lib/patientStorage';

vi.mock('@/lib/api', async () => ({
  ...await vi.importActual<any>('@/lib/api'),
  apiFetch: vi.fn(), loginRequest: vi.fn(), registerRequest: vi.fn(), logoutRequest: vi.fn(),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

describe('Verification form and account state isolation', () => {
  beforeEach(() => {
    cleanup(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
    useAuthStore.setState({ user: null, token: null, loading: false, initialized: true });
    vi.mocked(apiFetch).mockResolvedValue([]);
  });
  it('provides required proof upload instead of the old reference textbox', async () => {
    await render(<VerificationFields role="doctor" value={emptyVerification} onChange={() => {}} />);
    const upload = screen.getByLabelText('Upload proof of identity or authorization') as HTMLInputElement;
    expect(upload.type).toBe('file'); expect(upload).toBeRequired();
    expect(upload.accept).toContain('.pdf'); expect(upload.accept).toContain('.docx');
    expect(screen.queryByLabelText('Evidence reference for the reviewer')).toBeNull();
  });
  it('offers only Nurse or Doctor’s assistant in professional caretaker signup', async () => {
    const onChange = vi.fn(); await render(<VerificationFields role="caretaker" value={emptyVerification} onChange={onChange} />);
    const role = screen.getByLabelText('Professional role') as HTMLSelectElement;
    expect([...role.options].map(o => o.value)).toEqual(['nurse', 'assistant']);
    fireEvent.change(role, { target: { value: 'assistant' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ staffKind: 'assistant' }));
    expect(screen.getByLabelText('Nursing registration or staff ID')).toBeRequired();
    expect(screen.getByLabelText('Supervising doctor')).toBeRequired();
  });
  it('keeps family relationships in Guardian registration and requests authorization evidence', async () => {
    await render(<VerificationFields role="guardian" value={emptyVerification} onChange={() => {}} />);
    expect(screen.getByLabelText('Relationship to the patient')).toBeInTheDocument();
    expect(screen.getByLabelText('Patient consent / authorization reference')).toBeRequired();
    expect(screen.queryByLabelText('Professional role')).toBeNull();
  });
  it('does not create a session or load patients after a pending registration response', async () => {
    const user = { id: 'pending', name: 'Applicant', email: 'pending@example.invalid', role: 'doctor', accessStatus: 'pending', assignedElderIds: [] };
    vi.mocked(registerRequest).mockResolvedValue({ pending: true, message: 'Pending', user } as any);
    await useAuthStore.getState().register({ name: user.name, email: user.email, password: 'TestOnly123!', role: 'doctor', proofId: 'TEST-ID', issuer: 'Test council', proofReference: 'Synthetic reference' });
    expect(getStoredToken()).toBeNull(); expect(useAuthStore.getState().user).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it('replaces stale patient state with authorized API state before completing login', async () => {
    const user = { id: 'nurse', name: 'Nurse', email: 'nurse@example.invalid', role: 'caretaker', accessStatus: 'approved', assignedElderIds: ['elder-1'] };
    useAppStore.setState({ demoElders: [{ id: 'elder-3', full_name: 'Other patient' }] as any, activeAlerts: [{ id: 'old', elder_id: 'elder-3' }] as any });
    useGuardianStore.setState({ alerts: [{ id: 'other', elderName: 'Other patient' }] as any });
    vi.mocked(loginRequest).mockResolvedValue({ token: 'synthetic-session', user } as any);
    vi.mocked(apiFetch).mockResolvedValue({ elders: [{ id: 'elder-1', full_name: 'Usha' }], medications: [], alarms: [], alerts: [], vitals: {} });
    await useAuthStore.getState().login(user.email, 'TestOnly123!', 'caretaker');
    expect(loginRequest).toHaveBeenCalledWith(user.email, 'TestOnly123!', 'caretaker');
    expect(useAppStore.getState().demoElders.map(e => e.id)).toEqual(['elder-1']);
    expect(useGuardianStore.getState().alerts).toEqual([]);
    expect(getStoredUser()?.assignedElderIds).toEqual(['elder-1']);
    expect(localStorage.getItem('gcare_auth_token')).toBeNull();
    expect(patientStorage()).toBe(sessionStorage);
    await useAuthStore.getState().logout();
    expect(getStoredToken()).toBeNull(); expect(useAppStore.getState().demoElders).toEqual([]);
  });
  it('filters unassigned cross-tab vitals and alert broadcasts for a signed-in patient scope', async () => {
    sessionStorage.setItem('gcare_auth_token', 'synthetic-session');
    sessionStorage.setItem('gcare_auth_user', JSON.stringify({ id: 'guardian', accessStatus: 'approved' }));
    useAppStore.setState({ demoElders: [{ id: 'elder-1', full_name: 'Usha' }] as any, demoVitals: {}, activeAlerts: [] });
    useAppStore.getState().setDemoVitals('elder-3', { spo2: 92 } as any);
    useAppStore.getState().addAlert({ id: 'unassigned', elder_id: 'elder-3', elder_name: 'Venkatesh Rao', type: 'low_spo2', severity: 'warning', message: 'Test', time: 'now', resolved: false });
    expect(useAppStore.getState().demoVitals['elder-3']).toBeUndefined();
    expect(useAppStore.getState().activeAlerts).toEqual([]);
  });
});
