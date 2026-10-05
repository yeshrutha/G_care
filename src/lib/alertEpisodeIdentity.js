// Shared by the browser and both database adapters. Values and times never
// participate in condition identity. Names are a legacy fallback only.
const demoIds = { usha: 'elder-1', 'lakshmi devi': 'elder-2', 'venkatesh rao': 'elder-3' };
export function getCanonicalAnomalyType(alert) {
  if (alert.anomaly_type) return alert.anomaly_type;
  const type = (alert.type || '').toUpperCase();
  const metric = (alert.metric || '').toUpperCase();
  const text = `${alert.title || ''} ${alert.message || ''}`.toUpperCase().replaceAll('₂', '2');
  if (type === 'APPOINTMENT') return 'APPOINTMENT';
  if (type === 'LOW_SPO2' || metric === 'SPO2' || /OXYGEN|SPO2|HYPOXEMIA/.test(text)) return 'LOW_SPO2';
  if (/\bBP\b|HIGH_BP|LOW_BP|SYSTOLIC_BP|DIASTOLIC_BP|BLOOD PRESSURE|HYPOTENSION|HYPERTENSIVE/.test(`${type} ${metric} ${text}`)) {
    return /LOW_BP|DROPPED|HYPOTENSION|SHOCK/.test(`${type} ${text}`) ? 'LOW_BP' : 'HIGH_BP';
  }
  if (/HEART_RATE|HIGH_HR|LOW_HR|HEART RATE|TACHYCARDIA|BRADYCARDIA/.test(`${type} ${metric} ${text}`)) {
    return /LOW_HR|LOW_HEART_RATE|BRADYCARDIA|DECREASED/.test(`${type} ${text}`) ? 'LOW_HEART_RATE' : 'HIGH_HEART_RATE';
  }
  if (metric === 'BREATHING_RATE' || /BREATHING RATE|TACHYPNEA/.test(text)) return 'HIGH_BREATHING_RATE';
  if (metric === 'STRESS' || /STRESS INDEX|ACUTE AGITATION/.test(text)) return 'HIGH_STRESS';
  if (/HIGH_TEMP|FEVER|HYPERTHERMIA/.test(`${type} ${text}`)) return 'HIGH_TEMPERATURE';
  if (/LOW_TEMP|HYPOTHERMIA/.test(`${type} ${text}`)) return 'LOW_TEMPERATURE';
  if (type === 'SOS' || text.includes('SOS')) return 'SOS';
  if (type === 'FALL' || text.includes('FALL')) return 'FALL';
  if (type === 'GEOFENCE' || text.includes('GEOFENCE')) return 'GEOFENCE';
  if (/MISSED_MED|MEDICINE|MEDICATION/.test(`${type} ${text}`)) return 'MISSED_MED';
  return 'VITAL_ABNORMAL';
}

export function getAlertEpisodeKey(alert, elders = []) {
  const name = (alert.elder_name || alert.elderName || '').trim().toLowerCase();
  const elderId = alert.elder_id || alert.elderId
    || elders.find(e => e.full_name?.trim().toLowerCase() === name)?.id
    || demoIds[name] || name || 'unknown';
  return `${elderId.trim().toLowerCase()}:${getCanonicalAnomalyType(alert)}`;
}

export function isPhysiologicalEpisode(alert) {
  return /^(LOW_SPO2|HIGH_SPO2|HIGH_BP|LOW_BP|HIGH_HEART_RATE|LOW_HEART_RATE|HIGH_BREATHING_RATE|HIGH_STRESS|HIGH_TEMPERATURE|LOW_TEMPERATURE)$/.test(getCanonicalAnomalyType(alert));
}

// Keep history; close only extra currently open records of the same condition.
// The newest representative remains active. No records are deleted.
export function reconcileAlertEpisodes(alerts, elders = []) {
  const representatives = new Map();
  const byId = new Map();
  for (const alert of alerts) byId.set(alert.id, { ...byId.get(alert.id), ...alert });
  const items = [...byId.values()];
  for (const alert of [...items].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))) {
    if (alert.resolved || alert.episode_recovered || !isPhysiologicalEpisode(alert)) continue;
    const key = getAlertEpisodeKey(alert, elders);
    const representative = representatives.get(key);
    if (representative) {
      alert.resolved = true;
      alert.duplicate_of = representative.id;
    } else representatives.set(key, alert);
  }
  return items;
}
