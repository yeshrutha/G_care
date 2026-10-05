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

interface ConditionEpisode {
  inEpisode: boolean;
  hasReturnedToSafe: boolean;
  lastAlertId?: string;
  lastDispatchedTime: number;
  lastSeverity: 'warning' | 'critical';
}

// Memory map for tracking condition episodes per elder: key = `${elderId}:${metric}`
const conditionEpisodeMap = new Map<string, ConditionEpisode>();

// Global cooldown buffer before a new episode can trigger if rapidly oscillating (5 minutes)
export const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

export function clearAnomalyCooldowns(elderId?: string) {
  if (elderId) {
    for (const key of conditionEpisodeMap.keys()) {
      if (key.startsWith(`${elderId}:`)) {
        const episode = conditionEpisodeMap.get(key);
        if (episode) {
          episode.inEpisode = false;
          episode.hasReturnedToSafe = true;
        }
      }
    }
  } else {
    for (const episode of conditionEpisodeMap.values()) {
      episode.inEpisode = false;
      episode.hasReturnedToSafe = true;
    }
  }
}

/**
 * Checks whether a patient's vital metric has fully returned to the healthy safe zone (hysteresis recovery).
 */
export function isConditionInSafeRange(metric: AnomalyMetric, vitals: DemoVitals): boolean {
  switch (metric) {
    case 'heart_rate':
      return vitals.heart_rate >= 60 && vitals.heart_rate <= 95;
    case 'spo2':
      return vitals.spo2 >= 95.0;
    case 'systolic_bp':
    case 'diastolic_bp':
      return vitals.systolic_bp >= 96 && vitals.systolic_bp <= 134 && vitals.diastolic_bp >= 65 && vitals.diastolic_bp <= 84;
    case 'breathing_rate':
      return vitals.breathing_rate >= 12 && vitals.breathing_rate <= 22;
    case 'stress':
      return vitals.stress <= 65;
    default:
      return true;
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
      message: `${elder.full_name}'s Heart Rate spiked dangerously to ${vitals.heart_rate} bpm (Safe threshold: ≤ 100 bpm).`,
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
  } else if (vitals.systolic_bp < 85 || vitals.diastolic_bp < 55) {
    // Critical Hypotension / Shock Risk
    anomalies.push({
      id: `anomaly-bp-crit-low-${elder.id}-${Date.now()}`,
      elderId: elder.id,
      elderName: elder.full_name,
      metric: 'systolic_bp',
      value: vitals.systolic_bp,
      threshold: 85,
      severity: 'critical',
      title: 'Severe Hypotension Detected',
      message: `${elder.full_name}'s Blood Pressure dropped critically low to ${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg (Shock/emergency risk).`,
      clinicalRecommendation: 'Immediate attention required. Elevate legs, check hydration and perfusion, and alert attending physician.',
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
 * Checks de-bounce cooldowns, episode hysteresis, and dispatches alerts to AppStore, GuardianStore, and Audio.
 */
export function processVitalsTickWithAlerts(
  elder: { id: string; full_name: string },
  vitals: DemoVitals,
  options?: { force?: boolean }
): VitalsAnomaly[] {
  const anomalies = detectVitalsAnomalies(elder, vitals);
  const now = Date.now();
  const dispatched: VitalsAnomaly[] = [];

  // 1. Check for conditions that have safely recovered to their healthy baseline
  const allMetrics: AnomalyMetric[] = ['heart_rate', 'spo2', 'systolic_bp', 'breathing_rate', 'stress'];
  for (const metric of allMetrics) {
    if (isConditionInSafeRange(metric, vitals)) {
      const key = `${elder.id}:${metric}`;
      const ep = conditionEpisodeMap.get(key);
      if (ep) {
        ep.inEpisode = false;
        ep.hasReturnedToSafe = true;
      }
    }
  }

  // 2. Process detected anomalies
  for (const anomaly of anomalies) {
    const key = `${elder.id}:${anomaly.metric}`;
    let episode = conditionEpisodeMap.get(key);
    if (!episode) {
      episode = {
        inEpisode: false,
        hasReturnedToSafe: true,
        lastDispatchedTime: 0,
        lastSeverity: 'warning',
      };
      conditionEpisodeMap.set(key, episode);
    }

    const alertType: DemoAlert['type'] =
      anomaly.metric === 'heart_rate' ? 'high_hr' :
      anomaly.metric === 'spo2' ? 'low_spo2' :
      anomaly.severity === 'critical' ? 'sos' : 'vital_abnormal';

    // Check if an unresolved alert for this elder and condition already exists
    const currentAppAlerts = useAppStore.getState().activeAlerts;
    const hasExistingUnresolved = currentAppAlerts.some(
      (a) =>
        !a.resolved &&
        (a.elder_id === elder.id || a.elder_name?.trim().toLowerCase() === elder.full_name?.trim().toLowerCase()) &&
        (a.type === alertType ||
          a.message?.toLowerCase().includes(anomaly.title.toLowerCase()) ||
          a.message?.toLowerCase().includes(anomaly.metric.toLowerCase()))
    );

    // Escalation check: warning -> critical
    const isEscalationToCritical =
      episode.lastSeverity === 'warning' &&
      anomaly.severity === 'critical' &&
      now - episode.lastDispatchedTime > 15000;

    // Decision rule:
    // Dispatches IF:
    // 1. Forced by manual test trigger (options?.force)
    // 2. OR: Condition escalated to critical
    // 3. OR: No unresolved alert exists AND patient had returned to safe range AND not currently in an active episode
    let shouldDispatch = false;

    if (options?.force) {
      shouldDispatch = true;
    } else if (hasExistingUnresolved) {
      // Patient still has an ongoing unacknowledged alert.
      // Do NOT create another alert unless it escalated from warning to critical.
      shouldDispatch = isEscalationToCritical;
    } else {
      // Previous alert has been acknowledged/resolved!
      // Only dispatch if the patient had returned to safe baseline before this new abnormal episode.
      if (!episode.inEpisode && episode.hasReturnedToSafe) {
        shouldDispatch = true;
      } else if (isEscalationToCritical) {
        shouldDispatch = true;
      }
    }

    if (!shouldDispatch) {
      continue;
    }

    // Update episode state
    episode.inEpisode = true;
    episode.hasReturnedToSafe = false;
    episode.lastDispatchedTime = now;
    episode.lastSeverity = anomaly.severity;

    dispatched.push(anomaly);

    // 1. Dispatch to useAppStore (for Doctor Portal, Caretaker Dashboard, and Patient Detail)
    try {
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
      episode.lastAlertId = appAlert.id;
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
        console.warn('Backend alert persistence notice:', err);
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
        elderId: elder.id,
      };
      useGuardianStore.getState().addGuardianAlert(guardianAlert);
    } catch (e) {
      console.warn('Failed to add guardian alert:', e);
    }

    // 3. Audio & Haptic Alarm
    // Sound alarm if the user currently has this patient's watch simulator open
    try {
      const activeWatchElderId = useAppStore.getState().activeWatchElderId;
      if (activeWatchElderId && elder.id === activeWatchElderId) {
        triggerAlert(anomaly.severity === 'critical' ? 'vital' : 'notification');
      }
    } catch {}
  }

  return dispatched;
}
