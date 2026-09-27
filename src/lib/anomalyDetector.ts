import { DemoElder, DemoVitals } from '@/lib/demoData';
import { useAppStore, type DemoAlert } from '@/store';
import { useGuardianStore, type GuardianAlert } from '@/store/guardianStore';
import { triggerAlert } from '@/lib/audioAlerts';
import { apiFetch } from '@/lib/api';

export type AnomalyMetric =
  | 'heart_rate'
  | 'spo2'
  | 'systolic_bp'
  | 'diastolic_bp'
  | 'breathing_rate'
  | 'stress';

export interface VitalsAnomaly {
  id: string;
  elderId: string;
  elderName: string;
  metric: AnomalyMetric;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  clinicalRecommendation: string;
  timestamp: string;
}

// Memory map for de-bouncing alerts: key = `${elderId}:${metric}` -> timestamp ms
const lastAlertTimestampMap = new Map<string, { timestamp: number; severity: 'warning' | 'critical' }>();

// Cooldown before identical warning alert can fire again (60 seconds)
export const ALERT_COOLDOWN_MS = 60 * 1000;

export function clearAnomalyCooldowns(elderId?: string) {
  if (elderId) {
    for (const key of lastAlertTimestampMap.keys()) {
      if (key.startsWith(`${elderId}:`)) {
        lastAlertTimestampMap.delete(key);
      }
    }
  } else {
    lastAlertTimestampMap.clear();
  }
}

/**
 * Pure evaluation function: checks vitals against physiological thresholds.
 */
export function detectVitalsAnomalies(
  elder: { id: string; full_name: string },
  vitals: DemoVitals,
  timestamp: string = new Date().toISOString()
): VitalsAnomaly[] {
  const anomalies: VitalsAnomaly[] = [];

  // 1. Heart Rate
  if (vitals.heart_rate > 120) {
    anomalies.push({
      id: `anomaly-hr-high-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'heart_rate',
      value: vitals.heart_rate,
      threshold: 120,
      severity: 'critical',
      title: 'Severe Tachycardia Detected',
      message: `${elder.full_name}'s Heart Rate spiked to ${vitals.heart_rate} bpm (Safe threshold: ≤ 100 bpm).`,
      clinicalRecommendation: 'Immediate 12-lead ECG indicated. Check telemetry for arrhythmia and assess beta-blocker timing.',
      timestamp,
    });
  } else if (vitals.heart_rate > 100) {
    anomalies.push({
      id: `anomaly-hr-elev-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'heart_rate',
      value: vitals.heart_rate,
      threshold: 100,
      severity: 'warning',
      title: 'Elevated Heart Rate',
      message: `${elder.full_name}'s Heart Rate elevated to ${vitals.heart_rate} bpm.`,
      clinicalRecommendation: 'Monitor resting pulse, verify hydration, and check for physical exertion or stress triggers.',
      timestamp,
    });
  } else if (vitals.heart_rate < 48) {
    anomalies.push({
      id: `anomaly-hr-low-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'heart_rate',
      value: vitals.heart_rate,
      threshold: 48,
      severity: 'critical',
      title: 'Severe Bradycardia Detected',
      message: `${elder.full_name}'s Heart Rate dropped dangerously low to ${vitals.heart_rate} bpm (Critical threshold: < 50 bpm).`,
      clinicalRecommendation: 'Check consciousness and perfusion immediately. Review antiarrhythmic / digoxin / beta-blocker dosing.',
      timestamp,
    });
  } else if (vitals.heart_rate < 55) {
    anomalies.push({
      id: `anomaly-hr-brady-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'heart_rate',
      value: vitals.heart_rate,
      threshold: 55,
      severity: 'warning',
      title: 'Low Heart Rate (Bradycardia)',
      message: `${elder.full_name}'s Heart Rate decreased to ${vitals.heart_rate} bpm.`,
      clinicalRecommendation: 'Observe for lightheadedness or fatigue. Maintain continuous watch telemetry.',
      timestamp,
    });
  }

  // 2. Oxygen Saturation (SpO2)
  if (vitals.spo2 < 90) {
    anomalies.push({
      id: `anomaly-spo2-crit-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'spo2',
      value: vitals.spo2,
      threshold: 90,
      severity: 'critical',
      title: 'Acute Hypoxemia Detected',
      message: `${elder.full_name}'s Oxygen Saturation plummeted to ${vitals.spo2}% (Normal: 95–99%).`,
      clinicalRecommendation: 'Verify watch probe placement. Prepare supplemental O2 if symptomatic and alert on-call doctor immediately.',
      timestamp,
    });
  } else if (vitals.spo2 < 93) {
    anomalies.push({
      id: `anomaly-spo2-warn-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'spo2',
      value: vitals.spo2,
      threshold: 93,
      severity: 'warning',
      title: 'Suboptimal SpO₂ Saturation',
      message: `${elder.full_name}'s Oxygen Saturation dropped to ${vitals.spo2}%.`,
      clinicalRecommendation: 'Encourage deep breathing exercises and reposition patient upright. Monitor respiratory rate.',
      timestamp,
    });
  }

  // 3. Blood Pressure (Systolic & Diastolic)
  if (vitals.systolic_bp >= 160 || vitals.diastolic_bp >= 100) {
    anomalies.push({
      id: `anomaly-bp-crisis-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: vitals.systolic_bp >= 160 ? 'systolic_bp' : 'diastolic_bp',
      value: vitals.systolic_bp,
      threshold: 160,
      severity: 'critical',
      title: 'Hypertensive Urgency',
      message: `${elder.full_name}'s Blood Pressure spiked to ${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg.`,
      clinicalRecommendation: 'Repeat measurement in 5 minutes after quiet rest. Verify antihypertensive adherence (e.g. Amlodipine).',
      timestamp,
    });
  } else if (vitals.systolic_bp >= 140 || vitals.diastolic_bp >= 90) {
    anomalies.push({
      id: `anomaly-bp-elev-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'systolic_bp',
      value: vitals.systolic_bp,
      threshold: 140,
      severity: 'warning',
      title: 'Elevated Blood Pressure',
      message: `${elder.full_name}'s BP reached ${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg.`,
      clinicalRecommendation: 'Log reading, ensure quiet environment, and check salt intake or missed morning medications.',
      timestamp,
    });
  } else if (vitals.systolic_bp < 90 || vitals.diastolic_bp < 60) {
    anomalies.push({
      id: `anomaly-bp-low-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'systolic_bp',
      value: vitals.systolic_bp,
      threshold: 90,
      severity: 'warning',
      title: 'Hypotension Detected',
      message: `${elder.full_name}'s BP dropped to ${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg.`,
      clinicalRecommendation: 'Check hydration and posture. Ensure patient is seated to prevent orthostatic dizziness or falls.',
      timestamp,
    });
  }

  // 4. Breathing Rate
  if (vitals.breathing_rate > 26) {
    anomalies.push({
      id: `anomaly-resp-high-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'breathing_rate',
      value: vitals.breathing_rate,
      threshold: 26,
      severity: 'critical',
      title: 'Tachypnea / Respiratory Distress',
      message: `${elder.full_name}'s Breathing Rate increased to ${vitals.breathing_rate} brpm.`,
      clinicalRecommendation: 'Assess airway patency and lung sounds. Correlate with oxygen saturation levels.',
      timestamp,
    });
  }

  // 5. Stress Index
  if (vitals.stress > 80) {
    anomalies.push({
      id: `anomaly-stress-crit-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'stress',
      value: vitals.stress,
      threshold: 80,
      severity: 'warning',
      title: 'Acute Agitation / Stress Surge',
      message: `${elder.full_name}'s biometric stress index spiked to ${vitals.stress}/100.`,
      clinicalRecommendation: 'Caregiver check-in recommended. Review recent environmental disturbances or acute pain.',
      timestamp,
    });
  }

  return anomalies;
}

/**
 * Checks de-bounce cooldowns and dispatches alerts to AppStore, GuardianStore, and Audio.
 */
export function processVitalsTickWithAlerts(
  elder: { id: string; full_name: string },
  vitals: DemoVitals,
  options?: { force?: boolean }
): VitalsAnomaly[] {
  const anomalies = detectVitalsAnomalies(elder, vitals);
  const now = Date.now();
  const dispatched: VitalsAnomaly[] = [];

  for (const anomaly of anomalies) {
    const key = `${elder.id}:${anomaly.metric}`;
    const previous = lastAlertTimestampMap.get(key);

    const shouldDispatch =
      options?.force ||
      !previous ||
      now - previous.timestamp > ALERT_COOLDOWN_MS ||
      (previous.severity === 'warning' && anomaly.severity === 'critical');

    if (!shouldDispatch) {
      continue;
    }

    lastAlertTimestampMap.set(key, { timestamp: now, severity: anomaly.severity });
    dispatched.push(anomaly);

    // 1. Dispatch to useAppStore (for Doctor Portal, Caretaker Dashboard, and Patient Detail)
    try {
      const alertType: DemoAlert['type'] =
        anomaly.metric === 'heart_rate' ? 'high_hr' :
        anomaly.metric === 'spo2' ? 'low_spo2' :
        'high_hr';

      const appAlert: DemoAlert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        elder_id: elder.id,
        elder_name: elder.full_name,
        type: alertType,
        severity: anomaly.severity,
        message: `${anomaly.title}: ${anomaly.message}`,
        time: anomaly.timestamp,
        resolved: false,
      };
      useAppStore.getState().addAlert(appAlert);

      // Persist to server backend (writes to data/db.json)
      apiFetch('/alerts', {
        method: 'POST',
        body: JSON.stringify({
          id: appAlert.id,
          elder_id: elder.id,
          elder_name: elder.full_name,
          type: appAlert.type,
          severity: anomaly.severity,
          message: `${anomaly.title}: ${anomaly.message}`,
          time: anomaly.timestamp,
          resolved: false,
        }),
      }).catch((err) => {
        console.warn('Backend alert persistence skipped/failed:', err);
      });
    } catch (e) {
      console.warn('Failed to add app alert:', e);
    }

    // 2. Dispatch to useGuardianStore (for Guardian Portal)
    try {
      const guardianAlert: GuardianAlert = {
        id: `ga-vital-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: 'vital_abnormal',
        severity: anomaly.severity,
        message: `⚠️ Vital Alert: ${anomaly.message} Dr. Ramesh Kumar and caretaker have been notified.`,
        time: anomaly.timestamp,
        acknowledged: false,
        elderName: elder.full_name,
      };
      useGuardianStore.getState().addGuardianAlert(guardianAlert);
    } catch (e) {
      console.warn('Failed to add guardian alert:', e);
    }

    // 3. Audio & Haptic Alarm
    try {
      triggerAlert(anomaly.severity === 'critical' ? 'vital' : 'notification');
    } catch {}
  }

  return dispatched;
}
