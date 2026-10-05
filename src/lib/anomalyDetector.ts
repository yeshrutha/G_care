import { DemoElder, DemoVitals } from '@/lib/demoData';
import { useAppStore, type DemoAlert } from '@/store';
import { useGuardianStore, type GuardianAlert } from '@/store/guardianStore';
import { triggerAlert } from '@/lib/audioAlerts';
import { apiFetch } from '@/lib/api';
import { broadcastGcareMessage } from '@/lib/syncChannel';

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

export type CanonicalAnomalyType =
  | 'LOW_SPO2'
  | 'HIGH_SPO2'
  | 'HIGH_BP'
  | 'LOW_BP'
  | 'HIGH_HEART_RATE'
  | 'LOW_HEART_RATE'
  | 'HIGH_TEMPERATURE'
  | 'LOW_TEMPERATURE'
  | 'SOS'
  | 'FALL'
  | 'GEOFENCE'
  | 'MISSED_MED'
  | 'VITAL_ABNORMAL';

/**
 * Maps any alert or anomaly object to its canonical anomaly type.
 */
export function getCanonicalAnomalyType(alert: {
  type?: string;
  message?: string;
  metric?: string;
  title?: string;
}): CanonicalAnomalyType {
  const t = (alert.type || '').toUpperCase();
  const m = `${alert.message || ''} ${alert.title || ''}`.toUpperCase();
  const metric = (alert.metric || '').toUpperCase();

  if (t === 'LOW_SPO2' || metric === 'SPO2' || m.includes('SPO2') || m.includes('OXYGEN') || m.includes('HYPOXEMIA')) {
    return 'LOW_SPO2';
  }
  if (t === 'HIGH_BP' || (metric.includes('BP') && (m.includes('SPIKE') || m.includes('ELEVATED') || m.includes('HYPERTENSIVE') || m.includes('CRISIS')))) {
    return 'HIGH_BP';
  }
  if (t === 'LOW_BP' || (metric.includes('BP') && (m.includes('DROPPED') || m.includes('HYPOTENSION') || m.includes('SHOCK')))) {
    return 'LOW_BP';
  }
  if (t === 'HIGH_HR' || t === 'HIGH_HEART_RATE' || (metric === 'HEART_RATE' && (m.includes('TACHYCARDIA') || m.includes('SURGE') || m.includes('ELEVATED')))) {
    return 'HIGH_HEART_RATE';
  }
  if (t === 'LOW_HR' || t === 'LOW_HEART_RATE' || (metric === 'HEART_RATE' && (m.includes('BRADYCARDIA') || m.includes('DECREASED')))) {
    return 'LOW_HEART_RATE';
  }
  if (t === 'HIGH_TEMPERATURE' || t === 'HIGH_TEMP' || m.includes('FEVER') || m.includes('HYPERTHERMIA')) {
    return 'HIGH_TEMPERATURE';
  }
  if (t === 'LOW_TEMPERATURE' || t === 'LOW_TEMP' || m.includes('HYPOTHERMIA')) {
    return 'LOW_TEMPERATURE';
  }
  if (t === 'SOS' || m.includes('SOS')) {
    return 'SOS';
  }
  if (t === 'FALL' || m.includes('FALL')) {
    return 'FALL';
  }
  if (t === 'GEOFENCE' || m.includes('GEOFENCE')) {
    return 'GEOFENCE';
  }
  if (t === 'MISSED_MED' || m.includes('MEDICINE') || m.includes('MEDICATION')) {
    return 'MISSED_MED';
  }
  return 'VITAL_ABNORMAL';
}

/**
 * Returns a stable episode identity key: `${elderId}:${anomalyType}`.
 * For example: "elder-3:LOW_SPO2" or "elder-2:HIGH_BP".
 */
export function getAlertEpisodeKey(alert: {
  elder_id?: string;
  elderId?: string;
  elder_name?: string;
  elderName?: string;
  type?: string;
  message?: string;
  metric?: string;
  title?: string;
}): string {
  const elderIdentifier = (
    alert.elder_id ||
    alert.elderId ||
    alert.elder_name ||
    alert.elderName ||
    'unknown'
  ).trim().toLowerCase();
  const anomalyType = getCanonicalAnomalyType(alert);
  return `${elderIdentifier}:${anomalyType}`;
}

export type EpisodeLifecycleStatus =
  | 'NORMAL'
  | 'ACTIVE_ALERT'
  | 'ACKNOWLEDGED_AWAITING_RECOVERY';

export interface ConditionEpisodeRecord {
  episodeKey: string;
  elderId: string;
  anomalyType: CanonicalAnomalyType;
  status: EpisodeLifecycleStatus;
  activeAlertId?: string;
  lastDispatchedTime: number;
  lastSeverity: 'warning' | 'critical';
  lastTelemetryValue?: number;
}

const EPISODE_STORAGE_KEY = 'gcare_episode_lifecycle';

export function loadEpisodeRecords(): Map<string, ConditionEpisodeRecord> {
  const map = new Map<string, ConditionEpisodeRecord>();
  if (typeof window === 'undefined' || !window.localStorage) return map;
  try {
    const raw = window.localStorage.getItem(EPISODE_STORAGE_KEY);
    if (!raw) return map;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      arr.forEach((rec) => {
        if (rec && rec.episodeKey) map.set(rec.episodeKey, rec);
      });
    }
  } catch {}
  return map;
}

export function saveEpisodeRecords(map: Map<string, ConditionEpisodeRecord>) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const arr = Array.from(map.values());
    window.localStorage.setItem(EPISODE_STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

export function markEpisodeAcknowledged(targetIdentifier: string) {
  const records = loadEpisodeRecords();
  const cleanTarget = targetIdentifier.trim().toLowerCase();
  let changed = false;

  for (const [key, ep] of records.entries()) {
    const keyLower = key.toLowerCase();
    if (
      keyLower === cleanTarget ||
      keyLower.includes(cleanTarget) ||
      cleanTarget.includes(keyLower) ||
      ep.activeAlertId === targetIdentifier ||
      (ep.elderId && cleanTarget.includes(ep.elderId.toLowerCase()))
    ) {
      ep.status = 'ACKNOWLEDGED_AWAITING_RECOVERY';
      ep.activeAlertId = undefined;
      records.set(key, ep);
      changed = true;
    }
  }

  if (!changed && cleanTarget.includes(':')) {
    const [elderPart, ...anomalyParts] = cleanTarget.split(':');
    const normKey = `${elderPart}:${anomalyParts.join(':').toUpperCase()}`;
    records.set(normKey, {
      episodeKey: normKey,
      elderId: elderPart,
      anomalyType: anomalyParts.join(':').toUpperCase() as any,
      status: 'ACKNOWLEDGED_AWAITING_RECOVERY',
      lastDispatchedTime: Date.now(),
      lastSeverity: 'warning',
    });
    changed = true;
  }

  if (changed) {
    saveEpisodeRecords(records);
  }
}

export function markEpisodeRecovered(elderId: string, metric: AnomalyMetric) {
  const records = loadEpisodeRecords();
  const cleanElder = elderId.trim().toLowerCase();
  let changed = false;

  const relevantTypes: CanonicalAnomalyType[] =
    metric === 'spo2' ? ['LOW_SPO2', 'HIGH_SPO2'] :
    metric === 'systolic_bp' || metric === 'diastolic_bp' ? ['HIGH_BP', 'LOW_BP'] :
    metric === 'heart_rate' ? ['HIGH_HEART_RATE', 'LOW_HEART_RATE'] : ['VITAL_ABNORMAL'];

  for (const anomalyType of relevantTypes) {
    const key = `${cleanElder}:${anomalyType}`;
    const ep = records.get(key);
    if (ep && ep.status !== 'NORMAL') {
      ep.status = 'NORMAL';
      ep.activeAlertId = undefined;
      records.set(key, ep);
      changed = true;
    }
  }

  if (changed) {
    saveEpisodeRecords(records);
  }
}

// Global cooldown buffer before a new episode can trigger if rapidly oscillating (5 minutes)
export const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

export function clearAnomalyCooldowns(elderId?: string) {
  const records = loadEpisodeRecords();
  if (elderId) {
    const cleanElder = elderId.trim().toLowerCase();
    for (const [key, ep] of records.entries()) {
      if (key.startsWith(`${cleanElder}:`)) {
        ep.lastDispatchedTime = 0;
        records.set(key, ep);
      }
    }
  } else {
    for (const ep of records.values()) {
      ep.lastDispatchedTime = 0;
    }
  }
  saveEpisodeRecords(records);
}

export function resetAllEpisodeRecords() {
  const records = loadEpisodeRecords();
  for (const ep of records.values()) {
    ep.status = 'NORMAL';
    ep.activeAlertId = undefined;
    ep.lastDispatchedTime = 0;
  }
  saveEpisodeRecords(records);
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
 * Enforces:
 * - Exactly ONE active alert per continuous abnormal episode.
 * - Ongoing telemetry fluctuations update the existing active alert rather than creating duplicates.
 * - Acknowledging an alert moves it to history and requires vital to return to safe baseline before another alert can be created.
 */
export function processVitalsTickWithAlerts(
  elder: { id: string; full_name: string },
  vitals: DemoVitals,
  options?: { force?: boolean }
): VitalsAnomaly[] {
  const anomalies = detectVitalsAnomalies(elder, vitals);
  const now = Date.now();
  const dispatched: VitalsAnomaly[] = [];
  const episodeRecords = loadEpisodeRecords();

  // 1. Check for conditions that have safely recovered to their healthy baseline
  const allMetrics: AnomalyMetric[] = ['heart_rate', 'spo2', 'systolic_bp', 'breathing_rate', 'stress'];
  for (const metric of allMetrics) {
    if (isConditionInSafeRange(metric, vitals)) {
      markEpisodeRecovered(elder.id, metric);
    }
  }

  // 2. Process detected anomalies
  for (const anomaly of anomalies) {
    const alertType: DemoAlert['type'] =
      anomaly.metric === 'heart_rate' ? 'high_hr' :
      anomaly.metric === 'spo2' ? 'low_spo2' :
      anomaly.severity === 'critical' ? 'sos' : 'vital_abnormal';

    const episodeKey = getAlertEpisodeKey({
      elder_id: elder.id,
      elder_name: elder.full_name,
      type: alertType,
      metric: anomaly.metric,
      message: anomaly.message,
      title: anomaly.title,
    });

    let episode = episodeRecords.get(episodeKey);
    if (!episode) {
      episode = {
        episodeKey,
        elderId: elder.id,
        anomalyType: getCanonicalAnomalyType({ type: alertType, metric: anomaly.metric, message: anomaly.message }),
        status: 'NORMAL',
        lastDispatchedTime: 0,
        lastSeverity: anomaly.severity,
      };
      episodeRecords.set(episodeKey, episode);
    }

    // Check if an unresolved alert for this elder and canonical episode already exists
    const currentAppAlerts = useAppStore.getState().activeAlerts;
    const existingActiveAlert = currentAppAlerts.find(
      (a) => !a.resolved && getAlertEpisodeKey(a) === episodeKey
    );

    // CASE 1: Active alert already exists for this ongoing episode -> UPDATE IN PLACE
    if (existingActiveAlert) {
      const updatedMessage = `${anomaly.title}: ${anomaly.message}`;
      const nextSeverity = anomaly.severity === 'critical' ? 'critical' : existingActiveAlert.severity;

      // Update in AppStore
      useAppStore.getState().updateAlertInPlace(existingActiveAlert.id, {
        message: updatedMessage,
        time: anomaly.timestamp,
        severity: nextSeverity,
      });

      // Update in GuardianStore
      const guardianAlerts = useGuardianStore.getState().alerts;
      const matchingGa = guardianAlerts.find(
        (ga) => !ga.acknowledged && (ga.id === existingActiveAlert.id || getAlertEpisodeKey({ elderName: ga.elderName, elderId: ga.elderId, type: ga.type, message: ga.message }) === episodeKey)
      );
      if (matchingGa) {
        useGuardianStore.getState().updateGuardianAlertInPlace(matchingGa.id, {
          message: `⚠️ Vital Alert: ${anomaly.message} Dr. Ramesh Kumar and caretaker have been notified.`,
          time: anomaly.timestamp,
          severity: nextSeverity,
        });
      }

      // Sync cross-window
      broadcastGcareMessage({
        type: 'ALERT_UPDATED',
        id: existingActiveAlert.id,
        elderId: elder.id,
        elderName: elder.full_name,
        episodeKey,
        alert: {
          ...existingActiveAlert,
          message: updatedMessage,
          time: anomaly.timestamp,
          severity: nextSeverity,
        },
        timestamp: now,
      });

      // Update backend record
      apiFetch(`/alerts/${existingActiveAlert.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: updatedMessage,
          severity: nextSeverity,
          time: anomaly.timestamp,
        }),
      }).catch(() => {});

      episode.status = 'ACTIVE_ALERT';
      episode.activeAlertId = existingActiveAlert.id;
      episode.lastDispatchedTime = now;
      episode.lastSeverity = nextSeverity;
      episode.lastTelemetryValue = anomaly.value;
      saveEpisodeRecords(episodeRecords);

      // Do NOT insert a duplicate alert; updated existing active alert in place
      continue;
    }

    // CASE 2: No active alert exists, BUT episode is ACKNOWLEDGED_AWAITING_RECOVERY
    // Acknowledging an alert must NOT allow the exact same still-abnormal condition to immediately recreate an alert!
    if (!options?.force && episode.status === 'ACKNOWLEDGED_AWAITING_RECOVERY') {
      const isCriticalEscalation = episode.lastSeverity === 'warning' && anomaly.severity === 'critical';
      if (!isCriticalEscalation) {
        // Still inside unrecovered condition; stay quiet in history until safe baseline recovery
        continue;
      }
    }

    // CASE 3: Genuinely new abnormal episode (or critical escalation / forced trigger)
    episode.status = 'ACTIVE_ALERT';
    episode.lastDispatchedTime = now;
    episode.lastSeverity = anomaly.severity;
    episode.lastTelemetryValue = anomaly.value;

    dispatched.push(anomaly);

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
    episode.activeAlertId = appAlert.id;
    saveEpisodeRecords(episodeRecords);

    // 1. Dispatch to useAppStore
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

    // 2. Dispatch to useGuardianStore (for Guardian Portal)
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

    // 3. Audio & Haptic Alarm if watch simulator is open for this elder
    try {
      const activeWatchElderId = useAppStore.getState().activeWatchElderId;
      if (activeWatchElderId && elder.id === activeWatchElderId) {
        triggerAlert(anomaly.severity === 'critical' ? 'vital' : 'notification');
      }
    } catch {}
  }

  return dispatched;
}
