// Synthetic demonstration inputs, not disease predictions or measurements.
export function demoReading(patient, now=Date.now()) {
 const conditions=(patient.medical_conditions||[]).join(' ').toLowerCase();
 const hypertension=/hypertension|high\s*bp/.test(conditions);const diabetes=/diabet/.test(conditions);
 const phase=Array.from(patient.id).reduce((n,c)=>n+c.charCodeAt(0),0)%31;
 const wave=Math.sin(now/11000+phase);const slow=Math.sin(now/19000+phase);
 return {elderId:patient.id,source:'simulator',timestamp:new Date(now).toISOString(),heart_rate:Math.round(74+wave*3),systolic_bp:Math.round((hypertension?132:120)+slow*4),diastolic_bp:Math.round((hypertension?84:78)+wave*2),spo2:Math.round((97.5+slow*.4)*10)/10,stress:Math.round((hypertension?34:28)+wave*4),hydration:Math.round((diabetes?72:78)+slow*2),breathing_rate:Math.round(16+wave),skin_temp:Math.round((36.5+slow*.1)*10)/10,fall_detected:false,shiver_detected:false,panic_detected:false};
}
export function startDemoTelemetry(db, patientIds, onError=()=>{}) {
 let stopped=false;let active=false;let timer;
 async function tick(){if(stopped||active)return;active=true;try{for(const id of patientIds){if(stopped)break;const patient=await db.getElderById(id);if(patient)await db.createVitalsReading(demoReading(patient));}}catch(e){onError(e);}finally{active=false;}}
 timer=setInterval(tick,5000);timer.unref?.();void tick();
 return ()=>{stopped=true;clearInterval(timer);};
}
