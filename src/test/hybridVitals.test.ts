import {it,expect,vi} from 'vitest';
import {withUshaDemonstrationVitals,USHA_DEVICE_PATIENT_ID,GENERATED_USHA_FIELDS} from '../../server/hybridVitals.js';
import {startDemoTelemetry} from '../../server/demoTelemetry.js';
it('changes only Usha demonstration fields, preserving measured heart rate, fall and hardware timestamp',()=>{
 const raw={elderId:USHA_DEVICE_PATIENT_ID,source:'device',heart_rate:41,fall_detected:true,timestamp:'2026-10-26T00:00:00.000Z',spo2:null};
 const a=withUshaDemonstrationVitals(raw,100000),b=withUshaDemonstrationVitals(raw,110000);
 for(const r of [a,b]){expect(r.heart_rate).toBe(41);expect(r.fall_detected).toBe(true);expect(r.timestamp).toBe(raw.timestamp);expect(r.source).toBe('device');expect(r.simulated_fields).toEqual(GENERATED_USHA_FIELDS);expect(r.spo2).toBeGreaterThan(90);}
 expect(a.spo2).not.toBe(b.spo2);expect(a).toEqual(withUshaDemonstrationVitals(raw,100999));expect(raw.spo2).toBeNull();
});
it('does not invent missing hardware or affect another patient',()=>{const other={elderId:'another',source:'device',spo2:null};expect(withUshaDemonstrationVitals(other)).toBe(other);const demo={elderId:USHA_DEVICE_PATIENT_ID,source:'simulator',heart_rate:80};expect(withUshaDemonstrationVitals(demo)).toBe(demo);expect(withUshaDemonstrationVitals(undefined)).toBeUndefined();});
it('updates each demonstration patient every second and stops cleanly',async()=>{
 vi.useFakeTimers();try{const db={getElderById:vi.fn(async(id)=>({id,medical_conditions:[]})),createVitalsReading:vi.fn(async()=>({}))};const stop=startDemoTelemetry(db,['a','b']);await vi.advanceTimersByTimeAsync(0);expect(db.createVitalsReading).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(1000);expect(db.createVitalsReading).toHaveBeenCalledTimes(4);stop();await vi.advanceTimersByTimeAsync(2000);expect(db.createVitalsReading).toHaveBeenCalledTimes(4);}finally{vi.useRealTimers();}
});
