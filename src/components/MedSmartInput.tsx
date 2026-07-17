import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Upload, X, Volume2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Webcam from 'react-webcam';
import { toast } from '@/hooks/use-toast';
import { useGuardianStore, type Reminder } from '@/store/guardianStore';
import { useAppStore, type Medication } from '@/store';
import { formatTime12Hour, from12HourParts, to12HourParts, type TimeParts12Hour } from '@/lib/timeFormat';

const API_BASE = '/api';

const MEDICATIONS_DB = [
  { brand_name: 'Glucophage', generic_name: 'Metformin HCl', category: 'Antidiabetic', typical_dose: 500, dose_unit: 'mg', pronunciation_en: 'Met-FOR-min', pronunciation_kn: 'ಮೆಟ್-ಫಾರ್-ಮಿನ್', pronunciation_hi: 'मेट-फॉर-मिन', pronunciation_ta: 'மெட்-ஃபார்-மின்', pill_description: 'Small white oval tablet' },
  { brand_name: 'Amlodac', generic_name: 'Amlodipine', category: 'Antihypertensive', typical_dose: 5, dose_unit: 'mg', pronunciation_en: 'Am-LOH-di-peen', pronunciation_kn: 'ಅಮ್-ಲೋ-ಡಿ-ಪೀನ್', pronunciation_hi: 'अम-लो-डि-पीन', pronunciation_ta: 'அம்-லோ-டி-பீன்', pill_description: 'Small white round tablet' },
  { brand_name: 'Ecosprin', generic_name: 'Aspirin', category: 'Antiplatelet', typical_dose: 75, dose_unit: 'mg', pronunciation_en: 'AS-pir-in', pronunciation_kn: 'ಆಸ್-ಪಿ-ರಿನ್', pronunciation_hi: 'एस-पि-रिन', pronunciation_ta: 'ஆஸ்-பி-ரின்', pill_description: 'Small pink round tablet' },
  { brand_name: 'Telma', generic_name: 'Telmisartan', category: 'Antihypertensive', typical_dose: 40, dose_unit: 'mg', pronunciation_en: 'Tel-mi-SAR-tan', pronunciation_kn: 'ಟೆಲ್-ಮಿ-ಸಾರ್-ಟನ್', pronunciation_hi: 'टेल-मि-सार-टन', pronunciation_ta: 'டெல்-மி-சார்-டன்', pill_description: 'White oblong tablet' },
  { brand_name: 'Clopitab', generic_name: 'Clopidogrel', category: 'Antiplatelet', typical_dose: 75, dose_unit: 'mg', pronunciation_en: 'Cloh-PID-oh-grel', pronunciation_kn: 'ಕ್ಲೋ-ಪಿಡ್-ಓ-ಗ್ರೆಲ್', pronunciation_hi: 'क्लो-पिड-ओ-ग्रेल', pronunciation_ta: 'குளோ-பிட்-ஓ-கிரெல்', pill_description: 'Pink film-coated tablet' },
  { brand_name: 'Thyronorm', generic_name: 'Levothyroxine', category: 'Thyroid', typical_dose: 50, dose_unit: 'mcg', pronunciation_en: 'Lee-voh-thy-ROX-een', pronunciation_kn: 'ಲೀ-ವೋ-ಥೈ-ರಾಕ್ಸ್-ಈನ್', pronunciation_hi: 'ली-वो-थाइ-रॉक्स-ईन', pronunciation_ta: 'லீ-வோ-தை-ராக்ஸ்-ஈன்', pill_description: 'Small colored tablet' },
  { brand_name: 'Pan-D', generic_name: 'Pantoprazole + Domperidone', category: 'Gastrointestinal', typical_dose: 40, dose_unit: 'mg', pronunciation_en: 'Pan-TOH-pra-zole', pronunciation_kn: 'ಪ್ಯಾನ್-ಟೋ-ಪ್ರ-ಝೋಲ್', pronunciation_hi: 'पैन-टो-प्र-ज़ोल', pronunciation_ta: 'பான்-டோ-பிர-சோல்', pill_description: 'Capsule shaped tablet' },
  { brand_name: 'Atorva', generic_name: 'Atorvastatin', category: 'Statin', typical_dose: 10, dose_unit: 'mg', pronunciation_en: 'Ah-TOR-vah-stat-in', pronunciation_kn: 'ಅ-ಟಾರ್-ವ-ಸ್ಟಾಟ್-ಇನ್', pronunciation_hi: 'अ-टॉर-व-स्टैट-इन', pronunciation_ta: 'அ-டோர்-வ-ஸ்டாட்-இன்', pill_description: 'White round tablet' },
];

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

interface Props {
  elderId: string;
  trigger?: React.ReactNode;
  onSave?: () => void;
}

export const MedSmartInput: React.FC<Props> = ({ elderId, trigger, onSave }) => {
  const { t } = useTranslation();
  const addReminder = useGuardianStore((state) => state.addReminder);
  const setMedications = useAppStore((state) => state.setMedications);
  const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [brandName, setBrandName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [category, setCategory] = useState('');
  const [doseAmount, setDoseAmount] = useState('');
  const [doseUnit, setDoseUnit] = useState('mg');
  const [frequency, setFrequency] = useState('Twice daily');
  const [times, setTimes] = useState(['08:00']);
  const [instructions, setInstructions] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  const [pillDescription, setPillDescription] = useState('');
  const [pronEn, setPronEn] = useState('');
  const [pronKn, setPronKn] = useState('');
  const [pronHi, setPronHi] = useState('');
  const [pronTa, setPronTa] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [pronLang, setPronLang] = useState('en');

  const filteredMeds = MEDICATIONS_DB.filter(m =>
    m.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.generic_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectMedication = (med: typeof MEDICATIONS_DB[0]) => {
    setBrandName(med.brand_name);
    setGenericName(med.generic_name);
    setCategory(med.category);
    setDoseAmount(String(med.typical_dose));
    setDoseUnit(med.dose_unit);
    setPronEn(med.pronunciation_en);
    setPronKn(med.pronunciation_kn);
    setPronHi(med.pronunciation_hi);
    setPronTa(med.pronunciation_ta);
    setPillDescription(med.pill_description);
    setSearchQuery(med.brand_name);
    setShowSuggestions(false);
  };

  const capturePhoto = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setPhotoUrl(imageSrc);
      setCameraOpen(false);
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPhotoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const previewVoice = (lang: string) => {
    if (!('speechSynthesis' in window)) return;
    const pron = { en: pronEn, kn: pronKn, hi: pronHi, ta: pronTa }[lang] || pronEn;
    const langCode = { en: 'en-IN', kn: 'kn-IN', hi: 'hi-IN', ta: 'ta-IN' }[lang] || 'en-IN';
    const msg = lang === 'en'
      ? `Time to take your ${pron}. Please take ${doseAmount} ${doseUnit}. ${instructions}`
      : `${pron}. ${doseAmount} ${doseUnit}.`;
    const utterance = new SpeechSynthesisUtterance(msg);
    utterance.lang = langCode;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
  };

  const handleSave = () => {
    const medicationName = brandName || searchQuery || genericName || 'Medication';
    const dosage = [doseAmount, doseUnit].filter(Boolean).join(' ');
    const createdAt = new Date().toISOString();
    const medicationId = `med-${Date.now()}`;
    const medication: Medication = {
      id: medicationId,
      elder_id: elderId,
      brand_name: medicationName,
      generic_name: genericName || medicationName,
      category: category || 'General',
      dose_amount: Number(doseAmount) || 0,
      dose_unit: doseUnit,
      frequency,
      times,
      instructions,
      photo: photoUrl || '',
      photo_url: photoUrl || '',
      pronunciation_en: pronEn || medicationName,
      pronunciation_kn: pronKn,
      pronunciation_hi: pronHi,
      pronunciation_ta: pronTa,
      pill_description: pillDescription || specialNote,
      active: true,
    };

    setMedications((current) => [medication, ...current]);
    void fetch(`${API_BASE}/medications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(medication),
    }).catch(() => {
      // Keep the in-app medication list updated even when the local API is off.
    });

    times.forEach((time, index) => {
      const reminder: Reminder = {
        id: `${medicationId}-${index}`,
        elderId,
        type: 'medication',
        title: dosage ? `${medicationName} ${dosage}` : medicationName,
        time,
        repeat: 'daily',
        verified: false,
        createdAt,
        photo: photoUrl || '',
        pillName: medicationName,
        dosage,
      };

      addReminder(reminder);
    });

    toast({ title: t('med.saved_toast', { time: formatTime12Hour(times[0] || '08:00') }) });
    setOpen(false);
    onSave?.();
  };

  const updateTimePart = (index: number, updates: Partial<TimeParts12Hour>) => {
    const currentParts = to12HourParts(times[index]);
    const nextTime = from12HourParts({ ...currentParts, ...updates });
    setTimes(times.map((time, timeIndex) => (timeIndex === index ? nextTime : time)));
  };

  const reminderText = (lang: string) => {
    const pron = { en: pronEn, kn: pronKn, hi: pronHi, ta: pronTa }[lang] || pronEn;
    if (lang === 'kn') return `ನಿಮ್ಮ ${pron} ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. ${doseAmount} ${doseUnit} ತೆಗೆದುಕೊಳ್ಳಿ. ${instructions}`;
    if (lang === 'hi') return `आपकी ${pron} लेने का समय है। ${doseAmount} ${doseUnit} लें। ${instructions}`;
    if (lang === 'ta') return `உங்கள் ${pron} எடுக்கும் நேரம். ${doseAmount} ${doseUnit} எடுங்கள். ${instructions}`;
    return `Time to take your ${pron}. Please take ${doseAmount} ${doseUnit}. ${instructions}`;
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          {trigger || <Button className="bg-teal hover:bg-teal/90 text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> {t('dashboard.add_medication')}</Button>}
        </SheetTrigger>
        <SheetContent className="w-full sm:w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display text-xl">{t('dashboard.add_medication')}</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Photo upload */}
            <div>
              <Label>{t('med.photo_label')}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t('med.photo_subtext')}</p>
              {photoUrl ? (
                <div className="relative">
                  <img src={photoUrl} alt="Pill" className="w-full h-40 object-cover rounded-xl border border-border" />
                  <button onClick={() => { setPhotoUrl(null); setPhotoFile(null); }}
                    className="absolute top-2 right-2 bg-card rounded-full p-1 shadow"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-teal/40 rounded-xl h-40 flex flex-col items-center justify-center gap-2 hover:bg-secondary/50 transition-colors">
                  <Upload className="h-8 w-8 text-teal/60" />
                  <span className="text-sm text-muted-foreground">{t('med.drop_or_browse')}</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" style={{position:'absolute',inset:0}} />
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => setCameraOpen(true)}>
                    <Camera className="h-3.5 w-3.5 mr-1" /> {t('med.take_photo')}
                  </Button>
                </div>
              )}
              <div className="mt-2">
                <Label htmlFor="pill-desc">{t('med.pill_description')}</Label>
                <Input id="pill-desc" placeholder={t('med.pill_description_placeholder')} value={pillDescription} onChange={e => setPillDescription(e.target.value)} className="mt-1" />
              </div>
            </div>

            {/* Medication autocomplete */}
            <div>
              <Label>{t('med.brand_name')}</Label>
              <div className="relative">
                <Input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)} className="mt-1" placeholder="Type to search..." />
                {showSuggestions && searchQuery && filteredMeds.length > 0 && (
                  <div className="absolute z-50 w-full bg-card border border-border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {filteredMeds.map((m, i) => (
                      <button key={i} onClick={() => selectMedication(m)}
                        className="w-full text-left px-3 py-2 hover:bg-secondary text-sm flex justify-between">
                        <span className="font-medium">{m.brand_name}</span>
                        <span className="text-xs text-muted-foreground">{m.generic_name} · {m.category}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <Label className="text-xs">{t('med.generic_name')}</Label>
                  <Input value={genericName} onChange={e => setGenericName(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t('med.category')}</Label>
                  <Input value={category} readOnly className="mt-1 h-8 text-sm bg-muted" />
                </div>
              </div>
            </div>

            {/* Pronunciation */}
            <div>
              <Label>{t('med.pronunciation_label')}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t('med.pronunciation_hint')}</p>
              <Tabs value={pronLang} onValueChange={setPronLang}>
                <TabsList className="w-full h-8">
                  <TabsTrigger value="en" className="text-xs flex-1">English</TabsTrigger>
                  <TabsTrigger value="kn" className="text-xs flex-1">ಕನ್ನಡ</TabsTrigger>
                  <TabsTrigger value="hi" className="text-xs flex-1">हिंदी</TabsTrigger>
                  <TabsTrigger value="ta" className="text-xs flex-1">தமிழ்</TabsTrigger>
                </TabsList>
                <TabsContent value="en"><Input value={pronEn} onChange={e => setPronEn(e.target.value)} placeholder="e.g. Met-FOR-min" className="mt-1" /></TabsContent>
                <TabsContent value="kn"><Input value={pronKn} onChange={e => setPronKn(e.target.value)} placeholder="ಉದಾ. ಮೆಟ್-ಫಾರ್-ಮಿನ್" className="mt-1" /></TabsContent>
                <TabsContent value="hi"><Input value={pronHi} onChange={e => setPronHi(e.target.value)} placeholder="उदा. मेट-फॉर-मिन" className="mt-1" /></TabsContent>
                <TabsContent value="ta"><Input value={pronTa} onChange={e => setPronTa(e.target.value)} placeholder="எ.கா. மெட்-ஃபார்-மின்" className="mt-1" /></TabsContent>
              </Tabs>
              <Button variant="outline" className="w-full mt-2 text-teal border-teal/30" onClick={() => previewVoice(pronLang)} disabled={speaking}>
                <Volume2 className="h-4 w-4 mr-2" /> {speaking ? '🔊 Playing...' : t('med.preview_voice')}
              </Button>
            </div>

            {/* Dose & Schedule */}
            <div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t('med.dose_amount')}</Label>
                  <Input type="number" value={doseAmount} onChange={e => setDoseAmount(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>{t('med.dose_unit')}</Label>
                  <Select value={doseUnit} onValueChange={setDoseUnit}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['mg', 'ml', 'tablet(s)', 'capsule(s)', 'drop(s)', 'puff(s)', 'mcg'].map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2">
                <Label>{t('med.frequency')}</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Once daily', 'Twice daily', 'Three times daily', 'Every 6 hours', 'Every 8 hours', 'Custom'].map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-2">
                <Label>{t('med.times')}</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {times.map((time, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Select value={to12HourParts(time).hour} onValueChange={(value) => updateTimePart(i, { hour: value })}>
                        <SelectTrigger className="h-8 w-16 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {HOUR_OPTIONS.map((hour) => <SelectItem key={hour} value={hour}>{hour}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground">:</span>
                      <Select value={to12HourParts(time).minute} onValueChange={(value) => updateTimePart(i, { minute: value })}>
                        <SelectTrigger className="h-8 w-16 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MINUTE_OPTIONS.map((minute) => <SelectItem key={minute} value={minute}>{minute}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={to12HourParts(time).period} onValueChange={(value) => updateTimePart(i, { period: value as TimeParts12Hour['period'] })}>
                        <SelectTrigger className="h-8 w-20 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="PM">PM</SelectItem>
                        </SelectContent>
                      </Select>
                      {times.length > 1 && <button onClick={() => setTimes(times.filter((_,j)=>j!==i))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setTimes([...times, '12:00'])} className="text-xs">
                    <Plus className="h-3 w-3 mr-1" /> {t('med.add_time')}
                  </Button>
                </div>
              </div>
              <div className="mt-2">
                <Label>{t('med.instructions')}</Label>
                <Input value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Take with food" className="mt-1" />
              </div>
              <div className="mt-2">
                <Label>{t('med.special_note')}</Label>
                <Input value={specialNote} onChange={e => setSpecialNote(e.target.value)} placeholder="Small white tablet from blue box" className="mt-1" />
              </div>
            </div>

            {/* Multilingual reminder */}
            <div>
              <Label>{t('med.voice_builder_label')}</Label>
              <Tabs defaultValue="en" className="mt-2">
                <TabsList className="w-full h-8">
                  <TabsTrigger value="en" className="text-xs flex-1">EN</TabsTrigger>
                  <TabsTrigger value="kn" className="text-xs flex-1">KN</TabsTrigger>
                  <TabsTrigger value="hi" className="text-xs flex-1">HI</TabsTrigger>
                  <TabsTrigger value="ta" className="text-xs flex-1">TA</TabsTrigger>
                </TabsList>
                {['en','kn','hi','ta'].map(lang => (
                  <TabsContent key={lang} value={lang}>
                    <Textarea value={reminderText(lang)} readOnly className="text-sm min-h-[60px]" />
                    <Button size="sm" variant="ghost" className="mt-1 text-teal text-xs" onClick={() => previewVoice(lang)}>
                      <Volume2 className="h-3 w-3 mr-1" /> Preview
                    </Button>
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            <Button className="w-full h-12 bg-teal hover:bg-teal/90 text-primary-foreground rounded-lg text-base" onClick={handleSave}>
              {t('med.save')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Camera dialog */}
      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('med.take_photo')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Webcam ref={webcamRef} screenshotFormat="image/jpeg" className="w-full rounded-lg" videoConstraints={{ facingMode: 'environment' }} />
            <div className="flex gap-2">
              <Button className="flex-1 bg-teal hover:bg-teal/90 text-primary-foreground" onClick={capturePhoto}>Capture</Button>
              <Button variant="outline" onClick={() => setCameraOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
