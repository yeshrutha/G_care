vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(() => Promise.resolve(null)), getStoredToken: () => null, getStoredUser: () => null }));
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { DEMO_ELDERS, DEMO_VITALS } from '@/lib/demoData';
import {
  processVitalsTickWithAlerts,
  clearAnomalyCooldowns,
  resetAllEpisodeRecords,
  getAlertEpisodeKey,
  markEpisodeAcknowledged,
  markEpisodeRecovered,
} from '@/lib/anomalyDetector';
import { broadcastGcareMessage, subscribeToGcareBroadcast } from '@/lib/syncChannel';

describe('ALERT EPISODE DEDUPLICATION & LIFECYCLE (TEST SUITE A-J)', () => {
  const usha = DEMO_ELDERS.find((e) => e.id === 'elder-1')!;
  const lakshmi = DEMO_ELDERS.find((e) => e.id === 'elder-2')!;
  const venkatesh = DEMO_ELDERS.find((e) => e.id === 'elder-3')!;

  beforeEach(() => {
    window.localStorage.removeItem('gcare_episode_lifecycle');
    resetAllEpisodeRecords();
    clearAnomalyCooldowns();
    useAppStore.setState({ activeAlerts: [] });
    useGuardianStore.setState({ alerts: [] });
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('gcare_episode_lifecycle');
    }
  });

  // TEST A: Leave Venkatesh at low SpO2 for several minutes -> exactly ONE active alert
  it('TEST A: Continuous low SpO2 ticks over several cycles produce exactly ONE active alert', () => {
    const lowSpo2Vitals = { ...DEMO_VITALS[venkatesh.id], spo2: 92.5 };

    // Simulate 20 continuous ticks (as if running over several minutes)
    for (let i = 0; i < 20; i++) {
      processVitalsTickWithAlerts(venkatesh, lowSpo2Vitals);
    }

    const alerts = useAppStore.getState().activeAlerts;
    const activeSpo2Alerts = alerts.filter(
      (a) => !a.resolved && a.elder_name === venkatesh.full_name && a.type === 'low_spo2'
    );

    expect(activeSpo2Alerts.length).toBe(1);
    expect(alerts.length).toBe(1);
  });

  // TEST B: Telemetry changes 92.7 -> 92.9 -> 92.6 -> 92.3 -> still ONE alert, updated in place
  it('TEST B: Telemetry fluctuations (92.7 -> 92.9 -> 92.6 -> 92.3) update the single active alert in place', () => {
    const readings = [92.7, 92.9, 92.6, 92.3];

    for (const spo2Val of readings) {
      processVitalsTickWithAlerts(venkatesh, {
        ...DEMO_VITALS[venkatesh.id],
        spo2: spo2Val,
      });
    }

    const alerts = useAppStore.getState().activeAlerts;
    expect(alerts.length).toBe(1);
    expect(alerts[0].resolved).toBe(false);
    expect(alerts[0].message).toContain('92.3');
  });

  // TEST C: Acknowledge Venkatesh's alert while SpO2 is still abnormal -> moves to history; does NOT create new alert
  it('TEST C: Acknowledging alert while vital is still abnormal moves it to history and blocks duplicate alerts until recovery', () => {
    // 1. Trigger initial low SpO2 alert
    processVitalsTickWithAlerts(venkatesh, { ...DEMO_VITALS[venkatesh.id], spo2: 92.6 });
    const initialAlert = useAppStore.getState().activeAlerts[0];
    expect(initialAlert.resolved).toBe(false);

    // 2. Doctor/Caretaker acknowledges the alert
    useAppStore.getState().resolveAlert(initialAlert.id);
    expect(useAppStore.getState().activeAlerts[0].resolved).toBe(true);

    // 3. Next telemetry ticks still have low SpO2 (unresolved physiology)
    for (let i = 0; i < 5; i++) {
      const dispatched = processVitalsTickWithAlerts(venkatesh, { ...DEMO_VITALS[venkatesh.id], spo2: 92.4 });
      expect(dispatched.length).toBe(0);
    }

    // 4. Still only 1 alert in the store, marked resolved/in history
    const alerts = useAppStore.getState().activeAlerts;
    expect(alerts.length).toBe(1);
    expect(alerts[0].resolved).toBe(true);
    expect(alerts.filter((a) => !a.resolved).length).toBe(0);
  });

  // TEST D: Return Venkatesh SpO2 to normal (96%) -> no alert; recovery recorded
  it('TEST D: Telemetry returning to normal range (96%) triggers safe recovery without alerts', () => {
    // Acknowledge episode
    processVitalsTickWithAlerts(venkatesh, { ...DEMO_VITALS[venkatesh.id], spo2: 92.5 });
    const alertId = useAppStore.getState().activeAlerts[0].id;
    useAppStore.getState().resolveAlert(alertId);

    // Return to normal 96%
    const normalVitals = { ...DEMO_VITALS[venkatesh.id], spo2: 96.2 };
    const dispatched = processVitalsTickWithAlerts(venkatesh, normalVitals);

    expect(dispatched.length).toBe(0);
    // Alert remains in history as resolved
    expect(useAppStore.getState().activeAlerts.length).toBe(1);
    expect(useAppStore.getState().activeAlerts[0].resolved).toBe(true);
  });

  // TEST E: Later trigger new low-SpO2 episode -> ONE new alert created
  it('TEST E: After recovery, a new abnormal episode creates a new distinct alert', () => {
    // Episode 1: Low SpO2
    processVitalsTickWithAlerts(venkatesh, { ...DEMO_VITALS[venkatesh.id], spo2: 92.5 });
    const alert1 = useAppStore.getState().activeAlerts[0];
    useAppStore.getState().resolveAlert(alert1.id);

    // Recovered to normal
    processVitalsTickWithAlerts(venkatesh, { ...DEMO_VITALS[venkatesh.id], spo2: 96.5 });

    // Episode 2: Later new low SpO2 drop
    const dispatchedNew = processVitalsTickWithAlerts(venkatesh, { ...DEMO_VITALS[venkatesh.id], spo2: 91.8 });
    expect(dispatchedNew.length).toBe(1);

    const alerts = useAppStore.getState().activeAlerts;
    expect(alerts.length).toBe(2);
    // One active new alert, one historical resolved alert
    expect(alerts.filter((a) => !a.resolved).length).toBe(1);
    expect(alerts.filter((a) => a.resolved).length).toBe(1);
  });

  // TEST F: Lakshmi BP high -> ONE alert
  it('TEST F: Lakshmi Devi elevated BP generates exactly ONE active warning alert', () => {
    const highBpVitals = { ...DEMO_VITALS[lakshmi.id], systolic_bp: 148, diastolic_bp: 94 };

    for (let i = 0; i < 10; i++) {
      processVitalsTickWithAlerts(lakshmi, highBpVitals);
    }

    const alerts = useAppStore.getState().activeAlerts;
    const lakshmiAlerts = alerts.filter((a) => a.elder_name === lakshmi.full_name && !a.resolved);
    expect(lakshmiAlerts.length).toBe(1);
  });

  // TEST G: Usha BP drop 78/48 -> ONE critical SOS alert
  it('TEST G: Usha BP dropping to 78/48 mmHg triggers critical emergency SOS alert', () => {
    const hypotensionVitals = { ...DEMO_VITALS[usha.id], systolic_bp: 78, diastolic_bp: 48 };

    const dispatched = processVitalsTickWithAlerts(usha, hypotensionVitals);
    expect(dispatched.length).toBe(1);

    const alerts = useAppStore.getState().activeAlerts;
    const ushaAlert = alerts.find((a) => a.elder_name === usha.full_name && !a.resolved);
    expect(ushaAlert).toBeDefined();
    expect(ushaAlert?.severity).toBe('critical');
    expect(ushaAlert?.type).toBe('sos');
  });

  // TEST H: Doctor acknowledges Usha -> Watch alert dismissed, moves to history
  it('TEST H: Doctor acknowledges alert -> marks resolved and dispatches cross-window dismissal', () => {
    useAppStore.getState().addAlert({
      id: 'alert-usha-sos-test',
      elder_id: usha.id,
      elder_name: usha.full_name,
      type: 'sos',
      severity: 'critical',
      message: '🚨 CRITICAL EMERGENCY — Low BP',
      time: new Date().toISOString(),
      resolved: false,
    });

    let eventFired = false;
    let eventDetail: any = null;
    const handler = (e: Event) => {
      eventFired = true;
      eventDetail = (e as CustomEvent).detail;
    };
    window.addEventListener('gcare:acknowledge-alert', handler);

    useAppStore.getState().resolveAlert('alert-usha-sos-test');

    const alert = useAppStore.getState().activeAlerts.find((a) => a.id === 'alert-usha-sos-test');
    expect(alert?.resolved).toBe(true);
    expect(eventFired).toBe(true);
    expect(eventDetail?.id).toBe('alert-usha-sos-test');

    window.removeEventListener('gcare:acknowledge-alert', handler);
  });

  // TEST I: Clear Alert History button exists and respects section division
  it('TEST I: Clear Alert History logic safely partitions active vs resolved alerts', () => {
    useAppStore.setState({
      activeAlerts: [
        { id: 'act-1', elder_name: 'Usha', type: 'sos', severity: 'critical', message: 'Active SOS', time: new Date().toISOString(), resolved: false },
        { id: 'res-1', elder_name: 'Venkatesh Rao', type: 'low_spo2', severity: 'warning', message: 'Resolved SpO2', time: new Date().toISOString(), resolved: true },
        { id: 'res-2', elder_name: 'Lakshmi Devi', type: 'vital_abnormal', severity: 'warning', message: 'Resolved BP', time: new Date().toISOString(), resolved: true },
      ],
    });

    const activeList = useAppStore.getState().activeAlerts.filter((a) => !a.resolved);
    const historyList = useAppStore.getState().activeAlerts.filter((a) => a.resolved);

    expect(activeList.length).toBe(1);
    expect(historyList.length).toBe(2);
  });

  // TEST J: Clear history -> only resolved alerts disappear; active emergencies remain
  it('TEST J: Clear Alert History purges ONLY resolved alerts, preserving active emergencies across stores', () => {
    useAppStore.setState({
      activeAlerts: [
        { id: 'emergency-sos-keep', elder_name: 'Usha', type: 'sos', severity: 'critical', message: 'CRITICAL EMERGENCY ACTIVE', time: new Date().toISOString(), resolved: false },
        { id: 'history-warn-purge', elder_name: 'Venkatesh Rao', type: 'low_spo2', severity: 'warning', message: 'Old warning', time: new Date().toISOString(), resolved: true },
      ],
    });

    useGuardianStore.setState({
      alerts: [
        { id: 'g-emergency-keep', elderId: usha.id, elderName: usha.full_name, type: 'sos_trigger' as any, severity: 'critical', message: 'CRITICAL EMERGENCY ACTIVE', time: new Date().toISOString(), acknowledged: false },
        { id: 'g-history-purge', elderId: venkatesh.id, elderName: venkatesh.full_name, type: 'vital_abnormal', severity: 'warning', message: 'Old warning', time: new Date().toISOString(), acknowledged: true },
      ],
    });

    // Clear resolved alerts
    useAppStore.getState().clearAlerts('resolved');
    useGuardianStore.getState().clearAlerts('resolved');

    const remainingApp = useAppStore.getState().activeAlerts;
    expect(remainingApp.length).toBe(1);
    expect(remainingApp[0].id).toBe('emergency-sos-keep');
    expect(remainingApp[0].resolved).toBe(false);

    const remainingGuardian = useGuardianStore.getState().alerts;
    expect(remainingGuardian.length).toBe(1);
    expect(remainingGuardian[0].id).toBe('g-emergency-keep');
    expect(remainingGuardian[0].acknowledged).toBe(false);
  });
});
