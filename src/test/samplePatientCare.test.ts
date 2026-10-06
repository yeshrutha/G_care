import {describe,it,expect} from 'vitest';
import {samplePatientCare} from '../lib/samplePatientCare.js';
describe('Patient-specific demonstration schedules',()=>{
 it('keeps every sample record attached to its own patient and varies emergency scenarios',()=>{
 const patients=[{id:'usha',medical_conditions:['Breast cancer']},{id:'shekar',medical_conditions:['Hypertension']},{id:'lakshmi',medical_conditions:['Diabetes']}];
 const samples=patients.map(samplePatientCare);
 samples.forEach((s,i)=>{expect(s.medication.elder_id).toBe(patients[i].id);expect(s.medication.instructions).toContain('Not a prescription');s.alarms.forEach(a=>expect(a.elderId).toBe(patients[i].id));});
 expect(new Set(samples.map(s=>s.medication.id)).size).toBe(3);
 expect(new Set(samples.map(s=>s.emergency)).size).toBe(3);
 expect(samples[1].emergency).toContain('185/115');
 });
});