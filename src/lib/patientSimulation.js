// Explicit demo scenarios, not disease predictions or clinical measurements.
export function patientSeed(patient) { return Array.from(patient.id || '').reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,17); }
export function demoReading(patient,now=Date.now()) {
 const conditions=(patient.medical_conditions||[]).join(' ').toLowerCase();
 const hypertension=/hypertension|high\s*bp/.test(conditions),diabetes=/diabet/.test(conditions),cancer=/cancer/.test(conditions);
 const seed=patientSeed(patient),phase=(seed%997)/37;
 const wave=Math.sin(now/4300+phase),slow=Math.sin(now/13000+phase),day=Math.sin(now/86400000*2*Math.PI+phase),trend=Math.sin(now/345600000+phase);
 // Alternating display precision prevents rounded demonstration values appearing frozen.
 const second=Math.floor(now/1000), parity=((second+seed)%2+2)%2;
 const integer=value=>2*Math.round(value/2)+parity;
 const decimal=value=>(2*Math.round(value*10/2)+parity)/10;
 const clock=new Date(now);const secondsToday=clock.getHours()*3600+clock.getMinutes()*60+clock.getSeconds();
 const hrBase=(cancer?82:diabetes?75:70)+(seed%7);
 return {elderId:patient.id,source:'simulator',timestamp:new Date(now).toISOString(),heart_rate:integer(hrBase+wave*4+day*3+trend*4),systolic_bp:integer((hypertension?146:cancer?112:121)+slow*(hypertension?12:6)+day*4+trend*5),diastolic_bp:integer((hypertension?90:cancer?72:79)+wave*3+trend*3),spo2:decimal(97.4+(seed%5)*.1+slow*.5),stress:integer((cancer?39:hypertension?34:28)+wave*5+trend*6),hydration:integer((diabetes?71:cancer?73:79)+slow*3+trend*3),breathing_rate:integer((cancer?18:16)+wave),skin_temp:decimal(36.4+(seed%4)*.1+slow*.15),steps:Math.max(0,Math.round(((cancer?1800:diabetes?3400:4200)+trend*650)*secondsToday/86400)),fall_detected:false,shiver_detected:false,panic_detected:false};
}
export function demoBattery(patient,now=Date.now()) {const seed=patientSeed(patient);return Math.round(100-((now/3600000+seed%57)%(42+seed%19))/(42+seed%19)*80);}
export function demoHistory(patient,now=Date.now()) {const end=Math.floor(now/3600000)*3600000;return Array.from({length:30*24},(_,i)=>{const r=demoReading(patient,end-(30*24-1-i)*3600000);return {...r,steps:new Date(r.timestamp).getHours()===23?r.steps:0};});}
