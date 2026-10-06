import crypto from 'node:crypto';
import {dbService} from './db.js';
export async function saveReminderResponse(user,body){
 const data=await dbService.filterDashboardForUser(user);const patient=data.elders.find(p=>p.id===body.elderId);
 if(!patient)throw Object.assign(new Error('Patient assignment required.'),{statusCode:403});let title,type;
 for(const m of data.medications||[])for(const [i,time] of (m.times||[]).entries())if(m.elder_id===body.elderId&&m.active!==false&&body.reminderId==='med-'+m.id+'-'+i){title=m.brand_name;type='medication_taken';}
 for(const a of data.alarms||[])if(a.elderId===body.elderId&&body.reminderId==='alarm-'+a.id){title=a.title;type=a.type==='medication'?'medication_taken':'reminder_completed';}
 if(!title)throw Object.assign(new Error('Saved reminder not found.'),{statusCode:404});
 const result=await dbService.acknowledgeReminder(user,body);
 const id='response-'+crypto.createHash('sha256').update(JSON.stringify([body.elderId,body.reminderId,body.occurrenceDate])).digest('hex').slice(0,32);
 await dbService.createAlert(user,{id,elder_id:body.elderId,type,severity:'info',message:patient.full_name+' '+(type==='medication_taken'?'confirmed medicine taken: ':'completed reminder: ')+title+' ('+body.occurrenceDate+').',resolved:false,time:new Date().toISOString()});return result;
}
