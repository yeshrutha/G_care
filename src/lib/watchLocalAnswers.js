export function answerWatchQuestion(message, vitals, medications=[], alarms=[]) {
 const kn=/[\u0C80-\u0CFF]/.test(message),hi=/[\u0900-\u097F]/.test(message);
 const text=message.toLowerCase();
 let value,label;
 if(/heart.?rate|pulse|ಹಾರ್ಟ್|ಹೃದಯ|ನಾಡಿ|हार्ट|हृदय|धड़कन/.test(text)){value=vitals?.heart_rate;label=kn?'ನಿಮ್ಮ ಹೃದಯ ಬಡಿತ':hi?'आपकी हृदय गति':'Your heart rate';if(value!=null)return label+' '+value+(kn?' ಪ್ರತಿ ನಿಮಿಷಕ್ಕೆ.':hi?' प्रति मिनट।':' bpm.');}
 if(/blood.?pressure|\bbp\b|ರಕ್ತದೊತ್ತಡ|ಬಿಪಿ|ಬಿ ಪಿ|बीपी|रक्तचाप/.test(text)){if(vitals?.systolic_bp!=null&&vitals?.diastolic_bp!=null)return (kn?'ನಿಮ್ಮ ರಕ್ತದೊತ್ತಡ ':hi?'आपका रक्तचाप ':'Your blood pressure ')+vitals.systolic_bp+'/'+vitals.diastolic_bp+' mmHg.';}
 if(/spo2|oxygen|ಆಮ್ಲಜನಕ|ಆಕ್ಸಿಜನ್|ऑक्सीजन/.test(text)){if(vitals?.spo2!=null)return (kn?'ನಿಮ್ಮ ಆಮ್ಲಜನಕ ಮಟ್ಟ ':hi?'आपका ऑक्सीजन स्तर ':'Your oxygen level ')+vitals.spo2+'%.';}
 if(/medication|medicines|my pills|ಔಷಧ|ಮದ್ದು|ದವಾಯಿ|दवा|दवाई/.test(text))return medications.length?(kn?'ನಿಮ್ಮ ವಾಚ್‌ನಲ್ಲಿರುವ ಔಷಧ ವೇಳಾಪಟ್ಟಿ: ':hi?'आपकी घड़ी में दवा का समय: ':'Your watch medication schedule: ')+medications.map(m=>m.brand_name+' — '+(m.times||[]).join(', ')).join('; '):(kn?'ವಾಚ್‌ನಲ್ಲಿ ಔಷಧ ವೇಳಾಪಟ್ಟಿ ಇಲ್ಲ.':hi?'घड़ी में दवा का समय दर्ज नहीं है।':'No medication schedule is saved on this watch.');
 if(/appointment|reminders|alarms|ಅಪಾಯಿಂಟ್|ಅಪಾಯಿಂಟ್ಮೆಂಟ್|ಅಲಾರಂ|ನೆನಪು|अपॉइंटमेंट|अलार्म/.test(text))return alarms.length?(kn?'ನಿಮ್ಮ ವಾಚ್‌ನ ವೇಳಾಪಟ್ಟಿ: ':hi?'आपकी घड़ी का समय: ':'Your watch schedule: ')+alarms.map(a=>a.title+' — '+(a.appointmentDate||'')+' '+a.time).join('; '):(kn?'ವಾಚ್‌ನಲ್ಲಿ ಅಲಾರಂ ವೇಳಾಪಟ್ಟಿ ಇಲ್ಲ.':hi?'घड़ी में कोई अलार्म दर्ज नहीं है।':'No alarms are saved on this watch.');
 if(label)return kn?'ವಾಚ್‌ನಲ್ಲಿ ಈಗ ಈ ಅಳತೆ ಲಭ್ಯವಿಲ್ಲ.':hi?'अभी घड़ी में यह माप उपलब्ध नहीं है।':'This measurement is currently unavailable on the watch.';
 return null;
}
