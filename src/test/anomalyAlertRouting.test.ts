import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectVitalsAnomalies,
  processVitalsTickWithAlerts,
  clearAnomalyCooldowns,
  ALERT_COOLDOWN_MS,
} from '@/lib/anomalyDetector';
import { useAppStore } from '@/store';
import { useGuardianStore, isAlertForElder, resolveAlertElderName } from '@/store/guardianStore';
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

      // Third immediate tick within ongoing episode also does not insert duplicate alerts
      const thirdDispatched = processVitalsTickWithAlerts(usha, anomalousVitals);
      expect(thirdDispatched.length).toBe(0);
      expect(useAppStore.getState().activeAlerts.length).toBe(alertCountAfterFirst);

      // Resolving the alert and returning vitals to safe baseline allows a new episode alert
      const activeAlert = useAppStore.getState().activeAlerts[0];
      useAppStore.getState().resolveAlert(activeAlert.id);
      processVitalsTickWithAlerts(usha, DEMO_VITALS[usha.id]); // returns to safe range
      const newEpisodeDispatched = processVitalsTickWithAlerts(usha, anomalousVitals);
      expect(newEpisodeDispatched.length).toBe(1);
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

  describe('Guardian Alert Scoping & Privacy', () => {
    const venkatesh = DEMO_ELDERS[2]; // Venkatesh Rao
    const lakshmi = DEMO_ELDERS[1]; // Lakshmi Devi

    it('prevents alerts of Venkatesh Rao and Lakshmi Devi from matching Usha guardian', () => {
      const venkateshAlert = {
        id: 'ga-v1',
        type: 'vital_abnormal' as const,
        severity: 'warning' as const,
        message: "⚠️ Vital Alert: Venkatesh Rao's Oxygen Saturation dropped to 92%. Dr. Ramesh Kumar and caretaker have been notified.",
        time: new Date().toISOString(),
        acknowledged: false,
        elderName: 'Venkatesh Rao',
      };

      const lakshmiAlert = {
        id: 'ga-l1',
        type: 'vital_abnormal' as const,
        severity: 'warning' as const,
        message: "⚠️ Vital Alert: Lakshmi Devi's BP reached 140/87 mmHg. Dr. Ramesh Kumar and caretaker have been notified.",
        time: new Date().toISOString(),
        acknowledged: false,
        elderName: 'Lakshmi Devi',
      };

      const ushaAlert = {
        id: 'ga-u1',
        type: 'vital_abnormal' as const,
        severity: 'warning' as const,
        message: "⚠️ Vital Alert: Usha's Heart Rate elevated to 102 bpm. Dr. Ramesh Kumar and caretaker have been notified.",
        time: new Date().toISOString(),
        acknowledged: false,
        elderName: 'Usha',
      };

      expect(isAlertForElder(venkateshAlert, 'Usha')).toBe(false);
      expect(isAlertForElder(lakshmiAlert, 'Usha')).toBe(false);
      expect(isAlertForElder(ushaAlert, 'Usha')).toBe(true);
    });

    it('resolves true elder from message even if alert elderName was previously corrupted', () => {
      const corruptedAlert = {
        id: 'ga-corrupted',
        type: 'vital_abnormal' as const,
        severity: 'warning' as const,
        message: "⚠️ Vital Alert: Venkatesh Rao's Oxygen Saturation dropped to 92%. Dr. Ramesh Kumar and caretaker have been notified.",
        time: new Date().toISOString(),
        acknowledged: false,
        elderName: 'Usha', // Was falsely rewritten to Usha in previous bug
      };

      expect(resolveAlertElderName(corruptedAlert)).toBe('Venkatesh Rao');
      expect(isAlertForElder(corruptedAlert, 'Usha')).toBe(false);
    });

    it('setGuardianUser does not rewrite elderName on existing alerts', () => {
      useGuardianStore.setState({
        alerts: [
          {
            id: 'ga-v2',
            type: 'vital_abnormal',
            severity: 'warning',
            message: "⚠️ Vital Alert: Venkatesh Rao's Oxygen Saturation dropped to 92%.",
            time: new Date().toISOString(),
            acknowledged: false,
            elderName: 'Venkatesh Rao',
          },
        ],
      });

      useGuardianStore.getState().setGuardianUser({
        name: 'Vishwa',
        email: 'vishwa@example.com',
        phone: '1234567890',
        elderName: 'Usha',
      });

      const alertsAfter = useGuardianStore.getState().alerts;
      expect(alertsAfter[0].elderName).toBe('Venkatesh Rao');
    });
  });
});

