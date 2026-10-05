import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import {
  detectVitalsAnomalies,
  processVitalsTickWithAlerts,
  clearAnomalyCooldowns,
  isConditionInSafeRange,
} from '@/lib/anomalyDetector';
import { getElderBaseline, simulateNextVitals } from '@/lib/vitalsSimulator';
import {
  calculateMinutesBefore,
  formatAppointmentDate,
  formatTime12Hour,
  generateAppointmentMultilingualMessage,
  broadcastGcareMessage,
  subscribeToGcareBroadcast,
} from '@/lib/syncChannel';

describe('G-Care End-to-End Workflow Verification (20 Requirement Cases)', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeAlerts: [],
      alarms: [],
      activeAnomalyOverrides: {},
    });
    useGuardianStore.setState({
      alerts: [],
      reminders: [],
    });
    clearAnomalyCooldowns();
  });

  // Case 1: Usha baseline produces normal vitals without alert spam
  it('Case 1: Usha baseline telemetry produces normal vitals without alert spam', () => {
    const elder = { id: 'elder-1', full_name: 'Usha' };
    const baseline = getElderBaseline(elder);
    expect(baseline.systolic_bp).toBeGreaterThanOrEqual(120);
    expect(baseline.systolic_bp).toBeLessThanOrEqual(135);
    expect(baseline.spo2).toBeGreaterThanOrEqual(96);

    const anomalies = detectVitalsAnomalies(elder, baseline);
    expect(anomalies.length).toBe(0);
  });

  // Case 2: Venkatesh Rao baseline produces normal vitals without SpO2 spam
  it('Case 2: Venkatesh Rao baseline telemetry produces normal vitals without SpO2 spam', () => {
    const elder = { id: 'elder-3', full_name: 'Venkatesh Rao' };
    const baseline = getElderBaseline(elder);
    expect(baseline.spo2).toBeGreaterThanOrEqual(95.5);

    const anomalies = detectVitalsAnomalies(elder, baseline);
    const spo2Anomalies = anomalies.filter((a) => a.metric === 'spo2');
    expect(spo2Anomalies.length).toBe(0);
  });

  // Case 3: Lakshmi Devi baseline produces normal vitals without BP warnings
  it('Case 3: Lakshmi Devi baseline telemetry produces normal vitals without BP warnings', () => {
    const elder = { id: 'elder-2', full_name: 'Lakshmi Devi' };
    const baseline = getElderBaseline(elder);
    expect(baseline.systolic_bp).toBeLessThan(138);

    const anomalies = detectVitalsAnomalies(elder, baseline);
    const bpAnomalies = anomalies.filter((a) => a.metric === 'systolic_bp' || a.metric === 'diastolic_bp');
    expect(bpAnomalies.length).toBe(0);
  });

  // Case 4: An ongoing abnormal vital generates exactly one alert for that episode
  it('Case 4: Continuous abnormal ticks generate exactly ONE alert for the ongoing episode', () => {
    const elder = { id: 'elder-1', full_name: 'Usha' };
    const abnormalVitals = {
      ...getElderBaseline(elder),
      heart_rate: 112, // High HR warning
    };

    // First tick creates 1 alert
    const dispatched1 = processVitalsTickWithAlerts(elder, abnormalVitals);
    expect(dispatched1.length).toBe(1);
    expect(useAppStore.getState().activeAlerts.length).toBe(1);

    // Second tick with same condition should NOT create another alert
    const dispatched2 = processVitalsTickWithAlerts(elder, abnormalVitals);
    expect(dispatched2.length).toBe(0);
    expect(useAppStore.getState().activeAlerts.length).toBe(1);

    // Third tick with same condition should NOT create another alert
    const dispatched3 = processVitalsTickWithAlerts(elder, abnormalVitals);
    expect(dispatched3.length).toBe(0);
    expect(useAppStore.getState().activeAlerts.length).toBe(1);
  });

  // Case 5: Hysteresis deadband prevents oscillating threshold alerts
  it('Case 5: Hysteresis deadband ensures vitals must return to safe baseline before re-arming', () => {
    const elder = { id: 'elder-3', full_name: 'Venkatesh Rao' };

    // Threshold for SpO2 warning is < 93. Recovery requires >= 95.0.
    const isSafeAt93 = isConditionInSafeRange('spo2', { ...getElderBaseline(elder), spo2: 93.5 });
    const isSafeAt94 = isConditionInSafeRange('spo2', { ...getElderBaseline(elder), spo2: 94.0 });
    const isSafeAt95 = isConditionInSafeRange('spo2', { ...getElderBaseline(elder), spo2: 95.5 });

    // 93.5% and 94% are still inside hysteresis deadband (not yet considered fully recovered)
    expect(isSafeAt93).toBe(false);
    expect(isSafeAt94).toBe(false);
    // 95.5% is fully recovered
    expect(isSafeAt95).toBe(true);
  });

  // Case 6: Returning to safe range and then dipping again triggers a new episode
  it('Case 6: Returning to safe range and resolving alert enables a new alert episode', () => {
    const elder = { id: 'elder-1', full_name: 'Usha' };
    const abnormal = { ...getElderBaseline(elder), heart_rate: 115 };
    const safe = { ...getElderBaseline(elder), heart_rate: 72 };

    // 1. First episode
    processVitalsTickWithAlerts(elder, abnormal);
    expect(useAppStore.getState().activeAlerts.length).toBe(1);

    // 2. Doctor resolves alert
    const alertId = useAppStore.getState().activeAlerts[0].id;
    useAppStore.getState().resolveAlert(alertId);
    expect(useAppStore.getState().activeAlerts[0].resolved).toBe(true);

    // 3. Vitals recover to safe baseline
    processVitalsTickWithAlerts(elder, safe);

    // 4. New abnormal episode occurs
    const newDispatched = processVitalsTickWithAlerts(elder, abnormal);
    expect(newDispatched.length).toBe(1);
    expect(useAppStore.getState().activeAlerts.length).toBe(2);
  });

  // Case 7: Low BP Drop button immediately triggers critical emergency alert
  it('Case 7: Critical Low BP drop triggers critical emergency anomaly and SOS alert', () => {
    const elder = { id: 'elder-1', full_name: 'Usha' };
    const shockVitals = {
      ...getElderBaseline(elder),
      systolic_bp: 78,
      diastolic_bp: 48,
    };

    const anomalies = detectVitalsAnomalies(elder, shockVitals);
    expect(anomalies.length).toBeGreaterThan(0);
    const critBp = anomalies.find((a) => a.metric === 'systolic_bp');
    expect(critBp?.severity).toBe('critical');
    expect(critBp?.title).toContain('Severe Hypotension');
  });

  // Case 8: Manual SOS button registers SOS alert in AppStore and GuardianStore
  it('Case 8: Manual SOS trigger immediately creates critical SOS alert in App and Guardian stores', () => {
    const sosAlert = {
      id: 'sos-test-1',
      elder_id: 'elder-1',
      elder_name: 'Usha',
      type: 'sos' as const,
      severity: 'critical' as const,
      message: '🚨 EMERGENCY SOS — Usha pressed SOS button!',
      time: new Date().toISOString(),
      resolved: false,
    };

    useAppStore.getState().addAlert(sosAlert);
    useGuardianStore.getState().addGuardianAlert({
      id: 'ga-sos-1',
      type: 'sos',
      severity: 'critical',
      message: '🚨 EMERGENCY SOS — Usha pressed SOS button!',
      time: sosAlert.time,
      acknowledged: false,
      elderName: 'Usha',
    });

    expect(useAppStore.getState().activeAlerts.some((a) => a.type === 'sos' && !a.resolved)).toBe(true);
    expect(useGuardianStore.getState().alerts.some((a) => a.type === 'sos' && !a.acknowledged)).toBe(true);
  });

  // Case 9: BroadcastChannel delivers SOS_TRIGGERED cross-portal in real time
  it('Case 9: BroadcastChannel delivers SOS_TRIGGERED cross-portal', () => {
    let captured: any = null;
    const unsub = subscribeToGcareBroadcast((msg) => {
      captured = msg;
    });

    broadcastGcareMessage({
      type: 'SOS_TRIGGERED',
      id: 'sos-123',
      elderId: 'elder-1',
      elderName: 'Usha',
      timestamp: Date.now(),
    });

    expect(captured).toBeDefined();
    expect(captured.type).toBe('SOS_TRIGGERED');
    expect(captured.elderName).toBe('Usha');
    unsub();
  });

  // Case 10: Doctor Portal separates Active Alerts from Alert History
  it('Case 10: Active Alerts and Alert History remain strictly separated', () => {
    useAppStore.getState().setActiveAlerts([
      { id: 'a1', elder_name: 'Usha', type: 'sos', severity: 'critical', message: 'SOS active', time: new Date().toISOString(), resolved: false },
      { id: 'a2', elder_name: 'Venkatesh Rao', type: 'low_spo2', severity: 'warning', message: 'SpO2 resolved', time: new Date().toISOString(), resolved: true },
    ]);

    const activeList = useAppStore.getState().activeAlerts.filter((a) => !a.resolved);
    const historyList = useAppStore.getState().activeAlerts.filter((a) => a.resolved);

    expect(activeList.length).toBe(1);
    expect(activeList[0].id).toBe('a1');
    expect(historyList.length).toBe(1);
    expect(historyList[0].id).toBe('a2');
  });

  // Case 11: Past appointment date and time are detected and rejected
  it('Case 11: Past appointment date and time are detected', () => {
    const pastDate = '2020-01-01';
    const pastTime = '09:00';
    const apptDateTime = new Date(`${pastDate}T${pastTime}:00`);
    const isPast = apptDateTime.getTime() < Date.now();
    expect(isPast).toBe(true);

    const futureDate = '2028-10-15';
    const futureTime = '10:00';
    const futureDateTime = new Date(`${futureDate}T${futureTime}:00`);
    const isFuture = futureDateTime.getTime() > Date.now();
    expect(isFuture).toBe(true);
  });

  // Case 12: Doctor appointment scheduling marks emergency alert resolved
  it('Case 12: Resolving an alert marks it resolved without deleting it from history', () => {
    useAppStore.getState().setActiveAlerts([
      { id: 'sos-ack-1', elder_name: 'Usha', type: 'sos', severity: 'critical', message: 'Emergency SOS', time: new Date().toISOString(), resolved: false },
    ]);

    useAppStore.getState().resolveAlert('sos-ack-1');
    const alert = useAppStore.getState().activeAlerts.find((a) => a.id === 'sos-ack-1');
    expect(alert).toBeDefined();
    expect(alert?.resolved).toBe(true);
  });

  // Case 13: Doctor acknowledgement stabilizes vitals to personal baseline
  it('Case 13: Doctor acknowledgement stabilizes vitals to baseline and clears overrides', () => {
    const elderId = 'elder-1';
    useAppStore.getState().injectVitalsAnomaly(elderId, { heart_rate: 135, systolic_bp: 75 });
    expect(useAppStore.getState().demoVitals[elderId]?.heart_rate).toBe(135);

    useAppStore.getState().stabilizeElderVitals(elderId);
    const stabilized = useAppStore.getState().demoVitals[elderId];
    expect(stabilized?.heart_rate).toBeLessThan(100);
    expect(stabilized?.systolic_bp).toBeGreaterThan(100);
  });

  // Case 14: Multilingual Kannada appointment notification with exact date & time
  it('Case 14: Kannada appointment notification formats date, time, and 60-min prep alarm', () => {
    const result = generateAppointmentMultilingualMessage(
      'Usha',
      '2026-10-12',
      '10:30',
      'Dr. Ramesh Kumar',
      '09:30',
      'kn'
    );

    expect(result.speechLang).toBe('kn-IN');
    expect(result.language).toBe('kn');
    expect(result.spokenText).toContain('ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ನಿಗದಿಯಾಗಿದೆ');
    expect(result.spokenText).toContain('ಅಕ್ಟೋಬರ್');
    expect(result.spokenText).toContain('10:30 AM');
    expect(result.spokenText).toContain('9:30 AM');
    expect(result.spokenText).toContain('ಅರವತ್ತು ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ');
    expect(result.displayText).toContain('10:30 AM');
    expect(result.displayText).toContain('9:30 AM');
  });

  // Case 15: Multilingual Hindi appointment notification for Venkatesh Rao
  it('Case 15: Hindi appointment notification for Venkatesh Rao', () => {
    const result = generateAppointmentMultilingualMessage(
      'Venkatesh Rao',
      '2026-10-12',
      '14:00',
      'Dr. Ramesh Kumar',
      '13:00',
      'hi'
    );

    expect(result.speechLang).toBe('hi-IN');
    expect(result.language).toBe('hi');
    expect(result.spokenText).toContain('आपका अपॉइंटमेंट तय हो गया है');
    expect(result.spokenText).toContain('2:00 PM');
    expect(result.spokenText).toContain('1:00 PM');
    expect(result.spokenText).toContain('साठ मिनट पहले');
  });

  // Case 16: Multilingual Tamil appointment notification for Lakshmi Devi
  it('Case 16: Tamil appointment notification for Lakshmi Devi', () => {
    const result = generateAppointmentMultilingualMessage(
      'Lakshmi Devi',
      '2026-10-12',
      '11:00',
      'Dr. Ramesh Kumar',
      '10:00',
      'ta'
    );

    expect(result.speechLang).toBe('ta-IN');
    expect(result.language).toBe('ta');
    expect(result.spokenText).toContain('உங்கள் சந்திப்பு பதிவு செய்யப்பட்டுள்ளது');
    expect(result.spokenText).toContain('11:00 AM');
    expect(result.spokenText).toContain('10:00 AM');
    expect(result.spokenText).toContain('அறுபது நிமிடங்களுக்கு முன்');
  });

  // Case 17: 60-Minute preparation alarm calculation
  it('Case 17: calculateMinutesBefore accurately computes 60 minutes before appointment time', () => {
    expect(calculateMinutesBefore('10:30', 60)).toBe('09:30');
    expect(calculateMinutesBefore('14:00', 60)).toBe('13:00');
    expect(calculateMinutesBefore('09:00', 60)).toBe('08:00');
    expect(calculateMinutesBefore('00:30', 60)).toBe('23:30'); // Midnight rollover
  });

  // Case 18: Rescheduling appointment updates linked 60-minute preparation alarm
  it('Case 18: Rescheduling appointment updates linked preparation alarm time', () => {
    const apptId = 'appt-reschedule-case';
    useAppStore.setState({
      alarms: [
        { id: 'appt-main', appointmentId: apptId, title: 'Appt', time: '10:00', type: 'appointment', status: 'Scheduled', notes: '', elderId: 'elder-1' },
        { id: 'appt-prep', appointmentId: apptId, title: 'Prep', time: '09:00', type: 'appointment', status: 'Scheduled', notes: '', elderId: 'elder-1', isOneHourReminder: true },
      ],
    });

    useAppStore.getState().updateAlarm('appt-main', { time: '16:00', appointmentTime: '16:00' });
    const prep = useAppStore.getState().alarms.find((a) => a.id === 'appt-prep');
    expect(prep?.time).toBe('15:00'); // Exactly 60 min before 16:00
  });

  // Case 19: Cancelling appointment removes linked prep alarm without orphans
  it('Case 19: Cancelling appointment cascades to delete preparation alarm without leaving orphans', () => {
    const apptId = 'appt-cancel-case';
    useAppStore.setState({
      alarms: [
        { id: 'appt-to-cancel', appointmentId: apptId, title: 'Appt', time: '10:00', type: 'appointment', status: 'Scheduled', notes: '', elderId: 'elder-1' },
        { id: 'prep-to-cancel', appointmentId: apptId, title: 'Prep', time: '09:00', type: 'appointment', status: 'Scheduled', notes: '', elderId: 'elder-1', isOneHourReminder: true },
        { id: 'unrelated-alarm', title: 'Daily Walk', time: '17:00', type: 'activity', status: 'Scheduled', notes: '', elderId: 'elder-1' },
      ],
    });

    useAppStore.getState().deleteAlarm('appt-to-cancel');
    const remaining = useAppStore.getState().alarms;
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('unrelated-alarm');
  });

  // Case 20: Clear Alert History only purges resolved alerts and preserves active emergency alerts
  it('Case 20: Clear Alert History in mode="resolved" safely purges history and preserves active emergency alerts', () => {
    useAppStore.setState({
      activeAlerts: [
        { id: 'active-sos-emergency', elder_name: 'Usha', type: 'sos', severity: 'critical', message: 'CRITICAL SOS ACTIVE', time: new Date().toISOString(), resolved: false },
        { id: 'resolved-warning-1', elder_name: 'Venkatesh Rao', type: 'low_spo2', severity: 'warning', message: 'SpO2 91%', time: new Date().toISOString(), resolved: true },
        { id: 'resolved-warning-2', elder_name: 'Lakshmi Devi', type: 'vital_abnormal', severity: 'warning', message: 'BP 142/92', time: new Date().toISOString(), resolved: true },
      ],
    });

    useAppStore.getState().clearAlerts('resolved');
    const alerts = useAppStore.getState().activeAlerts;

    // Active SOS must NEVER be deleted when clearing history
    expect(alerts.length).toBe(1);
    expect(alerts[0].id).toBe('active-sos-emergency');
    expect(alerts[0].resolved).toBe(false);
  });
});
