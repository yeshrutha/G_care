import {DEMONSTRATION_PATIENT_IDS} from './demonstrationPatients.js';
import {demoReading} from './patientSimulation.js';
import {USHA_DEVICE_PATIENT_ID,GENERATED_USHA_FIELDS} from './hybridVitals.js';
const demonstrationPatients=new Set(DEMONSTRATION_PATIENT_IDS);
export function liveDisplayReading(reading,patient,now=Date.now(),preview=false) {
 if(!patient)return reading;
 const tick=Math.floor(now/1000)*1000;
 if(demonstrationPatients.has(patient.id))return {...reading,...demoReading(patient,tick)};
 const isUsha=patient.id===USHA_DEVICE_PATIENT_ID || (preview && patient.id==='elder-1' && patient.full_name?.trim().toLowerCase()==='usha');
 if(!isUsha)return reading;
 const generated=demoReading(patient,tick);
 const hasHardware=reading?.source==='device';
 return {...reading,elderId:patient.id,source:hasHardware?'device':'simulator',heart_rate:hasHardware?reading.heart_rate:0,fall_detected:hasHardware?reading.fall_detected:false,
  ...Object.fromEntries(GENERATED_USHA_FIELDS.map(field=>[field,generated[field]])),
  measured_fields:hasHardware?['heart_rate','fall_detected']:[],simulated_fields:[...GENERATED_USHA_FIELDS],simulated_at:new Date(tick).toISOString()};
}
