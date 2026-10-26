import { demoReading } from '../src/lib/patientSimulation.js';
export { demoReading };
export function startDemoTelemetry(db, patientIds, onError=()=>{}) {
 let stopped=false;let active=false;
 async function tick(){
  if(stopped||active)return;active=true;
  try {
   const results=await Promise.allSettled(patientIds.map(async id=>{
    const patient=await db.getElderById(id);
    if(patient&&!stopped)await db.createVitalsReading(demoReading(patient));
   }));
   for(const result of results)if(result.status==='rejected')onError(result.reason);
  } finally {active=false;}
 }
 const timer=setInterval(tick,1000);timer.unref?.();void tick();
 return ()=>{stopped=true;clearInterval(timer);};
}
