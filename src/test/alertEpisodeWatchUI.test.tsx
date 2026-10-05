import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import '@/i18n';
import WatchSimulator from '@/components/WatchSimulator';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { DEMO_ELDERS, DEMO_VITALS } from '@/lib/demoData';
import { processVitalsTickWithAlerts } from '@/lib/anomalyDetector';
import { broadcastGcareMessage, generateAppointmentMultilingualMessage } from '@/lib/syncChannel';
import { speakText } from '@/components/VoiceAssistant';

vi.mock('@/components/VoiceAssistant', async () => ({
  ...await vi.importActual<any>('@/components/VoiceAssistant'), speakText: vi.fn(), stopSpeaking: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(() => Promise.resolve(null)), getStoredToken: () => null, getStoredUser: () => null }));
vi.mock('@/lib/audioAlerts', () => ({ triggerAlert: vi.fn(), startAlertLoop: vi.fn(), stopAlertLoop: vi.fn() }));

it('renders one Watch warning, silences it after clinician acknowledgement, then displays a genuinely new episode', () => {
  localStorage.clear();
  const elder = DEMO_ELDERS[2];
  useAppStore.setState({ activeAlerts: [], activeElderId: elder.id, demoVitals: { ...DEMO_VITALS }, activeAnomalyOverrides: {} });
  useGuardianStore.setState({ alerts: [] });
  const tick = (spo2: number) => act(() => {
    const vitals = { ...DEMO_VITALS[elder.id], spo2 };
    useAppStore.getState().setDemoVitals(elder.id, vitals);
    processVitalsTickWithAlerts(elder, vitals);
  });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const buttons = (name: string) => [...document.querySelectorAll('button')]
    .filter(button => button.textContent?.trim() === name);
  act(() => root.render(<WatchSimulator />));
  act(() => buttons('Watch Simulator')[0].click());
  tick(92);
  for (let i = 0; i < 9; i++) tick(91.5 + i / 10);
  expect(buttons('Acknowledge & Turn Off')).toHaveLength(1);
  const first = useAppStore.getState().activeAlerts[0];
  act(() => useAppStore.getState().resolveAlert(first.id));
  tick(91.7);
  expect(buttons('Acknowledge & Turn Off')).toHaveLength(0);
  expect(useAppStore.getState().demoVitals[elder.id].spo2).toBe(91.7);
  tick(95); tick(92);
  expect(buttons('Acknowledge & Turn Off')).toHaveLength(1);
  expect(useAppStore.getState().activeAlerts.filter(a => !a.resolved)).toHaveLength(1);
  expect(useGuardianStore.getState().alerts.filter(a => !a.acknowledged)[0].id)
    .toBe(useAppStore.getState().activeAlerts.find(a => !a.resolved)!.id);
  act(() => root.unmount());
  container.remove();
});


it('keeps SOS inside scrollable content and announces the selected elder appointment in Kannada', () => {
  localStorage.clear();
  vi.mocked(speakText).mockClear();
  const elder = DEMO_ELDERS[0];
  useAppStore.setState({ activeAlerts: [], activeElderId: elder.id, demoVitals: { ...DEMO_VITALS }, activeAnomalyOverrides: {} });
  useGuardianStore.setState({ alerts: [], reminders: [] });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<WatchSimulator />));
  const buttons = () => [...document.querySelectorAll('button')];
  act(() => buttons().find(b => b.textContent?.trim() === 'Watch Simulator')!.click());
  const sos = buttons().find(b => b.textContent?.includes('EMERGENCY SOS'))!;
  const scroll = sos.closest('.overflow-y-auto')!;
  expect(scroll).not.toBeNull();
  expect(scroll.lastElementChild).toBe(sos);
  expect(useAppStore.getState().activeAlerts).toHaveLength(0);
  const message = generateAppointmentMultilingualMessage(elder.full_name, '2026-10-06', '14:30', 'Ramesh', '13:30', 'kn');
  const booking = { type: 'APPOINTMENT_SCHEDULED' as const, appointmentId: 'test-appointment',
    elderId: elder.id, elderName: elder.full_name, language: 'kn', date: '2026-10-06', time: '14:30',
    prepAlarmTime: '13:30', doctorName: 'Ramesh', patientMessage: message.displayText,
    spokenText: message.spokenText, speechLang: message.speechLang,
    kannadaMessage: message.spokenText, englishMessage: 'Appointment booked', timestamp: Date.now() };
  vi.mocked(speakText).mockClear();
  act(() => broadcastGcareMessage({ ...booking, elderId: 'elder-3' }));
  expect(speakText).not.toHaveBeenCalled();
  act(() => broadcastGcareMessage(booking));
  expect(speakText).toHaveBeenCalledWith(message.spokenText, 'kn-IN', expect.any(Function));
  expect(document.body.textContent).toContain(message.displayText);
  expect(document.body.textContent).toContain('14:30');
  const completion = vi.mocked(speakText).mock.calls.at(-1)![2]!;
  act(() => completion());
  expect(document.body.textContent).not.toContain(message.displayText);
  expect(document.body.textContent).toContain('Live Vitals');
  act(() => root.unmount());
  container.remove();
});
