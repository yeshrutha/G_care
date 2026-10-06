export function samplePatientCare(patient) {
  const conditions = (patient.medical_conditions || []).join(' ').toLowerCase();
  const kind = /hypertension|high.?bp/.test(conditions) ? 'blood pressure' : /diabet/.test(conditions) ? 'diabetes' : 'oncology';
  const time = kind === 'oncology' ? '10:00' : kind === 'diabetes' ? '08:00' : '09:00';
  const medication = { id: 'sample-med-' + patient.id, elder_id: patient.id, brand_name: 'Sample ' + kind + ' medication', generic_name: 'Example schedule only', category: 'Sample', dose_amount: 0, dose_unit: 'sample', frequency: 'Once daily', times: [time], instructions: 'Sample reminder for demonstration. Not a prescription; actual medicines and doses must be entered by the treating doctor.', active: true };
  const alarms = [
    { id: 'sample-meal-' + patient.id, elderId: patient.id, title: 'Breakfast reminder', time: '08:30', type: 'food', status: 'Scheduled', notes: 'Sample daily meal reminder.', repeat: 'daily' },
    { id: 'sample-activity-' + patient.id, elderId: patient.id, title: kind === 'oncology' ? 'Rest and comfort check' : 'Daily activity check', time: kind === 'oncology' ? '15:00' : '17:00', type: 'activity', status: 'Scheduled', notes: 'Sample check-in; follow the care plan agreed with the treating team.', repeat: 'daily' },
  ];
  return { medication, alarms, emergency: kind === 'blood pressure' ? 'High blood pressure: 185/115 mmHg' : kind === 'diabetes' ? 'Health emergency: SOS activated, heart rate 128 bpm' : 'Emergency SOS: low SpO₂ 89%, heart rate 128 bpm' };
}
