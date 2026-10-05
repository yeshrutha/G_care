/**
 * Cross-window and cross-portal real-time synchronization channel.
 * Bridges Watch Simulator, Doctor Portal, Caretaker Dashboard, and Guardian Portal
 * across split screens, multiple browser tabs, or independent windows.
 */

export interface AppointmentBroadcastPayload {
  type: 'APPOINTMENT_SCHEDULED';
  appointmentId?: string;
  elderId: string;
  elderName: string;
  language: string;
  date: string;
  time: string;
  prepAlarmTime: string;
  doctorName: string;
  patientMessage: string;
  spokenText: string;
  kannadaMessage?: string; // Backwards compatibility for Kannada watch listeners
  englishMessage: string;
  alertId?: string;
  timestamp: number;
}

export interface AlertActionBroadcastPayload {
  type: 'ALERT_RESOLVED' | 'ALERT_ACKNOWLEDGED' | 'SOS_TRIGGERED' | 'ALERTS_CLEARED';
  id?: string;
  elderId?: string;
  elderName?: string;
  mode?: 'all' | 'resolved';
  alert?: any;
  timestamp: number;
}

export type GcareBroadcastMessage = AppointmentBroadcastPayload | AlertActionBroadcastPayload;

const CHANNEL_NAME = 'gcare_system_sync_channel';
const STORAGE_KEY = 'gcare_system_cross_event';

let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    broadcastChannel = null;
  }
}

/**
 * Parses time string (24h or 12h) to hours (0-23) and minutes (0-59).
 */
export function parseTimeTo24H(timeStr: string): { h: number; m: number } {
  const clean = (timeStr || '10:00').trim();
  const isPM = /pm/i.test(clean);
  const isAM = /am/i.test(clean);
  const timeOnly = clean.replace(/[^\d:]/g, '');
  const parts = timeOnly.split(':');
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);

  if (isNaN(h)) h = 10;
  if (isNaN(m)) m = 0;

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  return { h: Math.min(23, Math.max(0, h)), m: Math.min(59, Math.max(0, m)) };
}

/**
 * Formats time string into 12-hour AM/PM format (e.g. "10:30 AM").
 */
export function formatTime12Hour(timeStr: string): string {
  const { h, m } = parseTimeTo24H(timeStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Calculates a time string (HH:MM in 24h format) that is `minutesBefore` minutes prior to `timeStr`.
 * For example: calculateMinutesBefore('10:30', 60) -> '09:30'
 */
export function calculateMinutesBefore(timeStr: string, minutesBefore: number = 60): string {
  try {
    const { h, m } = parseTimeTo24H(timeStr);
    let totalMinutes = h * 60 + m - minutesBefore;
    if (totalMinutes < 0) totalMinutes += 24 * 60;

    const finalH = Math.floor(totalMinutes / 60) % 24;
    const finalM = totalMinutes % 60;
    return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
  } catch {
    return '09:00';
  }
}

/**
 * Formats a date string (e.g. "2026-10-12") into a natural language representation.
 */
export function formatAppointmentDate(dateStr: string, lang: string = 'en'): string {
  try {
    const parts = (dateStr || '').split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthsKn = ['ಅಕ್ಟೋಬರ್', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'];
      const monthsHi = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
      const monthsTa = ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'];

      const norm = (lang || 'en').toLowerCase().trim();
      if (norm.startsWith('kn') || norm === 'kannada') {
        const knMonth = (monthIdx >= 0 && monthIdx < 12) ? monthsKn[monthIdx] : parts[1];
        return `${day} ${knMonth} ${year}`;
      }
      if (norm.startsWith('hi') || norm === 'hindi') {
        const hiMonth = (monthIdx >= 0 && monthIdx < 12) ? monthsHi[monthIdx] : parts[1];
        return `${day} ${hiMonth} ${year}`;
      }
      if (norm.startsWith('ta') || norm === 'tamil') {
        const taMonth = (monthIdx >= 0 && monthIdx < 12) ? monthsTa[monthIdx] : parts[1];
        return `${day} ${taMonth} ${year}`;
      }
      const enMonth = (monthIdx >= 0 && monthIdx < 12) ? monthsEn[monthIdx] : parts[1];
      return `${day} ${enMonth} ${year}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export interface AppointmentMessageResult {
  spokenText: string;
  displayText: string;
  prepNotes: string;
  speechLang: string;
  language: string;
  formattedDate: string;
  formattedTime: string;
  formattedPrepTime: string;
}

/**
 * Generates natural spoken audio and display text in the patient's preferred language.
 * Supports Kannada ('kn'), Hindi ('hi'), Tamil ('ta'), and English ('en').
 */
export function generateAppointmentMultilingualMessage(
  elderName: string,
  dateStr: string,
  timeStr: string,
  doctorName: string,
  prepTimeStr: string,
  preferredLanguage: string = 'en'
): AppointmentMessageResult {
  const normLang = (preferredLanguage || 'en').toLowerCase().trim();
  const safeDoctor = doctorName || 'Dr. Ramesh Kumar';
  const safeElder = elderName || 'Patient';

  const formattedDate = formatAppointmentDate(dateStr, normLang);
  const formattedTime = formatTime12Hour(timeStr);
  const formattedPrepTime = formatTime12Hour(prepTimeStr);

  if (normLang.startsWith('kn') || normLang === 'kannada') {
    const spokenText = `${safeElder} ಅವರೇ, ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ನಿಗದಿಯಾಗಿದೆ. ದಿನಾಂಕ ${formattedDate} ರಂದು, ${formattedTime} ಗಂಟೆಗೆ ${safeDoctor} ಅವರೊಂದಿಗೆ ತಪಾಸಣೆ ಇರುತ್ತದೆ. ಆಸ್ಪತ್ರೆಗೆ ತೆರಳಲು ${formattedPrepTime} ಕ್ಕೆ, ಅರವತ್ತು ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ ಅಲಾರಾಂ ಹೊಂದಿಸಲಾಗಿದೆ.`;
    const displayText = `ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ${formattedDate} ರಂದು ${formattedTime} ಕ್ಕೆ ${safeDoctor} ಅವರೊಂದಿಗೆ ನಿಗದಿಯಾಗಿದೆ. ಆಸ್ಪತ್ರೆ ತಯಾರಿ ಅಲಾರಾಂ: ${formattedPrepTime} (60 ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ).`;
    const prepNotes = `ಆಸ್ಪತ್ರೆ ತಯಾರಿ: ${safeDoctor} ಅವರೊಂದಿಗೆ ${formattedTime} ಕ್ಕೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್. 60 ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ ಹೊರಡಿ.`;
    return {
      spokenText,
      displayText,
      prepNotes,
      speechLang: 'kn-IN',
      language: 'kn',
      formattedDate,
      formattedTime,
      formattedPrepTime,
    };
  }

  if (normLang.startsWith('hi') || normLang === 'hindi') {
    const spokenText = `${safeElder} जी, आपका अपॉइंटमेंट तय हो गया है। तारीख ${formattedDate} को, ${formattedTime} बजे ${safeDoctor} के साथ जांच होगी। अस्पताल जाने के लिए ${formattedPrepTime} बजे, साठ मिनट पहले अलार्म सेट किया गया है।`;
    const displayText = `आपका अपॉइंटमेंट ${formattedDate} को ${formattedTime} बजे ${safeDoctor} के साथ निर्धारित किया गया है। अस्पताल तैयारी अलार्म: ${formattedPrepTime} (60 मिनट पहले)।`;
    const prepNotes = `अस्पताल तैयारी: ${safeDoctor} के साथ ${formattedTime} बजे अपॉइंटमेंट। 60 मिनट पहले निकलें।`;
    return {
      spokenText,
      displayText,
      prepNotes,
      speechLang: 'hi-IN',
      language: 'hi',
      formattedDate,
      formattedTime,
      formattedPrepTime,
    };
  }

  if (normLang.startsWith('ta') || normLang === 'tamil') {
    const spokenText = `${safeElder} அவர்களே, உங்கள் சந்திப்பு பதிவு செய்யப்பட்டுள்ளது. தேதி ${formattedDate} அன்று, ${formattedTime} மணிக்கு ${safeDoctor} அவர்களுடன் பரிசோதனை இருக்கும். மருத்துவமனைக்குச் செல்ல ${formattedPrepTime} மணிக்கு, அறுபது நிமிடங்களுக்கு முன் அலாரம் அமைக்கப்பட்டுள்ளது.`;
    const displayText = `உங்கள் சந்திப்பு ${formattedDate} அன்று ${formattedTime} மணிக்கு ${safeDoctor} அவர்களுடன் பதிவு செய்யப்பட்டுள்ளது. மருத்துவமனை தயாரிப்பு அலாரம்: ${formattedPrepTime} (60 நிமிடங்களுக்கு முன்).`;
    const prepNotes = `மருத்துவமனை தயாரிப்பு: ${safeDoctor} உடன் ${formattedTime} மணிக்கு சந்திப்பு. 60 நிமிடங்களுக்கு முன் புறப்படவும்.`;
    return {
      spokenText,
      displayText,
      prepNotes,
      speechLang: 'ta-IN',
      language: 'ta',
      formattedDate,
      formattedTime,
      formattedPrepTime,
    };
  }

  // English default
  const spokenText = `Hello ${safeElder}, your appointment has been booked with ${safeDoctor} for ${formattedDate} at ${formattedTime}. A preparation alarm has been set for ${formattedPrepTime}, exactly sixty minutes before your appointment, so you can get ready and leave early.`;
  const displayText = `Your appointment has been booked for ${formattedDate} at ${formattedTime} with ${safeDoctor}. Hospital prep alarm: ${formattedPrepTime} (60 minutes prior).`;
  const prepNotes = `Hospital checkup preparation: Appointment with ${safeDoctor} at ${formattedTime} on ${formattedDate}. Leave 60 minutes early.`;
  return {
    spokenText,
    displayText,
    prepNotes,
    speechLang: 'en-IN',
    language: 'en',
    formattedDate,
    formattedTime,
    formattedPrepTime,
  };
}

/**
 * Backwards-compatibility wrapper for Kannada appointment messages.
 */
export function generateAppointmentKannadaMessage(
  elderName: string,
  dateStr: string,
  timeStr: string,
  doctorName: string,
  prepTimeStr: string
): { spokenText: string; displayText: string; prepNotes: string } {
  const result = generateAppointmentMultilingualMessage(elderName, dateStr, timeStr, doctorName, prepTimeStr, 'kn');
  return {
    spokenText: result.spokenText,
    displayText: result.displayText,
    prepNotes: result.prepNotes,
  };
}

/**
 * Broadcasts a message across all open tabs, windows, and stores.
 */
export function broadcastGcareMessage(msg: GcareBroadcastMessage) {
  if (typeof window === 'undefined') return;

  // 1. Native BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(msg);
    } catch {}
  }

  // 2. LocalStorage storage event (fires in other browser windows/tabs)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(msg));
  } catch {}

  // 3. Local CustomEvent (fires in the current window)
  try {
    window.dispatchEvent(new CustomEvent('gcare:cross-event', { detail: msg }));
  } catch {}
}

/**
 * Subscribes to cross-window broadcast messages.
 */
export function subscribeToGcareBroadcast(handler: (msg: GcareBroadcastMessage) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onBroadcastMessage = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object' && event.data.type) {
      handler(event.data as GcareBroadcastMessage);
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed && typeof parsed === 'object' && parsed.type) {
          handler(parsed as GcareBroadcastMessage);
        }
      } catch {}
    }
  };

  const onCustomEvent = (event: Event) => {
    const custom = event as CustomEvent;
    if (custom.detail && typeof custom.detail === 'object' && custom.detail.type) {
      handler(custom.detail as GcareBroadcastMessage);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', onBroadcastMessage);
  }
  window.addEventListener('storage', onStorage);
  window.addEventListener('gcare:cross-event', onCustomEvent);

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', onBroadcastMessage);
    }
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('gcare:cross-event', onCustomEvent);
  };
}
