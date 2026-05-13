import type { DemoElder, DemoVitals, DemoAlert } from '@/store';

export const DEMO_ELDERS: DemoElder[] = [
  {
    id: 'elder-1',
    full_name: 'Usha',
    age: 77,
    medical_conditions: ['Hypertension', 'Type 2 Diabetes', 'Mild Arthritis'],
    language_pref: 'kn',
    connection_status: 'connected',
    battery: 78,
    last_vitals_at: new Date().toISOString(),
    baselines_learned: true,
  },
  {
    id: 'elder-2',
    full_name: 'Lakshmi Devi',
    age: 82,
    medical_conditions: ['Atrial Fibrillation', 'Osteoporosis'],
    language_pref: 'ta',
    connection_status: 'connected',
    battery: 54,
    last_vitals_at: new Date(Date.now() - 120000).toISOString(),
    baselines_learned: true,
  },
  {
    id: 'elder-3',
    full_name: 'Venkatesh Rao',
    age: 71,
    medical_conditions: ['COPD', 'Anxiety'],
    language_pref: 'hi',
    connection_status: 'connected',
    battery: 91,
    last_vitals_at: new Date(Date.now() - 60000).toISOString(),
    baselines_learned: false,
    baseline_day: 3,
  },
];

export const DEMO_VITALS: Record<string, DemoVitals> = {
  'elder-1': {
    heart_rate: 68, systolic_bp: 126, diastolic_bp: 82, spo2: 97,
    stress: 32, hydration: 71, breathing_rate: 16, skin_temp: 36.4,
    shiver_detected: false, panic_detected: false, fall_detected: false,
  },
  'elder-2': {
    heart_rate: 74, systolic_bp: 138, diastolic_bp: 88, spo2: 95,
    stress: 45, hydration: 64, breathing_rate: 18, skin_temp: 36.6,
    shiver_detected: false, panic_detected: false, fall_detected: false,
  },
  'elder-3': {
    heart_rate: 72, systolic_bp: 118, diastolic_bp: 76, spo2: 93,
    stress: 58, hydration: 68, breathing_rate: 20, skin_temp: 36.2,
    shiver_detected: false, panic_detected: false, fall_detected: false,
  },
};

export const DEMO_MEDICATIONS = [
  {
    id: 'med-1', elder_id: 'elder-1', brand_name: 'Glucophage', generic_name: 'Metformin HCl',
    category: 'Antidiabetic', dose_amount: 500, dose_unit: 'mg', frequency: 'Twice daily',
    times: ['08:00', '20:00'], pronunciation_en: 'Met-FOR-min',
    pronunciation_kn: 'ಮೆಟ್-ಫಾರ್-ಮಿನ್', pronunciation_hi: 'मेट-फॉर-मिन', pronunciation_ta: 'மெட்-ஃபார்-மின்',
    pill_description: 'Small white oval tablet', instructions: 'Take with food',
    photo_url: '', active: true,
  },
  {
    id: 'med-2', elder_id: 'elder-1', brand_name: 'Amlodac', generic_name: 'Amlodipine',
    category: 'Antihypertensive', dose_amount: 5, dose_unit: 'mg', frequency: 'Once daily',
    times: ['08:00'], pronunciation_en: 'Am-LOH-di-peen',
    pronunciation_kn: 'ಅಮ್-ಲೋ-ಡಿ-ಪೀನ್', pronunciation_hi: 'अम-लो-डि-पीन', pronunciation_ta: 'அம்-லோ-டி-பீன்',
    pill_description: 'Small white round tablet', instructions: 'Take in the morning',
    photo_url: '', active: true,
  },
  {
    id: 'med-3', elder_id: 'elder-2', brand_name: 'Ecosprin', generic_name: 'Aspirin',
    category: 'Antiplatelet', dose_amount: 75, dose_unit: 'mg', frequency: 'Once daily',
    times: ['09:00'], pronunciation_en: 'AS-pir-in',
    pronunciation_kn: 'ಆಸ್-ಪಿ-ರಿನ್', pronunciation_hi: 'एस-पि-रिन', pronunciation_ta: 'ஆஸ்-பி-ரின்',
    pill_description: 'Small pink round tablet', instructions: 'Take after breakfast',
    photo_url: '', active: true,
  },
];

export const DEMO_HR_HISTORY = Array.from({ length: 120 }, (_, i) => ({
  time: new Date(Date.now() - (120 - i) * 60000).toISOString(),
  hr: 65 + Math.sin(i / 10) * 5 + Math.random() * 3,
  spo2: 96 + Math.sin(i / 15) * 1.5 + Math.random() * 0.5,
  stress: 30 + Math.sin(i / 8) * 10 + Math.random() * 5,
  breathing: 15 + Math.sin(i / 12) * 2 + Math.random(),
}));

export const DEMO_MOOD_HISTORY = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
  score: Math.max(1, Math.min(5, Math.round(3.2 + Math.sin(i / 4) * 1.5 + (Math.random() - 0.5)))),
}));

export const DEMO_ALERTS: DemoAlert[] = [
  {
    id: 'alert-1', elder_name: 'Usha', type: 'high_hr', severity: 'warning',
    message: 'Heart rate elevated to 102 bpm for 5 minutes', time: new Date(Date.now() - 3600000).toISOString(),
    resolved: true,
  },
  {
    id: 'alert-2', elder_name: 'Lakshmi Devi', type: 'missed_med', severity: 'warning',
    message: 'Ecosprin 75mg missed at 9:00 AM', time: new Date(Date.now() - 7200000).toISOString(),
    resolved: false,
  },
];

export function generateVitalsUpdate(base: DemoVitals): DemoVitals {
  return {
    ...base,
    heart_rate: Math.round(base.heart_rate + (Math.random() - 0.5) * 4),
    systolic_bp: Math.round(base.systolic_bp + (Math.random() - 0.5) * 3),
    diastolic_bp: Math.round(base.diastolic_bp + (Math.random() - 0.5) * 2),
    spo2: Math.round((base.spo2 + (Math.random() - 0.5) * 1) * 10) / 10,
    stress: Math.round(base.stress + (Math.random() - 0.5) * 6),
    hydration: Math.round(base.hydration + (Math.random() - 0.5) * 2),
    breathing_rate: Math.round(base.breathing_rate + (Math.random() - 0.5) * 2),
    skin_temp: Math.round((base.skin_temp + (Math.random() - 0.5) * 0.3) * 10) / 10,
  };
}
