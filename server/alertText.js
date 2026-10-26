export function patientAlertMessage(message, elderId, patientName) {
 if (typeof message !== 'string' || !elderId || !patientName?.trim()) return message;
 return message.split('for elder '+elderId).join('for '+patientName.trim());
}
