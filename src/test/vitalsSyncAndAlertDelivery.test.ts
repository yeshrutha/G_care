import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { simulateNextVitals } from '@/lib/vitalsSimulator';
import { detectVitalsAnomalies, processVitalsTickWithAlerts, clearAnomalyCooldowns } from '@/lib/anomalyDetector';
import { DEMO_ELDERS, DEMO_VITALS } from '@/lib/demoData';

describe('Phase 4: Vitals Sync, Alert Delivery, and Persistence Test Suite', () => {
  const usha = DEMO_ELDERS[0]; // Usha, normal baseline HR 68, BP 126/82, SpO2 97

  beforeEach(() => {
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
      expect(bpAnomalies[0].clinicalRecommendation).toContain('antihypertensive');
    });
  });
});
