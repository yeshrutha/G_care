const clinicalTypes=new Set(['sos','fall','panic','high_hr','low_hr','low_spo2','high_bp','low_bp','vital_abnormal','health_condition','medical_emergency','emergency','shiver','high_temperature','low_temperature']);
export function isDoctorAlert(alert){return clinicalTypes.has(String(alert?.type||'').toLowerCase());}
export function alertVisibleToRole(alert,role){return role!=='doctor'||isDoctorAlert(alert);}
