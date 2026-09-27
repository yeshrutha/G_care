import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectVitalsAnomalies,
  processVitalsTickWithAlerts,
  clearAnomalyCooldowns,
  ALERT_COOLDOWN_MS,
} from '@/lib/anomalyDetector';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { DEMO_ELDERS, DEMO_VITALS } from '@/lib/demoData';

describe('Vitals Anomaly Detection & Multi-Role Alert Routing', () => {
  const usha = DEMO_ELDERS[0]; // Usha, 68y

  beforeEach(() => {
    clearAnomalyCooldowns();
    useAppStore.setState({ activeAlerts: [] });
    useGuardianStore.setState({ alerts: [] });
  });

  describe('detectVitalsAnomalies()', () => {
    it('detects severe tachycardia when Heart Rate spikes above 120 bpm', () => {
      const vitals = { ...DEMO_VITALS[usha.id], heart_rate: 135 };
      const anomalies = detectVitalsAnomalies(usha, vitals);

      expect(anomalies.length).toBeGreaterThan(0);
      const hrAnomaly = anomalies.find((a) => a.metric === 'heart_rate');
      expect(hrAnomaly).toBeDefined();
      expect(hrAnomaly?.severity).toBe('critical');
      expect(hrAnomaly?.value).toBe(135);
      expect(hrAnomaly?.title).toContain('Tachycardia');
    });

    it('detects severe bradycardia when Heart Rate drops below 48 bpm', () => {
      const vitals = { ...DEMO_VITALS[usha.id], heart_rate: 44 };
      const anomalies = detectVitalsAnomalies(usha, vitals);

      const hrAnomaly = anomalies.find((a) => a.metric === 'heart_rate');
      expect(hrAnomaly).toBeDefined();
      expect(hrAnomaly?.severity).toBe('critical');
      expect(hrAnomaly?.value).toBe(44);
      expect(hrAnomaly?.title).toContain('Bradycardia');
    });

    it('detects acute hypoxemia when SpO2 drops below 90%', () => {
      const vitals = { ...DEMO_VITALS[usha.id], spo2: 88 };
      const anomalies = detectVitalsAnomalies(usha, vitals);

      const spo2Anomaly = anomalies.find((a) => a.metric === 'spo2');
      expect(spo2Anomaly).toBeDefined();
      expect(spo2Anomaly?.severity).toBe('critical');
      expect(spo2Anomaly?.value).toBe(88);
      expect(spo2Anomaly?.title).toContain('Hypoxemia');
    });

    it('detects hypertensive urgency when systolic BP surges >= 160 mmHg', () => {
      const vitals = { ...DEMO_VITALS[usha.id], systolic_bp: 168, diastolic_bp: 104 };
      const anomalies = detectVitalsAnomalies(usha, vitals);

      const bpAnomaly = anomalies.find((a) => a.metric === 'systolic_bp' || a.metric === 'diastolic_bp');
      expect(bpAnomaly).toBeDefined();
      expect(bpAnomaly?.severity).toBe('critical');
      expect(bpAnomaly?.title).toContain('Hypertensive');
    });

    it('returns empty anomalies for stable baseline vitals', () => {
      const baselineVitals = {
        heart_rate: 72,
        systolic_bp: 120,
        diastolic_bp: 80,
        spo2: 98,
        stress: 20,
        hydration: 80,
        breathing_rate: 16,
        skin_temp: 36.6,
        shiver_detected: false,
        panic_detected: false,
        fall_detected: false,
      };

      const anomalies = detectVitalsAnomalies(usha, baselineVitals);
      expect(anomalies).toEqual([]);
    });
  });

  describe('processVitalsTickWithAlerts() Routing & De-bouncing', () => {
    it('dispatches alerts to both useAppStore and useGuardianStore', () => {
      const anomalousVitals = { ...DEMO_VITALS[usha.id], heart_rate: 135 };
      const dispatched = processVitalsTickWithAlerts(usha, anomalousVitals);

      expect(dispatched.length).toBeGreaterThan(0);

      // App Store alert verification (Doctor & Caretaker)
      const appAlerts = useAppStore.getState().activeAlerts;
      expect(appAlerts.length).toBeGreaterThan(0);
      expect(appAlerts[0].elder_name).toBe(usha.full_name);
      expect(appAlerts[0].severity).toBe('critical');

      // Guardian Store alert verification
      const guardianAlerts = useGuardianStore.getState().alerts;
      expect(guardianAlerts.length).toBeGreaterThan(0);
      expect(guardianAlerts[0].elderName).toBe(usha.full_name);
      expect(guardianAlerts[0].type).toBe('vital_abnormal');
    });

    it('suppresses duplicate alerts within cooldown period', () => {
      const anomalousVitals = { ...DEMO_VITALS[usha.id], heart_rate: 135 };

      // First tick dispatches
      const firstDispatched = processVitalsTickWithAlerts(usha, anomalousVitals);
      expect(firstDispatched.length).toBe(1);
      const alertCountAfterFirst = useAppStore.getState().activeAlerts.length;

      // Second immediate tick is debounced
      const secondDispatched = processVitalsTickWithAlerts(usha, anomalousVitals);
      expect(secondDispatched.length).toBe(0);
      expect(useAppStore.getState().activeAlerts.length).toBe(alertCountAfterFirst);

      // Forced tick overrides cooldown
      const forcedDispatched = processVitalsTickWithAlerts(usha, anomalousVitals, { force: true });
      expect(forcedDispatched.length).toBe(1);
      expect(useAppStore.getState().activeAlerts.length).toBe(alertCountAfterFirst + 1);
    });
  });

  describe('useAppStore injectVitalsAnomaly() & stabilizeElderVitals()', () => {
    it('injects anomaly directly into demoVitals and fires alert', () => {
      useAppStore.getState().injectVitalsAnomaly(usha.id, { heart_rate: 140 });

      const updatedVitals = useAppStore.getState().demoVitals[usha.id];
      expect(updatedVitals.heart_rate).toBe(140);

      const appAlerts = useAppStore.getState().activeAlerts;
      expect(appAlerts.some((a) => a.message.includes('140'))).toBe(true);
    });

    it('stabilizes vitals back to baseline', () => {
      useAppStore.getState().injectVitalsAnomaly(usha.id, { heart_rate: 140, spo2: 85 });
      useAppStore.getState().stabilizeElderVitals(usha.id);

      const restoredVitals = useAppStore.getState().demoVitals[usha.id];
      expect(restoredVitals.heart_rate).toBeLessThan(100);
      expect(restoredVitals.heart_rate).toBeGreaterThan(60);
      expect(restoredVitals.spo2).toBeGreaterThanOrEqual(94);
    });
  });
});
