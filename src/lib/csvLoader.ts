export interface VitalsRow {
  timestamp: string;
  heart_rate: number;
  systolic_bp: number;
  diastolic_bp: number;
  spo2: number;
  stress: number;
  hydration: number;
  breathing_rate: number;
  skin_temp: number;
  steps: number;
  fall_detected: boolean;
  panic_detected: boolean;
  shiver_detected: boolean;
}

let cachedData: VitalsRow[] | null = null;

export async function loadVitalsCSV(): Promise<VitalsRow[]> {
  if (cachedData) return cachedData;

  const res = await fetch('/datasets/vitals_demo.csv');
  const text = await res.text();
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');

  cachedData = lines.slice(1).map(line => {
    const vals = line.split(',');
    return {
      timestamp: vals[0],
      heart_rate: parseFloat(vals[1]),
      systolic_bp: parseFloat(vals[2]),
      diastolic_bp: parseFloat(vals[3]),
      spo2: parseFloat(vals[4]),
      stress: parseFloat(vals[5]),
      hydration: parseFloat(vals[6]),
      breathing_rate: parseFloat(vals[7]),
      skin_temp: parseFloat(vals[8]),
      steps: parseInt(vals[9]),
      fall_detected: vals[10] === '1',
      panic_detected: vals[11] === '1',
      shiver_detected: vals[12] === '1',
    };
  });

  return cachedData;
}

export function getLatestVitals(data: VitalsRow[]): VitalsRow {
  return data[data.length - 1];
}

export function getHourlyData(data: VitalsRow[], hours: number = 24): VitalsRow[] {
  const cutoff = data.length - hours * 60;
  const filtered = data.slice(Math.max(0, cutoff));
  // Downsample to 1 per 10 minutes
  return filtered.filter((_, i) => i % 10 === 0);
}

export function getWeeklyAverages(data: VitalsRow[]): Record<string, { avg_hr: number; avg_bp: number; avg_spo2: number; avg_stress: number; total_steps: number }> {
  const byDay: Record<string, VitalsRow[]> = {};
  data.forEach(row => {
    const day = row.timestamp.split('T')[0];
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(row);
  });

  const result: Record<string, any> = {};
  Object.entries(byDay).forEach(([day, rows]) => {
    result[day] = {
      avg_hr: Math.round(rows.reduce((s, r) => s + r.heart_rate, 0) / rows.length),
      avg_bp: Math.round(rows.reduce((s, r) => s + r.systolic_bp, 0) / rows.length),
      avg_spo2: Math.round(rows.reduce((s, r) => s + r.spo2, 0) / rows.length * 10) / 10,
      avg_stress: Math.round(rows.reduce((s, r) => s + r.stress, 0) / rows.length),
      total_steps: rows.reduce((s, r) => s + r.steps, 0),
    };
  });
  return result;
}

export function getMonthlyAverages(data: VitalsRow[]) {
  const all = data;
  if (all.length === 0) return null;
  return {
    avg_hr: Math.round(all.reduce((s, r) => s + r.heart_rate, 0) / all.length),
    avg_bp_sys: Math.round(all.reduce((s, r) => s + r.systolic_bp, 0) / all.length),
    avg_bp_dia: Math.round(all.reduce((s, r) => s + r.diastolic_bp, 0) / all.length),
    avg_spo2: Math.round(all.reduce((s, r) => s + r.spo2, 0) / all.length * 10) / 10,
    avg_stress: Math.round(all.reduce((s, r) => s + r.stress, 0) / all.length),
    total_steps: all.reduce((s, r) => s + r.steps, 0),
    fall_count: all.filter(r => r.fall_detected).length,
    panic_count: all.filter(r => r.panic_detected).length,
  };
}
