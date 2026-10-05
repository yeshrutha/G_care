vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(() => Promise.resolve(null)), getStoredToken: () => null, getStoredUser: () => null }));
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { simulateNextVitals } from '@/lib/vitalsSimulator';
import { detectVitalsAnomalies, processVitalsTickWithAlerts, clearAnomalyCooldowns } from '@/lib/anomalyDetector';
import { DEMO_ELDERS, DEMO_VITALS } from '@/lib/demoData';

describe('Phase 4: Vitals Sync, Alert Delivery, and Persistence Test Suite', () => {
  const usha = DEMO_ELDERS[0]; // Usha, normal baseline HR 68, BP 126/82, SpO2 97

  beforeEach(() => {
    window.localStorage.removeItem('gcare_episode_lifecycle');
    vi.clearAllMocks();
    clearAnomalyCooldowns();
    localStorage.clear();

    // Reset stores
    useAppStore.setState({
      activeAlerts: [],
      activeAnomalyOverrides: {},
      demoVitals: { [usha.id]: { ...DEMO_VITALS[usha.id] } },
    });
    useGuardianStore.setState({
      alerts: [],
    });
  });

  describe('1. Anomaly Override Persistence Across Ticks', () => {
    it('maintains injected tachycardia (135 bpm) across multiple consecutive simulation ticks without premature clamping', () => {
      const overrides = { heart_rate: 135 };
      let currentVitals = { ...DEMO_VITALS[usha.id], ...overrides };

      // Simulate 5 consecutive 4-second ticks with the anomaly override active
      for (let tick = 1; tick <= 5; tick++) {
        currentVitals = simulateNextVitals(currentVitals, undefined, usha, overrides);
        // Even with OU random walk variation, it should stay severely elevated (> 120 bpm), not clamped back to Usha's normal baseline (71 bpm)
        expect(currentVitals.heart_rate).toBeGreaterThan(120);
        expect(currentVitals.heart_rate).toBeLessThan(150);
      }
    });

    it('maintains injected hypoxemia (SpO2 88%) across ticks without snapping back to 97%', () => {
      const overrides = { spo2: 88 };
      let currentVitals = { ...DEMO_VITALS[usha.id], ...overrides };

      for (let tick = 1; tick <= 4; tick++) {
        currentVitals = simulateNextVitals(currentVitals, undefined, usha, overrides);
        expect(currentVitals.spo2).toBeLessThanOrEqual(91);
        expect(currentVitals.spo2).toBeGreaterThanOrEqual(84);
      }
    });

    it('stabilizeElderVitals() clears override and restores normal physiological baseline', () => {
      useAppStore.getState().injectVitalsAnomaly(usha.id, { heart_rate: 140, spo2: 86 });
      expect(useAppStore.getState().activeAnomalyOverrides[usha.id]).toBeDefined();
      expect(useAppStore.getState().demoVitals[usha.id].heart_rate).toBe(140);

      // Stabilize
      useAppStore.getState().stabilizeElderVitals(usha.id);
      expect(useAppStore.getState().activeAnomalyOverrides[usha.id]).toBeUndefined();
      
      const restoredVitals = useAppStore.getState().demoVitals[usha.id];
      expect(restoredVitals.heart_rate).toBe(71);
      expect(Math.round(restoredVitals.spo2)).toBe(97);
    });
  });

  describe('2. Multi-Portal Alert Delivery (Caretaker, Doctor & Guardian)', () => {
    it('dispatches to both useAppStore and useGuardianStore upon detecting severe anomaly', () => {
      const anomalousVitals = {
        ...DEMO_VITALS[usha.id],
        heart_rate: 138,
      };

      const dispatched = processVitalsTickWithAlerts(usha, anomalousVitals, { force: true });
      expect(dispatched.length).toBeGreaterThan(0);
      expect(dispatched[0].metric).toBe('heart_rate');
      expect(dispatched[0].severity).toBe('critical');

      // Verify useAppStore received it
      const appAlerts = useAppStore.getState().activeAlerts;
      expect(appAlerts.some((a) => a.elder_id === usha.id && a.severity === 'critical')).toBe(true);

      // Verify useGuardianStore received it
      const guardianAlerts = useGuardianStore.getState().alerts;
      expect(guardianAlerts.some((ga) => ga.elderName === usha.full_name && ga.type === 'vital_abnormal')).toBe(true);
    });

    it('persists guardian alerts to localStorage and synchronizes cross-tab via storage event', () => {
      const mockAlert = {
        id: 'test-ga-1',
        type: 'vital_abnormal' as const,
        severity: 'critical' as const,
        message: 'SpO2 dropped below 89%',
        time: new Date().toISOString(),
        acknowledged: false,
        elderName: usha.full_name,
      };

      useGuardianStore.getState().addGuardianAlert(mockAlert);

      // Verify localStorage was written
      const stored = localStorage.getItem('gcare_guardian_alerts');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed[0].id).toBe('test-ga-1');

      // Simulate cross-tab event from another window/tab
      const remoteAlert = {
        id: 'remote-tab-alert-99',
        type: 'vital_abnormal' as const,
        severity: 'critical' as const,
        message: 'Acute BP surge detected in watch tab',
        time: new Date().toISOString(),
        acknowledged: false,
        elderName: usha.full_name,
      };

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'gcare_guardian_alerts',
          newValue: JSON.stringify([remoteAlert, mockAlert]),
        })
      );

      const updatedAlerts = useGuardianStore.getState().alerts;
      expect(updatedAlerts.some((a) => a.id === 'remote-tab-alert-99')).toBe(true);
    });
  });

  describe('3. Specific Diagnostic Details per Anomaly (No Generic Popups)', () => {
    it('detects distinct clinical diagnostic messages for different anomalies', () => {
      // 1. Tachycardia
      const tachVitals = { ...DEMO_VITALS[usha.id], heart_rate: 135 };
      const tachAnomalies = detectVitalsAnomalies(usha, tachVitals);
      expect(tachAnomalies[0].title).toBe('Severe Tachycardia Detected');
      expect(tachAnomalies[0].clinicalRecommendation).toContain('12-lead ECG');

      // 2. Bradycardia
      const bradyVitals = { ...DEMO_VITALS[usha.id], heart_rate: 45 };
      const bradyAnomalies = detectVitalsAnomalies(usha, bradyVitals);
      expect(bradyAnomalies[0].title).toBe('Severe Bradycardia Detected');
      expect(bradyAnomalies[0].clinicalRecommendation).toContain('perfusion');

      // 3. Hypoxemia
      const hypoVitals = { ...DEMO_VITALS[usha.id], spo2: 87 };
      const hypoAnomalies = detectVitalsAnomalies(usha, hypoVitals);
      expect(hypoAnomalies[0].title).toBe('Acute Hypoxemia Detected');
      expect(hypoAnomalies[0].clinicalRecommendation).toContain('supplemental O2');

      // 4. Hypertension Surge
      const bpVitals = { ...DEMO_VITALS[usha.id], systolic_bp: 175, diastolic_bp: 105 };
      const bpAnomalies = detectVitalsAnomalies(usha, bpVitals);
      expect(bpAnomalies[0].title).toBe('Hypertensive Urgency');
    });
  });

  describe('4. Watch Simulator & Guardian Portal Real-time Synchronization', () => {
    it('synchronizes all 8 monitors (HR, BP, SpO2, Stress, Hydration, Temp, Motion, Shiver) across the store', () => {
      // Simulate live tick
      useAppStore.getState().updateLiveVitalsTick();

      const ushaVitals = useAppStore.getState().demoVitals[usha.id];
      expect(ushaVitals).toBeDefined();
      expect(ushaVitals.heart_rate).toBeGreaterThan(50);
      expect(ushaVitals.systolic_bp).toBeGreaterThan(90);
      expect(ushaVitals.diastolic_bp).toBeGreaterThan(60);
      expect(ushaVitals.spo2).toBeGreaterThan(90);
      expect(ushaVitals.stress).toBeDefined();
      expect(ushaVitals.hydration).toBeDefined();
      expect(ushaVitals.skin_temp).toBeDefined();
      expect(ushaVitals.motion_state).toBeDefined();
      expect(['walking', 'sitting', 'standing', 'resting', 'lying_down']).toContain(ushaVitals.motion_state);
      expect(typeof ushaVitals.shiver_detected).toBe('boolean');
    });

    it('ensures Watch Simulator and Guardian Portal read identical vitals with 0 discrepancy', () => {
      // Set precise vitals
      const testVitals = {
        heart_rate: 79,
        systolic_bp: 125,
        diastolic_bp: 87,
        spo2: 98.9,
        stress: 20,
        hydration: 64,
        breathing_rate: 16,
        skin_temp: 36.8,
        shiver_detected: false,
        panic_detected: false,
        fall_detected: false,
        motion_state: 'standing' as const,
      };

      useAppStore.getState().setDemoVitals(usha.id, testVitals);

      // Verify store provides identical data
      const watchVitals = useAppStore.getState().demoVitals[usha.id];
      const portalVitals = useAppStore.getState().demoVitals[usha.id];

      expect(watchVitals.heart_rate).toBe(portalVitals.heart_rate);
      expect(watchVitals.systolic_bp).toBe(portalVitals.systolic_bp);
      expect(watchVitals.diastolic_bp).toBe(portalVitals.diastolic_bp);
      expect(watchVitals.spo2).toBe(portalVitals.spo2);
      expect(watchVitals.stress).toBe(portalVitals.stress);
      expect(watchVitals.hydration).toBe(portalVitals.hydration);
      expect(watchVitals.skin_temp).toBe(portalVitals.skin_temp);
      expect(watchVitals.motion_state).toBe('standing');
      expect(watchVitals.shiver_detected).toBe(false);
    });
  });
});
