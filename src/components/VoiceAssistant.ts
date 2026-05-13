import { DEMO_MEDICATIONS } from '@/lib/demoData';

export type RegisteredLanguage = 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'ml';
export type SupportedLanguage = 'en-IN' | 'hi-IN' | 'kn-IN' | 'ta-IN' | 'te-IN' | 'ml-IN';
export type AssistantActionType = 'chat' | 'reminder' | 'youtube';

export interface MedicationContext {
  id: string;
  name: string;
  genericName?: string;
  times: string[];
  icon?: 'medicine';
}

export interface ReminderItem {
  id: string;
  title: string;
  message: string;
  timeLabel: string;
  dueAt: string;
  icon: 'medicine';
  source: 'voice' | 'medication';
  triggered: boolean;
  language: SupportedLanguage;
}

export interface YoutubeAction {
  type: 'youtube';
  query: string;
  url: string;
}

export interface VoiceCommandResult {
  transcript: string;
  responseText: string;
  responseLanguage: SupportedLanguage;
  actionType: AssistantActionType;
  reminder?: ReminderItem;
  action?: YoutubeAction;
}

interface LanguageConfig {
  recognitionLang: string;
  synthesisLang: string;
  locale: string;
  shortCode: RegisteredLanguage;
  emptyPrompt: string;
  reminderPrefix: string;
  genericReminderTitle: string;
  genericReminderMessage: (timeLabel: string) => string;
  namedReminderMessage: (name: string, timeLabel: string) => string;
  nextMedicationMessage: (name: string, timeLabel: string) => string;
  heardPrompt: string;
  fallbackHelp: string;
  youtubeOpening: (query: string) => string;
  greeting: string;
  howAreYou: string;
  thanks: string;
  assistantIdentity: string;
  capabilityMessage: string;
  joke: string;
  wellbeingAdvice: string;
  dateLabel: string;
  timeLabel: string;
  noExactAnswer: (transcript: string) => string;
  micUnavailable: string;
  micPermission: string;
  voiceError: string;
  noSpeech: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const REGISTERED_TO_SUPPORTED_LANGUAGE: Record<RegisteredLanguage, SupportedLanguage> = {
  en: 'en-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  ml: 'ml-IN',
};

const LANGUAGE_CONFIG: Record<SupportedLanguage, LanguageConfig> = {
  'en-IN': {
    recognitionLang: 'en-IN',
    synthesisLang: 'en-IN',
    locale: 'en-IN',
    shortCode: 'en',
    emptyPrompt: 'Tap the mic and speak.',
    reminderPrefix: 'Okay, ',
    genericReminderTitle: 'Medicine reminder',
    genericReminderMessage: (timeLabel) => `I will remind you to take your medicine at ${timeLabel}.`,
    namedReminderMessage: (name, timeLabel) => `It is time to take ${name} at ${timeLabel}.`,
    nextMedicationMessage: (name, timeLabel) => `The next medicine is ${name}. I am setting a reminder for ${timeLabel}.`,
    heardPrompt: 'Heard:',
    fallbackHelp: 'I am here with you.',
    youtubeOpening: (query) => `Opening YouTube for ${query}.`,
    greeting: 'Hello. I am here with you.',
    howAreYou: 'I am doing well and ready to help you.',
    thanks: 'You are welcome.',
    assistantIdentity: 'I am your Guardian Watch voice assistant.',
    capabilityMessage: 'I can talk with you, tell the time, set simple medicine reminders, and open YouTube.',
    joke: 'Here is a small joke: the smartwatch says it has too many steps to count, but still asks for a walk.',
    wellbeingAdvice: 'Please drink some water, take a few deep breaths, and rest for a moment if you feel tired.',
    dateLabel: 'Today is',
    timeLabel: 'The time is',
    noExactAnswer: (transcript) => `I heard you say "${transcript}". I may not know everything yet, but I am still here to help.`,
    micUnavailable: 'Voice recognition is not available in this browser. Please try Chrome or Edge.',
    micPermission: 'Microphone permission was not granted. Please allow microphone access in the browser settings.',
    voiceError: 'There was a problem with voice recognition. Please try again.',
    noSpeech: 'I could not hear anything clearly. Please try again.',
  },
  'hi-IN': {
    recognitionLang: 'hi-IN',
    synthesisLang: 'hi-IN',
    locale: 'hi-IN',
    shortCode: 'hi',
    emptyPrompt: 'माइक दबाकर बोलें।',
    reminderPrefix: 'ठीक है, ',
    genericReminderTitle: 'दवा रिमाइंडर',
    genericReminderMessage: (timeLabel) => `${timeLabel} पर दवा लेने की याद दिलाऊंगी।`,
    namedReminderMessage: (name, timeLabel) => `${timeLabel} पर ${name} लेने का समय।`,
    nextMedicationMessage: (name, timeLabel) => `अगली दवा ${name} की है। मैं ${timeLabel} का रिमाइंडर तैयार कर रही हूं।`,
    heardPrompt: 'सुना गया:',
    fallbackHelp: 'मैं आपके साथ हूं।',
    youtubeOpening: (query) => `मैं यूट्यूब पर ${query} खोल रही हूं।`,
    greeting: 'नमस्ते। मैं आपकी मदद के लिए यहां हूं।',
    howAreYou: 'मैं ठीक हूं और आपकी मदद के लिए तैयार हूं।',
    thanks: 'आपका स्वागत है।',
    assistantIdentity: 'मैं आपकी Guardian Watch voice assistant हूं।',
    capabilityMessage: 'मैं आपसे बात कर सकती हूं, समय बता सकती हूं, सरल दवा रिमाइंडर सेट कर सकती हूं और यूट्यूब खोल सकती हूं।',
    joke: 'एक छोटा सा मजाक: घड़ी ने कहा, मैं हमेशा समय पर हूं, इसलिए मुझे कभी लेट नहीं कहा जा सकता।',
    wellbeingAdvice: 'कृपया थोड़ा पानी पीजिए, गहरी सांस लीजिए और अगर थकान हो तो थोड़ा आराम कीजिए।',
    dateLabel: 'आज की तारीख है',
    timeLabel: 'अभी समय है',
    noExactAnswer: (transcript) => `मैंने सुना कि आपने कहा: "${transcript}"। मैं अभी हर सवाल का पूरा जवाब नहीं दे पाती, लेकिन आपकी मदद के लिए यहां हूं।`,
    micUnavailable: 'इस ब्राउज़र में voice recognition उपलब्ध नहीं है। कृपया Chrome या Edge आज़माएं।',
    micPermission: 'माइक्रोफ़ोन अनुमति नहीं मिली। कृपया browser settings में microphone access दें।',
    voiceError: 'Voice recognition में समस्या आई। कृपया फिर से कोशिश करें।',
    noSpeech: 'आवाज़ सुनाई नहीं दी। कृपया फिर से बोलें।',
  },
  'kn-IN': {
    recognitionLang: 'kn-IN',
    synthesisLang: 'kn-IN',
    locale: 'kn-IN',
    shortCode: 'kn',
    emptyPrompt: 'ಮೈಕ್ ಒತ್ತಿ ಮಾತನಾಡಿ.',
    reminderPrefix: 'ಸರಿ, ',
    genericReminderTitle: 'ಔಷಧಿ ರಿಮೈಂಡರ್',
    genericReminderMessage: (timeLabel) => `${timeLabel}ಕ್ಕೆ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳಲು ನಾನು ನೆನಪಿಸುತ್ತೇನೆ.`,
    namedReminderMessage: (name, timeLabel) => `${timeLabel}ಕ್ಕೆ ${name} ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ.`,
    nextMedicationMessage: (name, timeLabel) => `ಮುಂದಿನ ಔಷಧಿ ${name}. ${timeLabel}ಕ್ಕೆ ರಿಮೈಂಡರ್ ಸಿದ್ಧಪಡಿಸುತ್ತಿದ್ದೇನೆ.`,
    heardPrompt: 'ಕೇಳಿದದ್ದು:',
    fallbackHelp: 'ನಾನು ನಿಮ್ಮ ಜೊತೆ ಇದ್ದೇನೆ.',
    youtubeOpening: (query) => `ನಾನು ಯೂಟ್ಯೂಬಿನಲ್ಲಿ ${query} ತೆಗೆಯುತ್ತಿದ್ದೇನೆ.`,
    greeting: 'ನಮಸ್ಕಾರ. ನಾನು ನಿಮ್ಮ ಜೊತೆ ಇದ್ದೇನೆ.',
    howAreYou: 'ನಾನು ಚೆನ್ನಾಗಿದ್ದೇನೆ. ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ಸಿದ್ಧವಾಗಿದ್ದೇನೆ.',
    thanks: 'ಸ್ವಾಗತ.',
    assistantIdentity: 'ನಾನು ನಿಮ್ಮ Guardian Watch voice assistant.',
    capabilityMessage: 'ನಾನು ನಿಮ್ಮ ಜೊತೆ ಮಾತಾಡಬಹುದು, ಸಮಯ ಹೇಳಬಹುದು, ಸರಳ ಔಷಧಿ ರಿಮೈಂಡರ್ ಹಾಕಬಹುದು ಮತ್ತು ಯೂಟ್ಯೂಬ್ ತೆರೆಯಬಹುದು.',
    joke: 'ಒಂದು ಚಿಕ್ಕ ಹಾಸ್ಯ: ಗಡಿಯಾರ ಹೇಳಿತು, ನಾನು ಯಾವಾಗಲೂ ಸಮಯಕ್ಕೆ ಬರುತ್ತೇನೆ, ಅದಕ್ಕೆ ನನ್ನನ್ನು ಲೇಟ್ ಎಂದು ಯಾರು ಹೇಳಲ್ಲ.',
    wellbeingAdvice: 'ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ನೀರು ಕುಡಿಯಿರಿ, ಆಳವಾಗಿ ಉಸಿರೆಳೆಯಿರಿ ಮತ್ತು ಸುಸ್ತಿದ್ದರೆ ಸ್ವಲ್ಪ ವಿಶ್ರಾಂತಿ ತೆಗೆದುಕೊಳ್ಳಿ.',
    dateLabel: 'ಇಂದು ದಿನಾಂಕ',
    timeLabel: 'ಈಗ ಸಮಯ',
    noExactAnswer: (transcript) => `ನೀವು ಹೇಳಿದ್ದು "${transcript}" ಎಂದು ನನಗೆ ಕೇಳಿಸಿತು. ಅದಕ್ಕೆ ಪೂರ್ಣ ಉತ್ತರ ಈಗ ನನಗೆ ಇರದೇ ಇರಬಹುದು, ಆದರೆ ನಾನು ನಿಮ್ಮ ಜೊತೆ ಇದ್ದೇನೆ.`,
    micUnavailable: 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ voice recognition ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು Chrome ಅಥವಾ Edge ಪ್ರಯತ್ನಿಸಿ.',
    micPermission: 'ಮೈಕ್ರೋಫೋನ್ ಅನುಮತಿ ಸಿಕ್ಕಿಲ್ಲ. ಬ್ರೌಸರ್ settings ನಲ್ಲಿ microphone access ನೀಡಿ.',
    voiceError: 'Voice recognition ನಲ್ಲಿ ಸಮಸ್ಯೆ ಆಯಿತು. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    noSpeech: 'ನಾನು ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಮಾತನಾಡಿ.',
  },
  'ta-IN': {
    recognitionLang: 'ta-IN',
    synthesisLang: 'ta-IN',
    locale: 'ta-IN',
    shortCode: 'ta',
    emptyPrompt: 'மைக் அழுத்தி பேசுங்கள்.',
    reminderPrefix: 'சரி, ',
    genericReminderTitle: 'மருந்து நினைவூட்டல்',
    genericReminderMessage: (timeLabel) => `${timeLabel}க்கு மருந்து எடுத்துக்கொள்ள நான் நினைவூட்டுவேன்.`,
    namedReminderMessage: (name, timeLabel) => `${timeLabel}க்கு ${name} எடுத்துக்கொள்ளும் நேரம்.`,
    nextMedicationMessage: (name, timeLabel) => `அடுத்த மருந்து ${name}. ${timeLabel}க்கு நினைவூட்டலை அமைக்கிறேன்.`,
    heardPrompt: 'கேட்டது:',
    fallbackHelp: 'நான் உங்களுடன் இருக்கிறேன்.',
    youtubeOpening: (query) => `நான் யூடியூபில் ${query} திறக்கிறேன்.`,
    greeting: 'வணக்கம். நான் உங்களுடன் இருக்கிறேன்.',
    howAreYou: 'நான் நன்றாக இருக்கிறேன். உங்களுக்கு உதவ தயாராக இருக்கிறேன்.',
    thanks: 'வரவேற்கிறேன்.',
    assistantIdentity: 'நான் உங்கள் Guardian Watch voice assistant.',
    capabilityMessage: 'நான் உங்களுடன் பேசலாம், நேரம் சொல்லலாம், எளிய மருந்து நினைவூட்டல் அமைக்கலாம், யூடியூப் திறக்கலாம்.',
    joke: 'சிறிய ஜோக் ஒன்று: கடிகாரம் சொன்னது, நான் எப்போதும் நேரத்திற்கு தான் வருவேன், அதனால் எனக்கு லேட் என்று பெயரே இல்லை.',
    wellbeingAdvice: 'தயவு செய்து கொஞ்சம் தண்ணீர் குடியுங்கள், ஆழமாக மூச்சை இழுங்கள், சோர்வாக இருந்தால் ஓய்வு எடுத்துக் கொள்ளுங்கள்.',
    dateLabel: 'இன்றைய தேதி',
    timeLabel: 'இப்போது நேரம்',
    noExactAnswer: (transcript) => `நீங்கள் சொன்னது "${transcript}" என்று நான் கேட்டேன். அதற்கான முழு பதில் எனக்கு இப்போது இல்லாமல் இருக்கலாம், ஆனால் நான் உங்களுடன் இருக்கிறேன்.`,
    micUnavailable: 'இந்த browser-ல் voice recognition இல்லை. Chrome அல்லது Edge முயற்சிக்கவும்.',
    micPermission: 'மைக்ரோஃபோன் அனுமதி கிடைக்கவில்லை. browser settings-ல் microphone access கொடுக்கவும்.',
    voiceError: 'Voice recognition-ல் சிக்கல் ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.',
    noSpeech: 'சத்தம் தெளிவாக கேட்கவில்லை. மீண்டும் பேசுங்கள்.',
  },
  'te-IN': {
    recognitionLang: 'te-IN',
    synthesisLang: 'te-IN',
    locale: 'te-IN',
    shortCode: 'te',
    emptyPrompt: 'మైక్ నొక్కి మాట్లాడండి.',
    reminderPrefix: 'సరే, ',
    genericReminderTitle: 'మందు రిమైండర్',
    genericReminderMessage: (timeLabel) => `${timeLabel}కి మందు తీసుకోవాలని నేను గుర్తు చేస్తాను.`,
    namedReminderMessage: (name, timeLabel) => `${timeLabel}కి ${name} తీసుకునే సమయం.`,
    nextMedicationMessage: (name, timeLabel) => `తర్వాతి మందు ${name}. ${timeLabel}కి రిమైండర్ సిద్ధం చేస్తున్నాను.`,
    heardPrompt: 'విన్నది:',
    fallbackHelp: 'నేను మీతోనే ఉన్నాను.',
    youtubeOpening: (query) => `నేను యూట్యూబ్‌లో ${query} తెరుస్తున్నాను.`,
    greeting: 'నమస్కారం. నేను మీకు సహాయం చేయడానికి ఇక్కడ ఉన్నాను.',
    howAreYou: 'నేను బాగున్నాను. మీకు సహాయం చేయడానికి సిద్ధంగా ఉన్నాను.',
    thanks: 'స్వాగతం.',
    assistantIdentity: 'నేను మీ Guardian Watch voice assistant.',
    capabilityMessage: 'నేను మీతో మాట్లాడగలను, సమయం చెప్పగలను, సింపుల్ మందు రిమైండర్ పెట్టగలను, యూట్యూబ్ తెరవగలను.',
    joke: 'ఒక చిన్న జోక్: గడియారం చెప్పింది, నేను ఎప్పుడూ సమయానికి వస్తాను, అందుకే నన్నెవరూ లేట్ అని అనరు.',
    wellbeingAdvice: 'దయచేసి కొంచెం నీరు తాగండి, లోతుగా శ్వాస తీసుకోండి, అలసటగా ఉంటే కొద్దిసేపు విశ్రాంతి తీసుకోండి.',
    dateLabel: 'ఈ రోజు తేదీ',
    timeLabel: 'ఇప్పుడు సమయం',
    noExactAnswer: (transcript) => `మీరు "${transcript}" అని చెప్పారని నాకు వినిపించింది. దానికి పూర్తి సమాధానం ఇప్పుడు నా దగ్గర లేకపోవచ్చు, కానీ నేను మీతోనే ఉన్నాను.`,
    micUnavailable: 'ఈ browser లో voice recognition అందుబాటులో లేదు. Chrome లేదా Edge ప్రయత్నించండి.',
    micPermission: 'మైక్రోఫోన్ అనుమతి రాలేదు. browser settings లో microphone access ఇవ్వండి.',
    voiceError: 'Voice recognition లో సమస్య వచ్చింది. దయచేసి మళ్లీ ప్రయత్నించండి.',
    noSpeech: 'శబ్దం స్పష్టంగా వినిపించలేదు. దయచేసి మళ్లీ చెప్పండి.',
  },
  'ml-IN': {
    recognitionLang: 'ml-IN',
    synthesisLang: 'ml-IN',
    locale: 'ml-IN',
    shortCode: 'ml',
    emptyPrompt: 'മൈക്ക് അമർത്തി സംസാരിക്കൂ.',
    reminderPrefix: 'ശരി, ',
    genericReminderTitle: 'മരുന്ന് ഓർമ്മപ്പെടുത്തൽ',
    genericReminderMessage: (timeLabel) => `${timeLabel}യ്ക്ക് മരുന്ന് കഴിക്കണമെന്ന് ഞാൻ ഓർമ്മിപ്പിക്കും.`,
    namedReminderMessage: (name, timeLabel) => `${timeLabel}യ്ക്ക് ${name} കഴിക്കേണ്ട സമയം.`,
    nextMedicationMessage: (name, timeLabel) => `അടുത്ത മരുന്നു ${name} ആണ്. ${timeLabel}യ്ക്ക് ഓർമ്മപ്പെടുത്തൽ തയ്യാറാക്കുന്നു.`,
    heardPrompt: 'കേട്ടത്:',
    fallbackHelp: 'ഞാൻ നിങ്ങളോടൊപ്പം ഉണ്ട്.',
    youtubeOpening: (query) => `ഞാൻ യൂട്യൂബിൽ ${query} തുറക്കുന്നു.`,
    greeting: 'നമസ്കാരം. ഞാൻ നിങ്ങളോടൊപ്പം ഉണ്ട്.',
    howAreYou: 'എനിക്ക് സുഖമാണ്. നിങ്ങളെ സഹായിക്കാൻ ഞാൻ തയ്യാറാണ്.',
    thanks: 'സ്വാഗതം.',
    assistantIdentity: 'ഞാൻ നിങ്ങളുടെ Guardian Watch voice assistant ആണ്.',
    capabilityMessage: 'ഞാൻ നിങ്ങളോട് സംസാരിക്കാം, സമയം പറയാം, ലളിതമായ മരുന്ന് ഓർമ്മപ്പെടുത്തൽ ഒരുക്കാം, യൂട്യൂബ് തുറക്കാം.',
    joke: 'ഒരു ചെറിയ തമാശ: വാച്ച് പറഞ്ഞു, ഞാൻ എപ്പോഴും സമയത്ത് വരും, അതുകൊണ്ട് എനിക്ക് ലേറ്റ് എന്ന് പേര് ഇല്ല.',
    wellbeingAdvice: 'ദയവായി കുറച്ച് വെള്ളം കുടിക്കൂ, ആഴത്തിൽ ശ്വസിക്കൂ, ക്ഷീണമുണ്ടെങ്കിൽ കുറച്ച് വിശ്രമിക്കൂ.',
    dateLabel: 'ഇന്നത്തെ തീയതി',
    timeLabel: 'ഇപ്പോൾ സമയം',
    noExactAnswer: (transcript) => `നിങ്ങൾ പറഞ്ഞത് "${transcript}" എന്നാണ് എനിക്ക് കേട്ടത്. അതിന് പൂർണ്ണമായ മറുപടി ഇപ്പോൾ എനിക്ക് ഇല്ലായിരിക്കാം, പക്ഷേ ഞാൻ നിങ്ങളോടൊപ്പം ഉണ്ട്.`,
    micUnavailable: 'ഈ browser ൽ voice recognition ലഭ്യമല്ല. Chrome അല്ലെങ്കിൽ Edge ഉപയോഗിക്കുക.',
    micPermission: 'മൈക്രോഫോൺ അനുമതി ലഭിച്ചില്ല. browser settings ൽ microphone access നൽകുക.',
    voiceError: 'Voice recognition ൽ പ്രശ്നമുണ്ടായി. ദയവായി വീണ്ടും ശ്രമിക്കുക.',
    noSpeech: 'ശബ്ദം വ്യക്തമായി കേൾക്കാനായില്ല. വീണ്ടും പറയൂ.',
  },
};

const SCRIPT_LANGUAGE_RULES: Array<{ pattern: RegExp; language: SupportedLanguage }> = [
  { pattern: /[\u0C80-\u0CFF]/, language: 'kn-IN' },
  { pattern: /[\u0B80-\u0BFF]/, language: 'ta-IN' },
  { pattern: /[\u0C00-\u0C7F]/, language: 'te-IN' },
  { pattern: /[\u0D00-\u0D7F]/, language: 'ml-IN' },
  { pattern: /[\u0900-\u097F]/, language: 'hi-IN' },
];

const LANGUAGE_HINTS: Array<{ keywords: string[]; language: SupportedLanguage }> = [
  { language: 'hi-IN', keywords: ['namaste', 'kaise', 'dawa', 'yaad', 'youtube par'] },
  { language: 'kn-IN', keywords: ['namaskara', 'hegiddira', 'aushadhi', 'youtube nalli', 'youtube alli', 'haaku', 'nodu', 'torisu', 'samaya'] },
  { language: 'ta-IN', keywords: ['vanakkam', 'marundhu', 'ninaivootal', 'youtube la', 'podu', 'paathu', 'neram'] },
  { language: 'te-IN', keywords: ['namaskaram', 'mandu', 'gurtu', 'youtube lo', 'pettu', 'samayam'] },
  { language: 'ml-IN', keywords: ['namaskaram', 'marunnu', 'ormippikkuka', 'youtube il', 'vekkuka', 'kaanikku', 'samayam'] },
];

const REMINDER_HINTS = ['reminder', 'medicine', 'medicines', 'tablet', 'pill', 'dawa', 'दवा', 'याद', 'ರಿಮೈಂಡರ್', 'ಔಷಧಿ', 'மருந்து', 'நினைவூட்டல்', 'మందు', 'రిమైండర్', 'മരുന്ന്', 'ഓർമ്മപ്പെടുത്തൽ'];
const YOUTUBE_HINTS = ['youtube', 'you tube', 'play on youtube', 'play youtube', 'open youtube', 'watch on youtube', 'youtube par', 'youtube nalli', 'youtube alli', 'youtube la', 'youtube lo', 'youtube il', 'ಯೂಟ್ಯೂಬ್', 'யூடியூப்', 'యూట్యూబ్', 'യൂട്യൂബ്'];
const PLAY_MEDIA_HINTS = ['play', 'open', 'watch', 'show', 'haaku', 'nodu', 'torisu', 'podu', 'paathu', 'pettu', 'kaanikku', 'vekkuka', 'ಚಲಿಸು', 'ತೋರಿಸು', 'போடு', 'చూపించు', 'കാണിക്കൂ'];
const GREETING_HINTS = ['hello', 'hi', 'hey', 'namaste', 'namaskara', 'vanakkam', 'namaskaram', 'ಹಲೋ', 'ஹலோ', 'హలో', 'ഹലോ'];
const HOW_ARE_YOU_HINTS = ['how are you', 'kaise ho', 'kaisi ho', 'hegiddiya', 'hegiddira', 'eppadi irukka', 'ela unnaru', 'sukhamano'];
const THANKS_HINTS = ['thanks', 'thank you', 'dhanyavad', 'shukriya', 'ಧನ್ಯವಾದ', 'நன்றி', 'ధన్యవాదాలు', 'നന്ദി'];
const WHO_ARE_YOU_HINTS = ['who are you', 'tum kaun ho', 'nee yaaru', 'neenga yaaru', 'nuvvu evaru', 'ningal aaranu', 'neenu yaaru'];
const CAPABILITY_HINTS = ['what can you do', 'help', 'sahaya', 'enu maadtiya', 'enu madabahudu', 'enna panna mudiyum', 'emi chesthavu', 'entha cheyyum'];
const JOKE_HINTS = ['joke', 'funny', 'hasi', 'hasya', 'jok', 'ಸಿರಿ', 'ನಗೆ', 'காமெடி', 'జోక్', 'തമാശ'];
const TIME_HINTS = ['time', 'samaya', 'samayam', 'neram', 'ಸಮಯ', 'நேரம்', 'సమయం', 'സമയം'];
const DATE_HINTS = ['date', 'today date', 'tarikh', 'dinanka', 'தேதி', 'తేదీ', 'തീയതി'];
const WATER_HINTS = ['water', 'drink water', 'neeru', 'tanni', 'neellu', 'vellam', 'ನೀರು', 'தண்ணீர்', 'నీళ్లు', 'വെള്ളം'];

const EXTRA_PLAY_MEDIA_HINTS = ['listen', 'hear', 'stream', 'put', 'start', 'kelu', 'vinu', 'kelppikku'];
const MEDIA_ENTITY_HINTS = ['song', 'music', 'movie', 'film', 'video', 'trailer', 'teaser', 'album', 'playlist', 'podcast', 'bhajan', 'devotional', 'serial', 'episode', 'clip', 'gana', 'geet', 'gaana', 'cinema', 'paata', 'pata', 'haadu', 'haadannu', 'paatu', 'paattu', 'pattu'];
const GENERIC_MEDIA_TERMS = ['song', 'music', 'movie', 'film', 'video', 'trailer', 'playlist', 'podcast', 'bhajan', 'devotional', 'serial', 'episode'];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en-IN';

export const DEFAULT_MEDICATION_CONTEXT: MedicationContext[] = DEMO_MEDICATIONS.map((medication) => ({
  id: medication.id,
  name: medication.brand_name,
  genericName: medication.generic_name,
  times: medication.times,
  icon: 'medicine',
}));

export function getLanguageConfig(language: SupportedLanguage = DEFAULT_LANGUAGE) {
  return LANGUAGE_CONFIG[language];
}

export function resolveSpeechLanguage(language?: string | null): SupportedLanguage {
  if (!language) {
    return DEFAULT_LANGUAGE;
  }
  const normalizedLanguage = language.trim().toLowerCase();
  const languageAliases: Record<string, RegisteredLanguage> = {
    english: 'en',
    hindi: 'hi',
    kannada: 'kn',
    kannad: 'kn',
    tamil: 'ta',
    telugu: 'te',
    malayalam: 'ml',
  };
  const registeredLanguage = languageAliases[normalizedLanguage] || normalizedLanguage;

  if (registeredLanguage in REGISTERED_TO_SUPPORTED_LANGUAGE) {
    return REGISTERED_TO_SUPPORTED_LANGUAGE[registeredLanguage as RegisteredLanguage];
  }
  if (normalizedLanguage in LANGUAGE_CONFIG) {
    return normalizedLanguage as SupportedLanguage;
  }
  return DEFAULT_LANGUAGE;
}

export function detectLanguageFromText(input: string, fallback: SupportedLanguage = DEFAULT_LANGUAGE): SupportedLanguage {
  if (!input.trim()) {
    return fallback;
  }

  for (const rule of SCRIPT_LANGUAGE_RULES) {
    if (rule.pattern.test(input)) {
      return rule.language;
    }
  }

  const normalized = input.toLowerCase();
  for (const hint of LANGUAGE_HINTS) {
    if (hint.keywords.some((keyword) => normalized.includes(keyword))) {
      return hint.language;
    }
  }

  return fallback;
}

export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function createSpeechRecognition(language: SupportedLanguage = DEFAULT_LANGUAGE) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    return null;
  }

  const recognition = new Recognition();
  recognition.lang = LANGUAGE_CONFIG[language].recognitionLang;
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

export async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { granted: false, error: 'browser' as const };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true as const };
  } catch (error) {
    return { granted: false as const, error: (error as Error).name || 'permission' };
  }
}

export function speakText(text: string, language: SupportedLanguage = DEFAULT_LANGUAGE) {
  if (!isSpeechSynthesisSupported()) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANGUAGE_CONFIG[language].synthesisLang;
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function openYoutubeSearch(query: string, language: SupportedLanguage) {
  const config = getLanguageConfig(language);
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=${config.shortCode}&persist_hl=1`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}

export function formatWatchTime(date: Date, language: SupportedLanguage = DEFAULT_LANGUAGE) {
  return new Intl.DateTimeFormat(LANGUAGE_CONFIG[language].locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatReminderCaption(date: Date, language: SupportedLanguage = DEFAULT_LANGUAGE) {
  return new Intl.DateTimeFormat(LANGUAGE_CONFIG[language].locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function normalizeText(input: string) {
  return input.toLowerCase().trim().replace(/\s+/g, ' ');
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectMedication(text: string, medications: MedicationContext[]) {
  const normalized = normalizeText(text);
  return medications.find((medication) => {
    const searchable = [medication.name, medication.genericName].filter(Boolean).join(' ').toLowerCase();
    return searchable && normalized.includes(searchable.split(' ')[0]);
  });
}

function parseNumericTime(text: string, now: Date) {
  const normalized = normalizeText(text)
    .replace(/ बजे/g, '')
    .replace(/ಗಂಟೆಗೆ/g, '')
    .replace(/மணிக்கு/g, '')
    .replace(/గంటలకు/g, '')
    .replace(/മണിക്ക്/g, '')
    .replace(/pm/g, ' pm')
    .replace(/am/g, ' am');

  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] || '0');
  const meridiem = match[3]?.toLowerCase();

  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  if (meridiem === 'pm' && hours < 12) {
    hours += 12;
  }
  if (meridiem === 'am' && hours === 12) {
    hours = 0;
  }

  const dueAt = new Date(now);
  dueAt.setSeconds(0, 0);
  dueAt.setHours(hours, minutes, 0, 0);

  if (dueAt.getTime() <= now.getTime()) {
    dueAt.setDate(dueAt.getDate() + 1);
  }

  return dueAt;
}

function getNextMedicationReminder(now: Date, medications: MedicationContext[]) {
  const withDates = medications.flatMap((medication) =>
    medication.times.map((time) => {
      const [hourString, minuteString] = time.split(':');
      const dueAt = new Date(now);
      dueAt.setSeconds(0, 0);
      dueAt.setHours(Number(hourString), Number(minuteString), 0, 0);
      if (dueAt.getTime() <= now.getTime()) {
        dueAt.setDate(dueAt.getDate() + 1);
      }
      return { medication, dueAt };
    }),
  );

  return withDates.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] || null;
}

function buildReminder(
  dueAt: Date,
  title: string,
  message: string,
  source: ReminderItem['source'],
  language: SupportedLanguage,
) {
  return {
    id: `reminder-${dueAt.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    message,
    timeLabel: formatReminderCaption(dueAt, language),
    dueAt: dueAt.toISOString(),
    icon: 'medicine' as const,
    source,
    triggered: false,
    language,
  };
}

function cleanupMediaQuery(value: string) {
  return value
    .replace(/[?.,!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericMediaOnlyQuery(query: string) {
  const normalizedQuery = normalizeText(query);
  return GENERIC_MEDIA_TERMS.some((term) => normalizedQuery === term);
}

function extractYoutubeQuery(transcript: string) {
  const stripped = transcript
    .replace(/youtube/gi, ' ')
    .replace(/you tube/gi, ' ')
    .replace(/play/gi, ' ')
    .replace(/open/gi, ' ')
    .replace(/watch/gi, ' ')
    .replace(/show/gi, ' ')
    .replace(/listen/gi, ' ')
    .replace(/hear/gi, ' ')
    .replace(/stream/gi, ' ')
    .replace(/put/gi, ' ')
    .replace(/start/gi, ' ')
    .replace(/search/gi, ' ')
    .replace(/please/gi, ' ')
    .replace(/can you/gi, ' ')
    .replace(/could you/gi, ' ')
    .replace(/i want to/gi, ' ')
    .replace(/i wanna/gi, ' ')
    .replace(/let me/gi, ' ')
    .replace(/for me/gi, ' ')
    .replace(/on/gi, ' ')
    .replace(/in/gi, ' ')
    .replace(/haaku/gi, ' ')
    .replace(/nodu/gi, ' ')
    .replace(/torisu/gi, ' ')
    .replace(/kelu/gi, ' ')
    .replace(/podu/gi, ' ')
    .replace(/paathu/gi, ' ')
    .replace(/pettu/gi, ' ')
    .replace(/vinu/gi, ' ')
    .replace(/kaanikku/gi, ' ')
    .replace(/kelppikku/gi, ' ')
    .replace(/vekkuka/gi, ' ');

  const cleaned = cleanupMediaQuery(stripped);
  if (!cleaned || isGenericMediaOnlyQuery(cleaned)) {
    return cleanupMediaQuery(transcript);
  }

  return cleaned;
}

function shouldHandleAsMediaRequest(normalized: string) {
  const hasYoutubeHint = includesAny(normalized, YOUTUBE_HINTS);
  const hasPlaybackVerb =
    includesAny(normalized, PLAY_MEDIA_HINTS) || includesAny(normalized, EXTRA_PLAY_MEDIA_HINTS);
  const hasMediaEntity = includesAny(normalized, MEDIA_ENTITY_HINTS);
  const compactMediaRequest = hasMediaEntity && normalized.split(' ').length <= 6;

  if (includesAny(normalized, REMINDER_HINTS)) {
    return false;
  }

  return hasYoutubeHint || (hasPlaybackVerb && hasMediaEntity) || compactMediaRequest;
}

function buildChatResponse(normalized: string, transcript: string, language: SupportedLanguage) {
  const config = getLanguageConfig(language);

  if (includesAny(normalized, GREETING_HINTS)) {
    return config.greeting;
  }
  if (includesAny(normalized, HOW_ARE_YOU_HINTS)) {
    return config.howAreYou;
  }
  if (includesAny(normalized, THANKS_HINTS)) {
    return config.thanks;
  }
  if (includesAny(normalized, WHO_ARE_YOU_HINTS)) {
    return config.assistantIdentity;
  }
  if (includesAny(normalized, CAPABILITY_HINTS)) {
    return config.capabilityMessage;
  }
  if (includesAny(normalized, JOKE_HINTS)) {
    return config.joke;
  }
  if (includesAny(normalized, WATER_HINTS)) {
    return config.wellbeingAdvice;
  }
  if (includesAny(normalized, TIME_HINTS)) {
    return `${config.timeLabel} ${formatWatchTime(new Date(), language)}.`;
  }
  if (includesAny(normalized, DATE_HINTS)) {
    const today = new Intl.DateTimeFormat(config.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
    return `${config.dateLabel} ${today}.`;
  }

  return config.noExactAnswer(transcript);
}

export function processVoiceCommand(
  transcript: string,
  medications: MedicationContext[] = DEFAULT_MEDICATION_CONTEXT,
  fallbackLanguage: SupportedLanguage = DEFAULT_LANGUAGE,
) {
  const normalized = normalizeText(transcript);
  const responseLanguage = detectLanguageFromText(transcript, fallbackLanguage);
  const config = getLanguageConfig(responseLanguage);
  const now = new Date();
  const matchedMedication = detectMedication(normalized, medications);

  if (!normalized) {
    return {
      transcript,
      responseText: config.emptyPrompt,
      responseLanguage,
      actionType: 'chat',
    } satisfies VoiceCommandResult;
  }

  const asksForYoutube = shouldHandleAsMediaRequest(normalized);

  if (asksForYoutube) {
    const query = extractYoutubeQuery(transcript) || transcript;
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=${config.shortCode}&persist_hl=1`;

    return {
      transcript,
      responseText: config.youtubeOpening(query),
      responseLanguage,
      actionType: 'youtube',
      action: {
        type: 'youtube',
        query,
        url,
      },
    } satisfies VoiceCommandResult;
  }

  const asksForReminder = includesAny(normalized, REMINDER_HINTS);

  if (asksForReminder) {
    const parsedTime = parseNumericTime(normalized, now);
    if (parsedTime) {
      const title = matchedMedication ? `${matchedMedication.name} ${config.genericReminderTitle}` : config.genericReminderTitle;
      const message = matchedMedication
        ? config.namedReminderMessage(matchedMedication.name, formatReminderCaption(parsedTime, responseLanguage))
        : config.genericReminderMessage(formatReminderCaption(parsedTime, responseLanguage));

      return {
        transcript,
        responseText: `${config.reminderPrefix}${message}`,
        responseLanguage,
        actionType: 'reminder',
        reminder: buildReminder(parsedTime, title, message, 'voice', responseLanguage),
      } satisfies VoiceCommandResult;
    }

    const nextMedication = getNextMedicationReminder(now, medications);
    if (nextMedication) {
      const reminder = buildReminder(
        nextMedication.dueAt,
        `${nextMedication.medication.name} ${config.genericReminderTitle}`,
        config.namedReminderMessage(
          nextMedication.medication.name,
          formatReminderCaption(nextMedication.dueAt, responseLanguage),
        ),
        'medication',
        responseLanguage,
      );

      return {
        transcript,
        responseText: config.nextMedicationMessage(nextMedication.medication.name, reminder.timeLabel),
        responseLanguage,
        actionType: 'reminder',
        reminder,
      } satisfies VoiceCommandResult;
    }
  }

  return {
    transcript,
    responseText: buildChatResponse(normalized, transcript, responseLanguage),
    responseLanguage,
    actionType: 'chat',
  } satisfies VoiceCommandResult;
}
