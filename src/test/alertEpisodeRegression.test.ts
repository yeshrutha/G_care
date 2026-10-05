import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { DEMO_ELDERS, DEMO_VITALS } from '@/lib/demoData';
import { getActiveWatchAnomalies, getAlertEpisodeKey, hydrateAlertRecords, loadEpisodeRecords, persistEpisodeAlert, processVitalsTickWithAlerts } from '@/lib/anomalyDetector';
import { reconcileAlertEpisodes } from '@/lib/alertEpisodeIdentity.js';
import { apiFetch } from '@/lib/api';
import { broadcastGcareMessage } from '@/lib/syncChannel';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(() => Promise.resolve(null)), getStoredToken: () => null, getStoredUser: () => null }));
vi.mock('@/lib/audioAlerts', () => ({ triggerAlert: vi.fn() }));

const elder = DEMO_ELDERS[2];
const tick = (spo2: number, extra = {}) => processVitalsTickWithAlerts(elder, { ...DEMO_VITALS[elder.id], spo2, ...extra });

describe('Continuous physiological episodes', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ activeAlerts: [], activeAnomalyOverrides: {}, demoVitals: { ...DEMO_VITALS } });
    useGuardianStore.setState({ alerts: [] });
  });

  it('normalizes name-only legacy alerts to the elder ID identity', () => {
    expect(getAlertEpisodeKey({ elder_name: elder.full_name, type: 'low_spo2' }))
      .toBe(getAlertEpisodeKey({ elder_id: elder.id, type: 'low_spo2' }));
  });

  it('keeps one stable alert ID for ten ticks with changing low readings', () => {
    tick(92);
    const id = useAppStore.getState().activeAlerts[0].id;
    for (const value of [91.8, 91.5, 91.9, 92.2, 91.7, 91.4, 92, 91.6, 92.1]) tick(value);
    expect(useAppStore.getState().activeAlerts).toHaveLength(1);
    expect(useAppStore.getState().activeAlerts[0].id).toBe(id);
    expect(useGuardianStore.getState().alerts).toHaveLength(1);
    expect(useGuardianStore.getState().alerts[0].id).toBe(id);
  });

  it('records recovery without resolving pending alerts, then permits a new episode', () => {
    tick(92); tick(91.7);
    const id = useAppStore.getState().activeAlerts[0].id;
    tick(95); tick(96.5);
    expect(useAppStore.getState().activeAlerts[0].resolved).toBe(false);
    expect(useGuardianStore.getState().alerts[0].acknowledged).toBe(false);
    expect(loadEpisodeRecords().get(`${elder.id}:LOW_SPO2`)?.status).toBe('NORMAL');
    tick(92); tick(91.6);
    const alerts = useAppStore.getState().activeAlerts;
    expect(alerts).toHaveLength(2);
    expect(alerts.filter(a => !a.resolved)).toHaveLength(2);
    expect(alerts.find(a => !a.episode_recovered)?.id).not.toBe(id);
  });

  it('keeps all three demo anomalies pending after safe readings and reload until manual action', () => {
    const usha = DEMO_ELDERS[0];
    processVitalsTickWithAlerts(usha, { ...DEMO_VITALS[usha.id], spo2: 89, heart_rate: 127, stress: 95 });
    expect(useAppStore.getState().activeAlerts).toHaveLength(3);
    processVitalsTickWithAlerts(usha, { ...DEMO_VITALS[usha.id], spo2: 98, heart_rate: 72, stress: 20 });
    hydrateAlertRecords(JSON.parse(localStorage.getItem('gcare_active_alerts')!));
    expect(useAppStore.getState().activeAlerts.every(a => !a.resolved && a.episode_recovered)).toBe(true);
    expect(useGuardianStore.getState().alerts.filter(a => !a.acknowledged)).toHaveLength(3);
    const oxygen = useAppStore.getState().activeAlerts.find(a => a.type === 'low_spo2')!;
    useAppStore.getState().resolveAlert(oxygen.id);
    expect(useAppStore.getState().activeAlerts.filter(a => !a.resolved)).toHaveLength(2);
    expect(useGuardianStore.getState().alerts.filter(a => !a.acknowledged)).toHaveLength(2);
  });

  it.each(['clinician', 'guardian'])('%s acknowledgement leaves physiology intact and silences only its episode', (role) => {
    useAppStore.getState().setDemoVitals(elder.id, { ...DEMO_VITALS[elder.id], spo2: 92, heart_rate: 110 });
    tick(92, { heart_rate: 110 });
    const oxygen = useAppStore.getState().activeAlerts.find(a => a.type === 'low_spo2')!;
    if (role === 'guardian') {
      const guardian = useGuardianStore.getState().alerts.find(a => /Oxygen/.test(a.message))!;
      useGuardianStore.getState().acknowledgeAlert(guardian.id);
    } else useAppStore.getState().resolveAlert(oxygen.id);
    expect(useAppStore.getState().demoVitals[elder.id].spo2).toBe(92);
    expect(useAppStore.getState().activeAlerts.find(a => a.type === 'high_hr')?.resolved).toBe(false);
    tick(91.5, { heart_rate: 110 });
    expect(useAppStore.getState().activeAlerts).toHaveLength(2);
    expect(useAppStore.getState().activeAlerts.find(a => a.type === 'low_spo2')?.resolved).toBe(true);
  });

  it('keeps acknowledged state after reload of persisted stores and lifecycle', () => {
    tick(92);
    useAppStore.getState().resolveAlert(useAppStore.getState().activeAlerts[0].id);
    useAppStore.setState({ activeAlerts: JSON.parse(localStorage.getItem('gcare_active_alerts')!) });
    useGuardianStore.setState({ alerts: JSON.parse(localStorage.getItem('gcare_guardian_alerts')!) });
    tick(91.6);
    expect(useAppStore.getState().activeAlerts).toHaveLength(1);
    expect(useAppStore.getState().activeAlerts[0].resolved).toBe(true);
    expect(loadEpisodeRecords().get(`${elder.id}:LOW_SPO2`)?.status).toBe('ACKNOWLEDGED_AWAITING_RECOVERY');
  });

  it('keeps elders and anomaly types independent', () => {
    tick(92, { heart_rate: 110 });
    processVitalsTickWithAlerts(DEMO_ELDERS[0], { ...DEMO_VITALS['elder-1'], spo2: 92 });
    expect(useAppStore.getState().activeAlerts.filter(a => !a.resolved)).toHaveLength(3);
    expect(new Set(useAppStore.getState().activeAlerts.map(getAlertEpisodeKey)).size).toBe(3);
  });

  it('watch and all portal stores share IDs, acknowledgement, recovery and the next episode', () => {
    tick(92);
    const first = useAppStore.getState().activeAlerts[0];
    const watch = () => getActiveWatchAnomalies(elder, { ...DEMO_VITALS[elder.id], spo2: 92 }, useAppStore.getState().activeAlerts);
    expect(watch()).toHaveLength(1);
    expect(useGuardianStore.getState().alerts[0].id).toBe(first.id);
    // Deliver the same payload that another tab receives.
    broadcastGcareMessage({ type: 'ALERT_ACKNOWLEDGED', id: first.id, episodeKey: getAlertEpisodeKey(first), timestamp: Date.now() });
    expect(watch()).toHaveLength(0);
    expect(useGuardianStore.getState().alerts[0].acknowledged).toBe(true);
    tick(91.7);
    expect(useAppStore.getState().activeAlerts).toHaveLength(1);
    tick(95); tick(92);
    expect(watch()).toHaveLength(1);
    expect(useGuardianStore.getState().alerts.filter(a => !a.acknowledged)).toHaveLength(1);
  });

  it('does not rearm acknowledged oxygen through an unrelated metric, escalation or forced tick', () => {
    tick(92, { heart_rate: 110 });
    const first = useAppStore.getState().activeAlerts.find(a => a.type === 'low_spo2')!;
    useAppStore.getState().resolveAlert(first.id);
    tick(91.7); // Heart rate recovers; oxygen has not recovered.
    processVitalsTickWithAlerts(elder, { ...DEMO_VITALS[elder.id], spo2: 89 }, { force: true });
    expect(useAppStore.getState().activeAlerts.filter(a => a.type === 'low_spo2')).toHaveLength(1);
    expect(useAppStore.getState().activeAlerts.find(a => a.id === first.id)?.resolved).toBe(true);
  });

  it('hydrates acknowledged server state on a fresh browser and never reopens it from stale data', () => {
    const alert = { id: 'persisted', elder_id: elder.id, elder_name: elder.full_name, type: 'low_spo2' as const,
      anomaly_type: 'LOW_SPO2', severity: 'warning' as const, message: 'Oxygen 92%', time: new Date().toISOString(), resolved: true };
    hydrateAlertRecords([alert]);
    hydrateAlertRecords([{ ...alert, resolved: false }]);
    tick(91.7);
    expect(useAppStore.getState().activeAlerts).toHaveLength(1);
    expect(useAppStore.getState().activeAlerts[0].resolved).toBe(true);
    expect(useGuardianStore.getState().alerts[0].acknowledged).toBe(true);
  });

  it('does not reopen an acknowledged ID from a delayed alert creation broadcast', () => {
    tick(92);
    const original = useAppStore.getState().activeAlerts[0];
    const guardian = useGuardianStore.getState().alerts[0];
    useAppStore.getState().resolveAlert(original.id);
    broadcastGcareMessage({ type: 'ALERT_CREATED', id: original.id, alert: original, timestamp: Date.now() });
    useGuardianStore.getState().addGuardianAlert(guardian);
    expect(useAppStore.getState().activeAlerts[0].resolved).toBe(true);
    expect(useGuardianStore.getState().alerts[0].acknowledged).toBe(true);
    tick(91.7);
    expect(useAppStore.getState().activeAlerts).toHaveLength(1);
  });

  it('closes only extra active condition records while preserving all historical and appointment records', () => {
    const base = { elder_name: elder.full_name, type: 'low_spo2', severity: 'warning', message: 'Oxygen low', time: '2026-10-05T12:00:00Z', resolved: false };
    const records = [ { ...base, id: 'old' }, { ...base, id: 'current', time: '2026-10-05T12:01:00Z' },
      { ...base, id: 'history-1', resolved: true }, { ...base, id: 'history-2', resolved: true },
      { ...base, id: 'appointment', type: 'appointment', resolved: true },
      { ...base, id: 'usha', elder_name: 'Usha' } ];
    const cleaned = reconcileAlertEpisodes(records);
    expect(cleaned).toHaveLength(records.length);
    expect(cleaned.find(a => a.id === 'old')).toMatchObject({ resolved: true, duplicate_of: 'current' });
    expect(cleaned.filter(a => !a.resolved).map(a => a.id)).toEqual(['current', 'usha']);
    expect(records[0].resolved).toBe(false); // Pure, safe preview of migration.
  });

  it('serializes an immediate acknowledgement behind POST and uses the canonical server ID', async () => {
    await persistEpisodeAlert({ id: 'drain', elder_name: elder.full_name, type: 'low_spo2', severity: 'warning', message: 'drain', time: new Date().toISOString(), resolved: true });
    const api = vi.mocked(apiFetch);
    api.mockClear();
    let finishCreate!: (alert: any) => void;
    api.mockImplementationOnce(() => new Promise(resolve => { finishCreate = resolve; }));
    tick(92);
    const original = useAppStore.getState().activeAlerts[0];
    useAppStore.getState().resolveAlert(original.id);
    await Promise.resolve();
    expect(api.mock.calls.map(call => call[1]?.method)).toEqual(['POST']);
    finishCreate({ ...original, id: 'canonical-server-id' });
    await persistEpisodeAlert(original, { resolved: true });
    expect(api.mock.calls[1][0]).toBe('/alerts/canonical-server-id');
    expect(useAppStore.getState().activeAlerts[0]).toMatchObject({ id: 'canonical-server-id', resolved: true });
    expect(useGuardianStore.getState().alerts[0]).toMatchObject({ id: 'canonical-server-id', acknowledged: true });
  });

  it('adopts the server ID when hydration arrives before a pending creation response', async () => {
    await persistEpisodeAlert({ id: 'drain-race', elder_name: elder.full_name, type: 'low_spo2', severity: 'warning', message: 'drain', time: new Date().toISOString(), resolved: true });
    let finish!: (alert: any) => void;
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    tick(92);
    const optimistic = useAppStore.getState().activeAlerts[0];
    await Promise.resolve();
    const canonical = { ...optimistic, id: 'server-before-response' };
    hydrateAlertRecords([canonical]);
    finish(canonical);
    await persistEpisodeAlert(optimistic, { message: 'Latest oxygen 91.7%' });
    expect(useAppStore.getState().activeAlerts).toHaveLength(1);
    expect(useAppStore.getState().activeAlerts[0]).toMatchObject({ id: canonical.id, resolved: false });
    expect(useGuardianStore.getState().alerts).toHaveLength(1);
    expect(useGuardianStore.getState().alerts[0]).toMatchObject({ id: canonical.id, acknowledged: false });
  });
});
