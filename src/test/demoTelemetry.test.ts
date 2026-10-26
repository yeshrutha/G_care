import {describe,it,expect} from 'vitest';
import {demoReading} from '../../server/demoTelemetry.js';
describe('explicit synthetic patient telemetry',()=>{
 it('uses only supplied patient ids and labels readings simulated',()=>{const v=demoReading({id:'real-owner-patient',medical_conditions:['Breast cancer']},10000);expect(v.elderId).toBe('real-owner-patient');expect(v.source).toBe('simulator');expect(v.fall_detected).toBe(false);});
 it('varies over time and distinguishes hypertension demonstration inputs',()=>{const p={id:'patient-b',medical_conditions:['Hypertension','High BP']};const a=demoReading(p,10000);const b=demoReading(p,30000);expect(a.timestamp).not.toBe(b.timestamp);expect(a).not.toEqual(b);expect(a.systolic_bp).toBeGreaterThan(demoReading({...p,medical_conditions:[]},10000).systolic_bp);});
});

import { DEMONSTRATION_PATIENT_IDS } from '../../server/demoPatientProfiles.js';
it('keeps the nine extra profiles and two demonstration patients separate from Usha hardware',()=>{expect(DEMONSTRATION_PATIENT_IDS).toHaveLength(11);expect(new Set(DEMONSTRATION_PATIENT_IDS).size).toBe(11);expect(DEMONSTRATION_PATIENT_IDS.filter(id=>id.startsWith('demo-extra-'))).toHaveLength(9);expect(DEMONSTRATION_PATIENT_IDS).not.toContain('elder-c2770349-ccb7-44ae-abf7-598cea661ccb');});
