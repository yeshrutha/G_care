import {DEMONSTRATION_PATIENT_IDS} from './demoPatientProfiles.js';
import {demoReading} from '../src/lib/patientSimulation.js';
import {withUshaDemonstrationVitals} from './hybridVitals.js';
const demonstrationPatients=new Set(DEMONSTRATION_PATIENT_IDS);
export function liveDisplayReading(reading,patient,now=Date.now()) {
 if(patient&&demonstrationPatients.has(patient.id))return {...reading,...demoReading(patient,Math.floor(now/1000)*1000)};
 return withUshaDemonstrationVitals(reading,now);
}
