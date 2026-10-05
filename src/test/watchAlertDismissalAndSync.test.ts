vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(() => Promise.resolve(null)), getStoredToken: () => null, getStoredUser: () => null }));
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { getElderBaseline, simulateNextVitals } from '@/lib/vitalsSimulator';
import { detectVitalsAnomalies } from '@/lib/anomalyDetector';
import { DEMO_ELDERS } from '@/lib/demoData';

describe('Watch Simulator Alert Acknowledgment & Normalization', () => {
  const venkatesh = DEMO_ELDERS.find((e) => e.id === 'elder-3')!;

  beforeEach(() => {
    window.localStorage.removeItem('gcare_episode_lifecycle');
    useAppStore.setState({ activeAlerts: [] });
    useGuardianStore.setState({ alerts: [] });
  });

  it('Venkatesh Rao baseline vitals do not trigger spurious SpO2 warnings on normal ticks', () => {
    const baseline = getElderBaseline(venkatesh);
    expect(baseline.spo2).toBeGreaterThanOrEqual(95.0);

    const anomalies = detectVitalsAnomalies(venkatesh, baseline);
    expect(anomalies).toEqual([]);

    // Over multiple ticks within realistic bounds, no anomaly should fire
    let vitals = baseline;
    for (let i = 0; i < 20; i++) {
      vitals = simulateNextVitals(vitals, baseline, venkatesh);
      const tickAnomalies = detectVitalsAnomalies(venkatesh, vitals);
      expect(tickAnomalies).toEqual([]);
    }
  });

  it('resolving an alert silences its episode without inventing recovered vitals', () => {
    // 1. Simulate anomaly
    useAppStore.getState().injectVitalsAnomaly(venkatesh.id, { heart_rate: 135, spo2: 89 });
    const abnormalVitals = useAppStore.getState().demoVitals[venkatesh.id];
    expect(abnormalVitals.heart_rate).toBe(135);

    // 2. Add alert
    const alertId = useAppStore.getState().activeAlerts.find(a => a.type === 'high_hr')!.id;
    useAppStore.getState().addAlert({
      id: alertId,
      elder_id: venkatesh.id,
      elder_name: venkatesh.full_name,
      type: 'high_hr',
      severity: 'critical',
      message: 'Critical heart rate spike',
      time: new Date().toISOString(),
      resolved: false,
    });

    useGuardianStore.getState().addGuardianAlert({
      id: alertId,
      elderId: venkatesh.id,
      elderName: venkatesh.full_name,
      type: 'vital_abnormal',
      severity: 'critical',
      message: 'Critical heart rate spike',
      time: new Date().toISOString(),
      acknowledged: false,
    });

    expect(useAppStore.getState().activeAlerts.find((a) => a.id === alertId)?.resolved).toBe(false);

    // 3. Resolve alert (simulating Doctor or Caretaker clicking Acknowledge)
    useAppStore.getState().resolveAlert(alertId);

    // 4. Verify resolution
    expect(useAppStore.getState().activeAlerts.find((a) => a.id === alertId)?.resolved).toBe(true);

    // Acknowledgement is not physiological recovery.
    const restoredVitals = useAppStore.getState().demoVitals[venkatesh.id];
    expect(restoredVitals.heart_rate).toBe(135);
    expect(restoredVitals.spo2).toBe(89);

    const clearedAnomalies = detectVitalsAnomalies(venkatesh, restoredVitals);
    expect(clearedAnomalies.length).toBeGreaterThan(0);
    expect(useAppStore.getState().activeAlerts.find(a => a.type === 'low_spo2')?.resolved).toBe(false);
  });

  it('initial seed alerts reflect appointment booked and resolved', () => {
    const initialAlerts = useAppStore.getState().activeAlerts;
    const initialGuardianAlerts = useGuardianStore.getState().alerts;

    // Any seeded alerts should be resolved or marked safe
    initialAlerts.forEach((alert) => {
      if (alert.type === 'appointment') {
        expect(alert.resolved).toBe(true);
      }
    });

    initialGuardianAlerts.forEach((alert) => {
      expect(alert.acknowledged).toBe(true);
    });
  });

  it('calculateMinutesBefore correctly calculates 60 minutes prior to appointment', async () => {
    const { calculateMinutesBefore } = await import('@/lib/syncChannel');

    expect(calculateMinutesBefore('10:00', 60)).toBe('09:00');
    expect(calculateMinutesBefore('11:30', 60)).toBe('10:30');
    expect(calculateMinutesBefore('09:15', 60)).toBe('08:15');
    // Midnight rollover
    expect(calculateMinutesBefore('00:45', 60)).toBe('23:45');
    expect(calculateMinutesBefore('00:00', 60)).toBe('23:00');
  });

  it('generateAppointmentKannadaMessage generates natural Kannada text with 60-min preparation alarm note', async () => {
    const { generateAppointmentKannadaMessage } = await import('@/lib/syncChannel');

    const result = generateAppointmentKannadaMessage(
      'Usha',
      '2026-10-06',
      '10:00',
      'Dr. Ramesh Kumar',
      '09:00'
    );

    // Spoken Kannada contains key appointment parameters
    expect(result.spokenText).toContain('ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ನಿಗದಿಯಾಗಿದೆ');
    expect(result.spokenText).toContain('2026');
    expect(result.spokenText).toContain('10:00');
    expect(result.spokenText).toContain('Dr. Ramesh Kumar');
    expect(result.spokenText).toContain('9:00');
    expect(result.spokenText).toContain('ಅರವತ್ತು ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ');

    // Display text contains preparation alarm
    expect(result.displayText).toContain('9:00');
    expect(result.displayText).toContain('60 ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ');
    expect(result.prepNotes).toContain('60 ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ');
  });

  it('broadcastGcareMessage and subscribeToGcareBroadcast handle APPOINTMENT_SCHEDULED cross-window payload', async () => {
    const { broadcastGcareMessage, subscribeToGcareBroadcast } = await import('@/lib/syncChannel');

    let receivedMsg: any = null;
    const unsubscribe = subscribeToGcareBroadcast((msg) => {
      receivedMsg = msg;
    });

    const testPayload = {
      type: 'APPOINTMENT_SCHEDULED' as const,
      elderId: 'elder-1',
      elderName: 'Usha',
      language: 'kn',
      date: '2026-10-06',
      time: '10:00',
      prepAlarmTime: '09:00',
      doctorName: 'Dr. Ramesh Kumar',
      kannadaMessage: 'ಉಷಾ ಅವರೇ, ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ನಿಗದಿಯಾಗಿದೆ.',
      englishMessage: 'Appointment booked for 10:00. Preparation alarm at 09:00.',
      timestamp: Date.now(),
    };

    broadcastGcareMessage(testPayload);

    expect(receivedMsg).not.toBeNull();
    expect(receivedMsg?.type).toBe('APPOINTMENT_SCHEDULED');
    expect(receivedMsg?.elderId).toBe('elder-1');
    expect(receivedMsg?.prepAlarmTime).toBe('09:00');
    expect(receivedMsg?.kannadaMessage).toContain('ಉಷಾ');

    unsubscribe();
  });

  it('Usha SOS alert flow: SOS triggers critical state, doctor appointment stabilizes vitals and registers 60-min prior alarm', async () => {
    const { calculateMinutesBefore, generateAppointmentKannadaMessage } = await import('@/lib/syncChannel');
    const usha = DEMO_ELDERS.find((e) => e.id === 'elder-1')!;

    // 1. Usha triggers SOS in Watch Simulator
    useAppStore.getState().injectVitalsAnomaly(usha.id, {
      panic_detected: true,
      heart_rate: 128,
      spo2: 89,
      stress: 95,
    });

    const sosAlertId = 'sos-usha-test';
    useAppStore.getState().addAlert({
      id: sosAlertId,
      elder_id: usha.id,
      elder_name: usha.full_name,
      type: 'sos',
      severity: 'critical',
      message: '🚨 EMERGENCY SOS — Usha pressed SOS button!',
      location: 'Sadashivanagar, Bangalore',
      time: new Date().toISOString(),
      resolved: false,
    });

    // Verify critical alert is active
    const activeSos = useAppStore.getState().activeAlerts.find((a) => a.id === sosAlertId);
    expect(activeSos).toBeDefined();
    expect(activeSos?.resolved).toBe(false);

    // 2. Doctor schedules appointment for 10:00 AM based on free scheduler
    const apptTime = '10:00';
    const apptDate = '2026-10-06';
    const prepAlarmTime = calculateMinutesBefore(apptTime, 60);
    expect(prepAlarmTime).toBe('09:00');

    // Register prep alarm (60 min prior) and main appointment alarm
    useAppStore.getState().addAlarm({
      id: 'alarm-prep-test',
      elderId: usha.id,
      title: 'ಆಸ್ಪತ್ರೆ ತಪಾಸಣೆ ತಯಾರಿ (Hospital Checkup Preparation)',
      time: prepAlarmTime,
      type: 'appointment',
      status: 'Scheduled',
      notes: 'Checkup at 10:00 with Dr. Ramesh Kumar. Leave early.',
    });

    useAppStore.getState().addAlarm({
      id: 'alarm-appt-test',
      elderId: usha.id,
      title: 'Appointment with Dr. Ramesh Kumar',
      time: apptTime,
      type: 'appointment',
      status: 'Scheduled',
      notes: 'Consultation with Dr. Ramesh Kumar.',
    });

    // Doctor resolves the alert
    useAppStore.getState().resolveAlert(sosAlertId);
    useAppStore.getState().stabilizeElderVitals(usha.id);

    // 3. Verify alert resolved and vitals normalized
    expect(useAppStore.getState().activeAlerts.find((a) => a.id === sosAlertId)?.resolved).toBe(true);
    const restoredVitals = useAppStore.getState().demoVitals[usha.id];
    expect(restoredVitals.panic_detected).toBe(false);
    expect(restoredVitals.heart_rate).toBeLessThan(95);

    // 4. Verify the 60-min-prior prep alarm exists in store
    const alarms = useAppStore.getState().alarms;
    const prepAlarm = alarms.find((a) => a.id === 'alarm-prep-test');
    expect(prepAlarm).toBeDefined();
    expect(prepAlarm?.time).toBe('09:00');
  });

  it('supports clearing resolved alerts and all alerts in useAppStore', () => {
    // Seed alerts
    useAppStore.getState().setActiveAlerts([
      { id: 'alert-clear-1', elder_name: 'Usha', type: 'high_hr', severity: 'critical', message: 'Test 1', time: new Date().toISOString(), resolved: false },
      { id: 'alert-clear-2', elder_name: 'Lakshmi', type: 'high_hr', severity: 'warning', message: 'Test 2', time: new Date().toISOString(), resolved: true },
      { id: 'alert-clear-3', elder_name: 'Venkatesh', type: 'low_spo2', severity: 'warning', message: 'Test 3', time: new Date().toISOString(), resolved: true },
    ]);

    expect(useAppStore.getState().activeAlerts.length).toBe(3);

    // Clear only resolved
    useAppStore.getState().clearAlerts('resolved');
    expect(useAppStore.getState().activeAlerts.length).toBe(1);
    expect(useAppStore.getState().activeAlerts[0].id).toBe('alert-clear-1');

    // Remove single alert
    useAppStore.getState().removeAlert('alert-clear-1');
    expect(useAppStore.getState().activeAlerts.length).toBe(0);

    // Re-seed and clear all
    useAppStore.getState().setActiveAlerts([
      { id: 'alert-clear-4', elder_name: 'Usha', type: 'high_hr', severity: 'critical', message: 'Test 4', time: new Date().toISOString(), resolved: false },
    ]);
    useAppStore.getState().clearAlerts('all');
    expect(useAppStore.getState().activeAlerts.length).toBe(0);
  });

  it('supports clearing resolved and all alerts in useGuardianStore', () => {
    useGuardianStore.setState({
      alerts: [
        { id: 'ga-clear-1', type: 'vital_abnormal', severity: 'warning', message: 'G1', time: new Date().toISOString(), acknowledged: false, elderName: 'Usha' },
        { id: 'ga-clear-2', type: 'vital_abnormal', severity: 'info', message: 'G2', time: new Date().toISOString(), acknowledged: true, elderName: 'Usha' },
      ],
    });

    expect(useGuardianStore.getState().alerts.length).toBe(2);

    // Clear resolved
    useGuardianStore.getState().clearAlerts('resolved');
    expect(useGuardianStore.getState().alerts.length).toBe(1);
    expect(useGuardianStore.getState().alerts[0].id).toBe('ga-clear-1');

    // Remove single
    useGuardianStore.getState().removeAlert('ga-clear-1');
    expect(useGuardianStore.getState().alerts.length).toBe(0);
  });

  it('generateAppointmentMultilingualMessage supports Hindi, Tamil, and English with correct speech codes', async () => {
    const { generateAppointmentMultilingualMessage } = await import('@/lib/syncChannel');

    // Hindi for Venkatesh Rao
    const hiResult = generateAppointmentMultilingualMessage(
      'Venkatesh Rao',
      '2026-10-15',
      '14:00',
      'Dr. Ramesh Kumar',
      '13:00',
      'hi'
    );
    expect(hiResult.speechLang).toBe('hi-IN');
    expect(hiResult.language).toBe('hi');
    expect(hiResult.spokenText).toContain('आपका अपॉइंटमेंट तय हो गया है');
    expect(hiResult.spokenText).toContain('Venkatesh Rao');
    expect(hiResult.spokenText).toContain('साठ मिनट पहले');
    expect(hiResult.displayText).toContain('अस्पताल तैयारी अलार्म: 1:00 PM');

    // Tamil for Lakshmi Devi
    const taResult = generateAppointmentMultilingualMessage(
      'Lakshmi Devi',
      '2026-10-20',
      '11:30',
      'Dr. Ramesh Kumar',
      '10:30',
      'ta'
    );
    expect(taResult.speechLang).toBe('ta-IN');
    expect(taResult.language).toBe('ta');
    expect(taResult.spokenText).toContain('உங்கள் சந்திப்பு பதிவு செய்யப்பட்டுள்ளது');
    expect(taResult.spokenText).toContain('Lakshmi Devi');
    expect(taResult.displayText).toContain('10:30 AM');

    // English fallback
    const enResult = generateAppointmentMultilingualMessage(
      'Usha',
      '2026-10-22',
      '16:00',
      'Dr. Ramesh Kumar',
      '15:00',
      'en'
    );
    expect(enResult.speechLang).toBe('en-IN');
    expect(enResult.language).toBe('en');
    expect(enResult.spokenText).toContain('your appointment has been booked');
    expect(enResult.spokenText).toContain('sixty minutes');
  });

  it('detects critical hypotension when systolic BP drops below 85 mmHg', async () => {
    const { detectVitalsAnomalies } = await import('@/lib/anomalyDetector');
    const elder = { id: 'elder-1', full_name: 'Usha' };
    const lowBpVitals = {
      heart_rate: 72,
      systolic_bp: 78,
      diastolic_bp: 48,
      spo2: 97.4,
      stress: 34,
      hydration: 72,
      breathing_rate: 16,
      skin_temp: 36.5,
      shiver_detected: false,
      panic_detected: false,
      fall_detected: false,
      motion_state: 'sitting' as const,
    };

    const anomalies = detectVitalsAnomalies(elder, lowBpVitals);
    expect(anomalies.length).toBeGreaterThan(0);
    const critBp = anomalies.find(a => a.metric === 'systolic_bp');
    expect(critBp).toBeDefined();
    expect(critBp?.severity).toBe('critical');
    expect(critBp?.title).toContain('Severe Hypotension');
  });

  it('cascading alarm update updates linked 60-minute preparation alarm', () => {
    const apptId = 'appt-cascade-test';
    useAppStore.setState({
      alarms: [
        {
          id: 'alarm-main-1',
          appointmentId: apptId,
          title: 'Doctor Appointment',
          time: '10:00',
          type: 'appointment',
          status: 'Scheduled',
          notes: 'Main appointment',
          elderId: 'elder-1',
          appointmentTime: '10:00',
          appointmentDate: '2026-10-10',
        },
        {
          id: 'alarm-prep-1',
          appointmentId: apptId,
          title: 'Hospital Preparation Alarm',
          time: '09:00',
          type: 'appointment',
          status: 'Scheduled',
          notes: '60 min prior alarm',
          elderId: 'elder-1',
          isOneHourReminder: true,
          appointmentTime: '10:00',
          appointmentDate: '2026-10-10',
        },
      ],
    });

    // Reschedule appointment to 11:30
    useAppStore.getState().updateAlarm('alarm-main-1', {
      time: '11:30',
      appointmentTime: '11:30',
      appointmentDate: '2026-10-11',
    });

    const updatedAlarms = useAppStore.getState().alarms;
    const prepAlarm = updatedAlarms.find(a => a.id === 'alarm-prep-1');
    expect(prepAlarm).toBeDefined();
    expect(prepAlarm?.time).toBe('10:30'); // Exactly 60 min before 11:30!
    expect(prepAlarm?.appointmentTime).toBe('11:30');
    expect(prepAlarm?.appointmentDate).toBe('2026-10-11');
  });

  it('cascading alarm deletion removes linked preparation alarm without orphans', () => {
    const apptId = 'appt-delete-test';
    useAppStore.setState({
      alarms: [
        {
          id: 'alarm-main-del',
          appointmentId: apptId,
          title: 'Doctor Appointment',
          time: '10:00',
          type: 'appointment',
          status: 'Scheduled',
          notes: 'Main appointment',
          elderId: 'elder-1',
        },
        {
          id: 'alarm-prep-del',
          appointmentId: apptId,
          title: 'Preparation Alarm',
          time: '09:00',
          type: 'appointment',
          status: 'Scheduled',
          notes: '60 min prior alarm',
          elderId: 'elder-1',
          isOneHourReminder: true,
        },
        {
          id: 'alarm-other-med',
          title: 'Regular Medicine',
          time: '08:00',
          type: 'medication',
          status: 'Scheduled',
          notes: 'Unrelated medication',
          elderId: 'elder-1',
        },
      ],
    });

    // Delete the main appointment
    useAppStore.getState().deleteAlarm('alarm-main-del');

    const remainingAlarms = useAppStore.getState().alarms;
    // Both main and prep should be gone, unrelated alarm preserved
    expect(remainingAlarms.some(a => a.id === 'alarm-main-del')).toBe(false);
    expect(remainingAlarms.some(a => a.id === 'alarm-prep-del')).toBe(false);
    expect(remainingAlarms.some(a => a.id === 'alarm-other-med')).toBe(true);
    expect(remainingAlarms.length).toBe(1);
  });
});

