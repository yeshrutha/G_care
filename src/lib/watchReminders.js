export function buildWatchReminders(data, patient) {
 const meds=(data.medications||[]).filter(m=>m.elder_id===patient.id && m.active!==false).flatMap(m=>(m.times||[]).filter(Boolean).map((time,index)=>({id:'med-'+m.id+'-'+index,elderId:patient.id,elderName:patient.full_name,type:'medication',title:m.brand_name,pillName:m.brand_name,dosage:m.dose_amount>0?m.dose_amount+' '+m.dose_unit:'',photo:m.photo||'',time,repeat:'daily',verified:false})));
 const alarms=(data.alarms||[]).filter(a=>a.elderId===patient.id && a.status!=='Paused').map(a=>({...a,id:'alarm-'+a.id,elderName:patient.full_name,repeat:a.repeat||'daily',verified:false}));
 return [...meds,...alarms];
}
