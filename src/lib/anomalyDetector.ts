import { patientStorage } from '@/lib/patientStorage';
import { DEMO_ELDERS } from '@/lib/demoData';
import { useAppStore, type DemoAlert, type DemoVitals } from '@/store';
import { useGuardianStore, type GuardianAlert } from '@/store/guardianStore';
import { triggerAlert } from '@/lib/audioAlerts';
import { apiFetch } from '@/lib/api';
import { broadcastGcareMessage } from '@/lib/syncChannel';
import {
  getCanonicalAnomalyType as canonicalType,
  getAlertEpisodeKey as identityKey,
  isPhysiologicalEpisode,
} from '@/lib/alertEpisodeIdentity.js';

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
  | 'HIGH_BREATHING_RATE'
  | 'HIGH_STRESS'
  | 'APPOINTMENT'
  | 'VITAL_ABNORMAL';

export function getCanonicalAnomalyType(alert: { type?: string; message?: string; metric?: string; title?: string; anomaly_type?: string }): CanonicalAnomalyType {
  return canonicalType(alert) as CanonicalAnomalyType;
}
export function getAlertEpisodeKey(alert: {
  elder_id?: string; elderId?: string; elder_name?: string; elderName?: string;
  type?: string; message?: string; metric?: string; title?: string; anomaly_type?: string;
}): string {
  return identityKey(alert, useAppStore.getState().demoElders || DEMO_ELDERS);
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
    const raw = patientStorage().getItem(EPISODE_STORAGE_KEY);
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
    patientStorage().setItem(EPISODE_STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

export function markEpisodeAcknowledged(targetIdentifier: string) {
  const records = loadEpisodeRecords();
  const target = targetIdentifier.trim().toLowerCase();
  for (const [key, ep] of records) {
    if (key.toLowerCase() === target || ep.activeAlertId === targetIdentifier) {
      ep.status = 'ACKNOWLEDGED_AWAITING_RECOVERY';
      saveEpisodeRecords(records);
      return;
    }
  }
  if (target.includes(':')) {
    const [elderId, type] = target.split(':');
    const key = elderId + ':' + type.toUpperCase();
    records.set(key, {
      episodeKey: key, elderId, anomalyType: type.toUpperCase() as CanonicalAnomalyType,
      status: 'ACKNOWLEDGED_AWAITING_RECOVERY', lastDispatchedTime: Date.now(), lastSeverity: 'warning',
    });
    saveEpisodeRecords(records);
  }
}

// Serialize create/update/ack/recovery so a fast acknowledgement cannot race
// an unfinished POST. Reconcile the canonical server ID when it reused a record.
let persistenceQueue: Promise<unknown> = Promise.resolve();
const persistedIds = new Map<string, string>();
export function persistEpisodeAlert(alert: DemoAlert, updates?: Partial<DemoAlert>) {
  persistenceQueue = persistenceQueue.then(async () => {
    const id = persistedIds.get(alert.id) || alert.id;
    const saved = await apiFetch<DemoAlert>(updates ? '/alerts/' + encodeURIComponent(id) : '/alerts', {
      method: updates ? 'PUT' : 'POST', body: JSON.stringify(updates || alert),
    });
    if (!saved?.id) return;
    persistedIds.set(alert.id, saved.id);
    // The local alert may already be acknowledged/recovered while POST ran.
    const local = useAppStore.getState().activeAlerts.find(a => a.id === alert.id || a.id === saved.id);
    if (!local) return;
    const merged = { ...local, id: saved.id,
      resolved: local.resolved || saved.resolved,
      episode_recovered: local.episode_recovered || saved.episode_recovered };
    useAppStore.getState().setActiveAlerts(
      useAppStore.getState().activeAlerts.map(a => a.id === local.id ? merged : a)
    );
    const ga = useGuardianStore.getState().alerts.find(a => a.id === local.id);
    if (ga) useGuardianStore.getState().updateGuardianAlertInPlace(ga.id, { id: saved.id, acknowledged: merged.resolved });
    const records = loadEpisodeRecords();
    const ep = records.get(getAlertEpisodeKey(merged));
    if (ep && ep.activeAlertId === alert.id) {
      ep.activeAlertId = saved.id;
      if (saved.resolved && ep.status !== 'NORMAL') ep.status = 'ACKNOWLEDGED_AWAITING_RECOVERY';
      saveEpisodeRecords(records);
    }
  }).catch(err => console.warn('Alert persistence failed:', err));
  return persistenceQueue;
}

export function markEpisodeRecovered(elderId: string, metric: AnomalyMetric) {
  const records = loadEpisodeRecords();
  const types: CanonicalAnomalyType[] =
    metric === 'spo2' ? ['LOW_SPO2', 'HIGH_SPO2'] :
    metric === 'systolic_bp' || metric === 'diastolic_bp' ? ['HIGH_BP', 'LOW_BP'] :
    metric === 'heart_rate' ? ['HIGH_HEART_RATE', 'LOW_HEART_RATE'] :
    metric === 'breathing_rate' ? ['HIGH_BREATHING_RATE'] : ['HIGH_STRESS'];
  for (const type of types) {
    const key = elderId.trim().toLowerCase() + ':' + type;
    const ep = records.get(key);
    const alerts = useAppStore.getState().activeAlerts.filter(a =>
      getAlertEpisodeKey(a) === key && ((!a.resolved && !a.episode_recovered) || a.id === ep?.activeAlertId));
    if ((!ep || ep.status === 'NORMAL') && alerts.every(a => a.episode_recovered)) continue;
    // Clearing local history must not prevent the persisted episode recovering.
    if (ep?.activeAlertId && !alerts.some(a => a.id === ep.activeAlertId)) {
      persistEpisodeAlert({ id: ep.activeAlertId, elder_id: elderId,
        elder_name: useAppStore.getState().demoElders.find(e => e.id === elderId)?.full_name || elderId,
        type: 'vital_abnormal', anomaly_type: type, severity: ep.lastSeverity,
        message: '', time: new Date().toISOString(), resolved: true },
        { resolved: true, episode_recovered: true });
    }
    for (const alert of alerts) {
      useAppStore.getState().updateAlertInPlace(alert.id, { episode_recovered: true });
      persistEpisodeAlert(alert, { episode_recovered: true });
    }
    if (ep) {
      ep.status = 'NORMAL';
      ep.activeAlertId = undefined;
    }
    broadcastGcareMessage({ type: 'EPISODE_STATE_SYNC', elderId, episodeKey: key, episodeStatus: 'NORMAL', timestamp: Date.now() });
  }
  saveEpisodeRecords(records);
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

export function hydrateAlertRecords(serverAlerts: DemoAlert[]) {
  const state = useAppStore.getState();
  const incoming = serverAlerts.map((a: any) => ({ ...a,
    elder_id: a.elder_id || a.elderId,
    elder_name: a.elder_name || a.elderName || state.demoElders.find(e => e.id === (a.elder_id || a.elderId))?.full_name || 'Patient',
  }));
  // Resolve state is monotonic for one ID; a new episode has a new ID.
  const merged = [...state.activeAlerts];
  for (const alert of incoming) {
    let index = merged.findIndex(a => a.id === alert.id);
    // A GET can return the canonical record before our POST response arrives.
    // Reuse that ID instead of treating the optimistic alert as a second episode.
    if (index < 0 && !alert.resolved && !alert.episode_recovered && isPhysiologicalEpisode(alert)) {
      index = merged.findIndex(a => !a.resolved && !a.episode_recovered && getAlertEpisodeKey(a) === getAlertEpisodeKey(alert));
      if (index >= 0) {
        const previousId = merged[index].id;
        persistedIds.set(previousId, alert.id);
        const guardian = useGuardianStore.getState().alerts.find(a => a.id === previousId);
        if (guardian) useGuardianStore.getState().updateGuardianAlertInPlace(previousId, { id: alert.id });
      }
    }
    if (index >= 0) merged[index] = { ...merged[index], ...alert,
      resolved: merged[index].resolved || alert.resolved,
      episode_recovered: merged[index].episode_recovered || alert.episode_recovered };
    else merged.push(alert);
  }
  state.setActiveAlerts(merged);
  const records = loadEpisodeRecords();
  const seen = new Set<string>();
  for (const alert of [...useAppStore.getState().activeAlerts].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))) {
    const key = getAlertEpisodeKey(alert);
    if (alert.duplicate_of) continue;
    useGuardianStore.getState().addGuardianAlert({
      id: alert.id, elderId: alert.elder_id, elderName: alert.elder_name,
      anomaly_type: alert.anomaly_type || getCanonicalAnomalyType(alert),
      type: alert.type === 'sos' || alert.type === 'fall' || alert.type === 'geofence' ? alert.type : 'vital_abnormal',
      severity: alert.severity, message: alert.message, time: alert.time, acknowledged: alert.resolved, episode_recovered: alert.episode_recovered,
    });
    if (!isPhysiologicalEpisode(alert) || seen.has(key) || (alert.resolved && !alert.anomaly_type)) continue;
    seen.add(key);
    records.set(key, { episodeKey: key, elderId: alert.elder_id || key.split(':')[0],
      anomalyType: getCanonicalAnomalyType(alert), activeAlertId: alert.id,
      status: alert.episode_recovered ? 'NORMAL' : alert.resolved ? 'ACKNOWLEDGED_AWAITING_RECOVERY' : 'ACTIVE_ALERT',
      lastDispatchedTime: Date.parse(alert.time), lastSeverity: alert.severity === 'critical' ? 'critical' : 'warning' });
  }
  saveEpisodeRecords(records);
}

export function getActiveWatchAnomalies(elder: { id: string; full_name: string }, vitals: DemoVitals, alerts: DemoAlert[]) {
  return detectVitalsAnomalies(elder, vitals).filter(anomaly => {
    const key = getAlertEpisodeKey(anomaly);
    return alerts.some(alert => !alert.resolved && getAlertEpisodeKey(alert) === key);
  });
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
  // 1. Check for conditions that have safely recovered to their healthy baseline
  const allMetrics: AnomalyMetric[] = ['heart_rate', 'spo2', 'systolic_bp', 'breathing_rate', 'stress'];
  for (const metric of allMetrics) {
    if (isConditionInSafeRange(metric, vitals)) {
      markEpisodeRecovered(elder.id, metric);
    }
  }

  const episodeRecords = loadEpisodeRecords();

  // 2. Process detected anomalies
  for (const anomaly of anomalies) {
    const anomalyType = getCanonicalAnomalyType(anomaly);
    const alertType: DemoAlert['type'] =
      anomaly.metric === 'heart_rate' ? 'high_hr' :
      anomaly.metric === 'spo2' ? 'low_spo2' :
      anomaly.severity === 'critical' ? 'sos' : 'vital_abnormal';

    const episodeKey = getAlertEpisodeKey({
      elder_id: elder.id,
      elder_name: elder.full_name,
      type: alertType,
      anomaly_type: anomalyType,
      metric: anomaly.metric,
      message: anomaly.message,
      title: anomaly.title,
    });

    let episode = episodeRecords.get(episodeKey);
    if (!episode) {
      episode = {
        episodeKey,
        elderId: elder.id,
        anomalyType,
        status: 'NORMAL',
        lastDispatchedTime: 0,
        lastSeverity: anomaly.severity,
      };
      episodeRecords.set(episodeKey, episode);
    }

    // Check if an unresolved alert for this elder and canonical episode already exists
    const currentAppAlerts = useAppStore.getState().activeAlerts;
    const existingActiveAlert = currentAppAlerts.find(
      (a) => !a.resolved && !a.episode_recovered && getAlertEpisodeKey(a) === episodeKey
    );

    // CASE 1: Active alert already exists for this ongoing episode -> UPDATE IN PLACE
    if (existingActiveAlert) {
      const updatedMessage = `${anomaly.title}: ${anomaly.message}`;
      const nextSeverity = anomaly.severity === 'critical' || existingActiveAlert.severity === 'critical' ? 'critical' : 'warning';

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

      persistEpisodeAlert(existingActiveAlert, {
        message: updatedMessage, severity: nextSeverity, time: anomaly.timestamp,
      });

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
    if (episode.status === 'ACKNOWLEDGED_AWAITING_RECOVERY') {
      episode.lastTelemetryValue = anomaly.value;
      // Worsening values remain the same acknowledged episode until recovery.
      saveEpisodeRecords(episodeRecords);
      continue;
    }
    // Another tab can have recorded the episode before its alert storage event
    // arrives. Adopt the shared record rather than generate a second ID.
    if (episode.status === 'ACTIVE_ALERT' && episode.activeAlertId) {
      const stored = JSON.parse(patientStorage().getItem('gcare_active_alerts') || '[]') as DemoAlert[];
      const shared = stored.find(a => a.id === episode.activeAlertId);
      if (shared) useAppStore.getState().addAlert(shared);
      continue;
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
      anomaly_type: anomalyType,
      severity: anomaly.severity,
      message: `${anomaly.title}: ${anomaly.message}`,
      time: anomaly.timestamp,
      resolved: false,
    };
    episode.activeAlertId = appAlert.id;
    saveEpisodeRecords(episodeRecords);

    // 1. Dispatch to useAppStore
    useAppStore.getState().addAlert(appAlert);

    persistEpisodeAlert(appAlert);

    // 2. Dispatch to useGuardianStore (for Guardian Portal)
    const guardianAlert: GuardianAlert = {
      id: appAlert.id,
      anomaly_type: anomalyType,
      type: 'vital_abnormal',
      severity: anomaly.severity,
      message: `⚠️ Vital Alert: ${anomaly.message} Dr. Ramesh Kumar and caretaker have been notified.`,
      time: anomaly.timestamp,
      acknowledged: false,
      elderName: elder.full_name,
      elderId: elder.id,
    };
    useGuardianStore.getState().addGuardianAlert(guardianAlert);
    broadcastGcareMessage({ type: 'ALERT_CREATED', id: appAlert.id, alert: appAlert,
      episodeKey, elderId: elder.id, elderName: elder.full_name, timestamp: now });

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
