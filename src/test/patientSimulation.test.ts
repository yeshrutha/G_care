import { describe,it,expect } from 'vitest';
import { demoReading,demoHistory,demoBattery } from '@/lib/patientSimulation.js';
const patients=[{id:'elder-da398d26-e5ae-4529-9842-f7dbaabb2d0e',medical_conditions:['Diabetes']},{id:'elder-c620adff-bc04-4dd0-ac99-20704f00ba37',medical_conditions:['Hypertension']},{id:'elder-c2770349-ccb7-44ae-abf7-598cea661ccb',medical_conditions:['Breast cancer']}];
const now=Date.parse('2026-10-06T15:00:00Z');
describe('Patient-specific simulated telemetry',()=>{
 it('has distinct battery schedules and monthly averages for all three patients',()=>{expect(new Set(patients.map(p=>demoBattery(p,now))).size).toBe(3);const means=patients.map(p=>demoHistory(p,now).reduce((n,r)=>n+r.heart_rate,0)/720);expect(new Set(means).size).toBe(3);});
 it('varies readings over time and preserves explicit simulator provenance',()=>{for(const p of patients){const rows=demoHistory(p,now);expect(rows).toHaveLength(720);expect(new Set(rows.map(r=>r.heart_rate)).size).toBeGreaterThan(5);expect(rows.every(r=>r.elderId===p.id&&r.source==='simulator'&&r.spo2>90&&r.spo2<=100)).toBe(true);expect(demoReading(p,now)).toEqual(demoReading(p,now));}});
 it('models the hypertension scenario with higher, variable BP without requiring hypotension',()=>{const r=demoHistory(patients[1],now);expect(Math.min(...r.map(x=>x.systolic_bp))).toBeGreaterThan(100);expect(Math.max(...r.map(x=>x.systolic_bp))-Math.min(...r.map(x=>x.systolic_bp))).toBeGreaterThan(15);});
});
