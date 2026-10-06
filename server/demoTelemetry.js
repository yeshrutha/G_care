import { demoReading } from '../src/lib/patientSimulation.js';
export { demoReading };
export function startDemoTelemetry(db, patientIds, onError=()=>{}) {
 let stopped=false;let active=false;let timer;
 async function tick(){if(stopped||active)return;active=true;try{for(const id of patientIds){if(stopped)break;const patient=await db.getElderById(id);if(patient)await db.createVitalsReading(demoReading(patient));}}catch(e){onError(e);}finally{active=false;}}
 timer=setInterval(tick,5000);timer.unref?.();void tick();
 return ()=>{stopped=true;clearInterval(timer);};
}
