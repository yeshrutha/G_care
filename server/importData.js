import { saveReportFile } from './reportFiles.js';
import crypto from 'node:crypto';
import { getCanonicalAnomalyType, getAlertEpisodeKey, isPhysiologicalEpisode } from '../src/lib/alertEpisodeIdentity.js';
const aliases = { passwordHash:'password_hash', createdAt:'created_at', ownerId:'owner_id', elderId:'elder_id', doctorId:'doctor_id', doctorName:'doctor_name', fileUrl:'file_url', fileName:'file_name', fileData:'file_data', fileType:'file_type', fileSize:'file_size', appointmentId:'appointment_id', appointmentDate:'appointment_date', appointmentTime:'appointment_time', isOneHourReminder:'is_one_hour_reminder', appointmentDetails:'appointment_details', userId:'user_id', entityId:'entity_id', entityType:'entity_type' };
const sources = [['users','users'],['elders','elders'],['medications','medications'],['alarms','alarms'],['vitals_readings','vitalsReadings'],['alerts','alerts'],['clinical_notes','clinicalNotes'],['reports','reports'],['audit_logs','auditLogs']];
export async function importData(pool, source) {
 const digest = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
 const counts = {}; const data = structuredClone(source);
 // Only confirmed simultaneous open physiological duplicates are closed; keep their records.
 const active = new Map(); let duplicatesClosed = 0;
 for (const alert of [...(data.alerts || [])].sort((a,b) => new Date(b.time)-new Date(a.time))) {
  if (!isPhysiologicalEpisode(alert)) continue;
  alert.anomaly_type = getCanonicalAnomalyType(alert);
  if (alert.resolved || alert.episode_recovered) continue;
  const key = getAlertEpisodeKey(alert);
  if (active.has(key)) {
    if (alert.episode_recovered !== false || active.get(key).episode_recovered !== false) throw new Error('Ambiguous legacy alert duplicates require review before import. Source history has not been changed.');
    alert.resolved = true; alert.episode_recovered = true; duplicatesClosed++;
  } else active.set(key, alert);
 }
 const client=await pool.connect();
 try {
  await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(71942682)');
  if ((await client.query('SELECT 1 FROM data_imports WHERE source_digest=$1',[digest])).rows.length) { await client.query('COMMIT'); return { alreadyImported:true }; }
  for (const [table,key] of sources) {
   const columns = (await client.query('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[table])).rows;
   counts[table] = 0;
   for (const original of data[key] || []) {
    const row = {}; for (const [name,value] of Object.entries(original)) { const col=aliases[name] || name; const info=columns.find(c=>c.column_name===col); if (info && value !== undefined) row[col]=info.data_type==='jsonb' ? JSON.stringify(value) : value; }
    if (table === 'reports' && row.file_data && !(await client.query('SELECT 1 FROM reports WHERE id=$1',[row.id])).rows.length) { row.file_path=await saveReportFile(row.file_data); row.file_data=null; }
    if (table === 'users') row.email=String(row.email).trim().toLowerCase();
    const keys=Object.keys(row); const result=await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT DO NOTHING`,Object.values(row)); counts[table]+=result.rowCount;
    if (row.id && !(await client.query(`SELECT 1 FROM ${table} WHERE id=$1`,[row.id])).rows.length) throw new Error('Import conflict: a source identity is already used by another account. Nothing imported.');
   }
  }
  for (const user of data.users || []) for (const id of user.assignedElderIds || []) await client.query('INSERT INTO user_elders(user_id,elder_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[user.id,id]);
  for (const token of data.revokedTokens || []) await client.query('INSERT INTO revoked_tokens(token_id) VALUES ($1) ON CONFLICT DO NOTHING',[token]);
  await client.query('INSERT INTO medication_schedules(medication_id,time,position) SELECT m.id,t.time,t.ordinality-1 FROM medications m CROSS JOIN LATERAL jsonb_array_elements_text(m.times) WITH ORDINALITY AS t(time,ordinality) ON CONFLICT DO NOTHING');
  // Existing appointments are alarm-backed; preserve their stable IDs and metadata.
  await client.query("INSERT INTO appointments(id,elder_id,doctor_id,appointment_date,appointment_time,doctor_name,notes) SELECT DISTINCT ON(appointment_id) appointment_id,elder_id,owner_id,appointment_date,COALESCE(appointment_time,time),doctor_name,notes FROM alarms WHERE appointment_id IS NOT NULL AND appointment_date IS NOT NULL ORDER BY appointment_id,is_one_hour_reminder ON CONFLICT DO NOTHING");
  await client.query('INSERT INTO vitals_latest SELECT DISTINCT ON(elder_id) * FROM vitals_readings ORDER BY elder_id,timestamp DESC ON CONFLICT(elder_id) DO NOTHING');
  counts.duplicatesClosed=duplicatesClosed;
  await client.query('INSERT INTO data_imports(source_digest,counts) VALUES ($1,$2)',[digest,JSON.stringify(counts)]);
  await client.query('COMMIT'); return counts;
 } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
