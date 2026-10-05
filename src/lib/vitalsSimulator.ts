import type { DemoElder, DemoVitals, MotionState } from '@/store';

export interface PhysiologicalProfile {
  elderId: string;
  name: string;
  conditions: string[];
  baseline: DemoVitals;
  variance: {
    hr: number;
    systolic: number;
    diastolic: number;
    spo2: number;
    stress: number;
    hydration: number;
    breathing: number;
    temp: number;
  };
  bounds: {
    hr: [number, number];
    systolic: [number, number];
    diastolic: [number, number];
    spo2: [number, number];
    breathing: [number, number];
  };
}

export const PATIENT_PHYSIOLOGICAL_PROFILES: Record<string, PhysiologicalProfile> = {
  'elder-1': {
    elderId: 'elder-1',
    name: 'Usha',
    conditions: ['Hypertension', 'Type 2 Diabetes', 'Mild Arthritis'],
    baseline: {
      heart_rate: 71,
      systolic_bp: 128,
      diastolic_bp: 82,
      spo2: 97.4,
      stress: 34,
      hydration: 72,
      breathing_rate: 16,
      skin_temp: 36.5,
      shiver_detected: false,
      panic_detected: false,
      fall_detected: false,
      motion_state: 'sitting',
    },
    variance: {
      hr: 2.2,
      systolic: 2.5,
      diastolic: 1.8,
      spo2: 0.4,
      stress: 3.0,
      hydration: 1.2,
      breathing: 1.0,
      temp: 0.1,
    },
    bounds: {
      hr: [64, 82],
      systolic: [120, 138],
      diastolic: [76, 88],
      spo2: [96.0, 99.0],
      breathing: [13, 19],
    },
  },
  'elder-2': {
    elderId: 'elder-2',
    name: 'Lakshmi Devi',
    conditions: ['Atrial Fibrillation', 'Osteoporosis'],
    baseline: {
      heart_rate: 76,
      systolic_bp: 126,
      diastolic_bp: 80,
      spo2: 97.2,
      stress: 32,
      hydration: 72,
      breathing_rate: 16,
      skin_temp: 36.6,
      shiver_detected: false,
      panic_detected: false,
      fall_detected: false,
      motion_state: 'sitting',
    },
    variance: {
      hr: 2.8,
      systolic: 2.2,
      diastolic: 1.6,
      spo2: 0.35,
      stress: 2.5,
      hydration: 1.0,
      breathing: 0.8,
      temp: 0.05,
    },
    bounds: {
      hr: [68, 86],
      systolic: [118, 134],
      diastolic: [74, 85],
      spo2: [96.0, 98.8],
      breathing: [14, 18],
    },
  },
  'elder-3': {
    elderId: 'elder-3',
    name: 'Venkatesh Rao',
    conditions: ['COPD', 'Anxiety'],
    baseline: {
      heart_rate: 72,
      systolic_bp: 120,
      diastolic_bp: 78,
      spo2: 97.0,
      stress: 30,
      hydration: 74,
      breathing_rate: 16,
      skin_temp: 36.5,
      shiver_detected: false,
      panic_detected: false,
      fall_detected: false,
      motion_state: 'sitting',
    },
    variance: {
      hr: 2.2,
      systolic: 2.0,
      diastolic: 1.5,
      spo2: 0.35,
      stress: 2.5,
      hydration: 1.0,
      breathing: 0.8,
      temp: 0.05,
    },
    bounds: {
      hr: [66, 80],
      systolic: [114, 128],
      diastolic: [72, 82],
      spo2: [95.5, 98.8],
      breathing: [14, 18],
    },
  },
};

/**
 * Returns an authentic baseline for any elder, either from preset profiles
 * or extrapolated based on known medical conditions and age.
 */
export function getElderBaseline(elder?: Partial<DemoElder> | null): DemoVitals {
  if (elder?.id && PATIENT_PHYSIOLOGICAL_PROFILES[elder.id]) {
    return { ...PATIENT_PHYSIOLOGICAL_PROFILES[elder.id].baseline };
  }

  // Dynamic baseline based on patient conditions
  const conditions = (elder?.medical_conditions || []).map((c) => c.toLowerCase());
  const isCopd = conditions.some((c) => c.includes('copd') || c.includes('lung') || c.includes('asthma'));
  const isHypertensive = conditions.some((c) => c.includes('hypertension') || c.includes('bp') || c.includes('pressure'));
  const hasArrhythmia = conditions.some((c) => c.includes('fibrillation') || c.includes('arrhythmia') || c.includes('heart'));
  const hasAnxiety = conditions.some((c) => c.includes('anxiety') || c.includes('stress'));

  return {
    heart_rate: hasArrhythmia ? 76 : 72,
    systolic_bp: isHypertensive ? 128 : 122,
    diastolic_bp: isHypertensive ? 82 : 78,
    spo2: isCopd ? 96.5 : 97.5,
    stress: hasAnxiety ? 34 : 30,
    hydration: 72,
    breathing_rate: 16,
    skin_temp: 36.6,
    shiver_detected: false,
    panic_detected: false,
    fall_detected: false,
    motion_state: 'sitting',
  };
}

/**
 * Simulates next vitals tick using a mean-reverting Ornstein-Uhlenbeck stochastic model
 * with biological correlations between metrics.
 */
export function simulateNextVitals(
  current: DemoVitals,
  baseline?: DemoVitals,
  elder?: Partial<DemoElder> | null,
  anomalyOverride?: Partial<DemoVitals> | null,
): DemoVitals {
  const profile = elder?.id ? PATIENT_PHYSIOLOGICAL_PROFILES[elder.id] : null;
  const baseTarget = baseline || (profile ? profile.baseline : getElderBaseline(elder));
  const target: DemoVitals = anomalyOverride ? { ...baseTarget, ...anomalyOverride } : baseTarget;

  // If in an active critical alert (fall or panic), preserve elevated state
  if (current.fall_detected || current.panic_detected) {
    return {
      ...current,
      heart_rate: Math.min(135, Math.max(105, current.heart_rate + Math.round((Math.random() - 0.48) * 4))),
      systolic_bp: Math.min(165, Math.max(135, current.systolic_bp + Math.round((Math.random() - 0.5) * 3))),
      stress: Math.min(98, Math.max(82, current.stress + Math.round((Math.random() - 0.5) * 2))),
      spo2: Math.max(88, Math.min(94, Math.round((current.spo2 + (Math.random() - 0.5) * 0.4) * 10) / 10)),
    };
  }

  // Mean-reversion factor theta: pulls back towards baseline
  const theta = 0.22;

  // Variances
  const vHr = profile?.variance.hr ?? 2.5;
  const vSys = profile?.variance.systolic ?? 2.5;
  const vDia = profile?.variance.diastolic ?? 1.8;
  const vSpo2 = profile?.variance.spo2 ?? 0.45;
  const vStress = profile?.variance.stress ?? 3.2;
  const vHyd = profile?.variance.hydration ?? 1.2;
  const vBr = profile?.variance.breathing ?? 1.1;
  const vTemp = profile?.variance.temp ?? 0.08;

  // Correlated random components
  const commonNoise = (Math.random() - 0.5) * 2;
  const hrNoise = (Math.random() - 0.5) * 2;
  const bpNoise = (Math.random() - 0.5) * 2;

  // Heart Rate
  const hrDrift = -theta * (current.heart_rate - target.heart_rate);
  const nextHr = Math.round(current.heart_rate + hrDrift + (hrNoise * 0.7 + commonNoise * 0.3) * vHr);

  // Blood Pressure (systolic and diastolic correlated)
  const sysDrift = -theta * (current.systolic_bp - target.systolic_bp);
  const nextSys = Math.round(current.systolic_bp + sysDrift + (bpNoise * 0.8 + commonNoise * 0.2) * vSys);

  const diaDrift = -theta * (current.diastolic_bp - target.diastolic_bp);
  const nextDia = Math.round(current.diastolic_bp + diaDrift + (bpNoise * 0.65 + (Math.random() - 0.5) * 0.35) * vDia);

  // SpO2
  const spo2Drift = -theta * (current.spo2 - target.spo2);
  const nextSpo2 = Math.round((current.spo2 + spo2Drift + (Math.random() - 0.5) * 2 * vSpo2) * 10) / 10;

  // Stress (correlated with HR changes)
  const hrChange = nextHr - current.heart_rate;
  const stressDrift = -theta * (current.stress - target.stress);
  const nextStress = Math.round(
    current.stress + stressDrift + hrChange * 0.25 + (Math.random() - 0.5) * 2 * vStress,
  );

  // Hydration (slow drift)
  const hydDrift = -0.08 * (current.hydration - target.hydration);
  const nextHyd = Math.round(current.hydration + hydDrift + (Math.random() - 0.5) * vHyd);

  // Breathing rate (correlated inverse with SpO2)
  const brDrift = -theta * (current.breathing_rate - target.breathing_rate);
  const spo2Delta = target.spo2 - nextSpo2;
  const nextBr = Math.round(
    current.breathing_rate + brDrift + spo2Delta * 0.4 + (Math.random() - 0.5) * 2 * vBr,
  );

  // Skin temperature (smooth micro-fluctuations)
  const tempDrift = -0.15 * (current.skin_temp - target.skin_temp);
  const nextTemp = Math.round((current.skin_temp + tempDrift + (Math.random() - 0.5) * 2 * vTemp) * 10) / 10;

  // Apply bounds
  const bounds = profile?.bounds;
  let minHr = bounds ? bounds.hr[0] : 50;
  let maxHr = bounds ? bounds.hr[1] : 110;
  let minSys = bounds ? bounds.systolic[0] : 100;
  let maxSys = bounds ? bounds.systolic[1] : 160;
  let minDia = bounds ? bounds.diastolic[0] : 60;
  let maxDia = bounds ? bounds.diastolic[1] : 100;
  let minSpo2 = bounds ? bounds.spo2[0] : 90.0;
  let maxSpo2 = bounds ? bounds.spo2[1] : 100.0;
  let minBr = bounds ? bounds.breathing[0] : 10;
  let maxBr = bounds ? bounds.breathing[1] : 28;

  // Dynamically expand bounds if anomalyOverride is present
  if (anomalyOverride) {
    if (anomalyOverride.heart_rate !== undefined) {
      minHr = Math.min(minHr, anomalyOverride.heart_rate - 6);
      maxHr = Math.max(maxHr, anomalyOverride.heart_rate + 6);
    }
    if (anomalyOverride.systolic_bp !== undefined) {
      minSys = Math.min(minSys, anomalyOverride.systolic_bp - 8);
      maxSys = Math.max(maxSys, anomalyOverride.systolic_bp + 8);
    }
    if (anomalyOverride.diastolic_bp !== undefined) {
      minDia = Math.min(minDia, anomalyOverride.diastolic_bp - 6);
      maxDia = Math.max(maxDia, anomalyOverride.diastolic_bp + 6);
    }
    if (anomalyOverride.spo2 !== undefined) {
      minSpo2 = Math.min(minSpo2, anomalyOverride.spo2 - 1.5);
      maxSpo2 = Math.max(maxSpo2, anomalyOverride.spo2 + 1.5);
    }
    if (anomalyOverride.breathing_rate !== undefined) {
      minBr = Math.min(minBr, anomalyOverride.breathing_rate - 3);
      maxBr = Math.max(maxBr, anomalyOverride.breathing_rate + 3);
    }
  }

  // Motion State transitions (sitting, standing, walking, resting)
  const motionStates: MotionState[] = ['walking', 'sitting', 'standing', 'resting'];
  let nextMotion: MotionState = current.motion_state || 'sitting';
  if (Math.random() < 0.18) {
    nextMotion = motionStates[Math.floor(Math.random() * motionStates.length)];
  }

  // Shiver micro-tremor simulation
  let nextShiver = current.shiver_detected || false;
  if (anomalyOverride?.shiver_detected !== undefined) {
    nextShiver = Boolean(anomalyOverride.shiver_detected);
  } else {
    // 3% probability of transient micro-tremor detection
    nextShiver = Math.random() < 0.03;
  }

  return {
    heart_rate: Math.max(minHr, Math.min(maxHr, nextHr)),
    systolic_bp: Math.max(minSys, Math.min(maxSys, nextSys)),
    diastolic_bp: Math.max(minDia, Math.min(maxDia, nextDia)),
    spo2: Math.max(minSpo2, Math.min(maxSpo2, nextSpo2)),
    stress: Math.max(5, Math.min(95, nextStress)),
    hydration: Math.max(40, Math.min(95, nextHyd)),
    breathing_rate: Math.max(minBr, Math.min(maxBr, nextBr)),
    skin_temp: Math.max(35.5, Math.min(37.5, nextTemp)),
    shiver_detected: nextShiver,
    panic_detected: current.panic_detected || false,
    fall_detected: current.fall_detected || false,
    motion_state: nextMotion,
  };
}

/**
 * Generates an initial map of live vitals for a given list of elders.
 */
export function initializePatientVitals(elders: DemoElder[]): Record<string, DemoVitals> {
  const vitalsMap: Record<string, DemoVitals> = {};
  for (const elder of elders) {
    vitalsMap[elder.id] = getElderBaseline(elder);
  }
  return vitalsMap;
}
