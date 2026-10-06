const key = patientId => 'gcare_watch_appointment_receipts:' + patientId;
export function hasAppointmentReceipt(storage, patientId, appointmentId) {
 try { return JSON.parse(storage.getItem(key(patientId)) || '[]').includes(appointmentId); } catch { return false; }
}
export function recordAppointmentReceipt(storage, patientId, appointmentId) {
 let ids=[];try{ids=JSON.parse(storage.getItem(key(patientId)) || '[]');}catch{}
 storage.setItem(key(patientId),JSON.stringify([...new Set([...ids,appointmentId])].slice(-200)));
}
