import { demoReading } from './patientSimulation.js';
export const USHA_DEVICE_PATIENT_ID = 'elder-c2770349-ccb7-44ae-abf7-598cea661ccb';
export const GENERATED_USHA_FIELDS = ['spo2','systolic_bp','diastolic_bp','skin_temp','stress','hydration','breathing_rate','steps','panic_detected','shiver_detected'];
// Never synthesize a heart rate, fall event, or fresh hardware timestamp for Usha.
export function withUshaDemonstrationVitals(reading, now = Date.now()) {
 if (!reading || (reading.elderId || reading.elder_id) !== USHA_DEVICE_PATIENT_ID || reading.source !== 'device') return reading;
 const tick = Math.floor(now / 1000) * 1000;
 const generated = demoReading({id:USHA_DEVICE_PATIENT_ID,medical_conditions:['Breast cancer']}, tick);
 return {...reading,...Object.fromEntries(GENERATED_USHA_FIELDS.map(key=>[key,generated[key]])),
  measured_fields:['heart_rate','fall_detected'], simulated_fields:[...GENERATED_USHA_FIELDS], simulated_at:new Date(tick).toISOString()};
}
