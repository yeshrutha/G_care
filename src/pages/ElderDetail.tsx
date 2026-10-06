import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VitalsGrid } from '@/components/VitalsGrid';
import { MedSmartInput } from '@/components/MedSmartInput';
import { useAppStore, type StoreAlarm } from '@/store';
import { from12HourParts, to12HourParts } from '@/lib/timeFormat';
import { apiFetch, getReportFileUrl } from '@/lib/api';
import { triggerAlert } from '@/lib/audioAlerts';
import { DEMO_VITALS, DEMO_MEDICATIONS, DEMO_HR_HISTORY, DEMO_MOOD_HISTORY, DEMO_ELDERS } from '@/lib/demoData';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';
import { ArrowLeft, Heart, Pill, Bell, Smile, ShieldAlert, MapPin, Watch, FileText, Volume2, Check, Plus, AlertTriangle, CheckCircle, Pencil, Trash2 } from 'lucide-react';

const API_BASE = '/api';

const getSeedMedications = () => DEMO_MEDICATIONS.map((med) => ({
  id: med.id,
  elder_id: med.elder_id,
  brand_name: med.brand_name,
  generic_name: med.generic_name,
  category: med.category,
  dose_amount: med.dose_amount,
  dose_unit: med.dose_unit,
  frequency: med.frequency,
  times: med.times,
  instructions: med.instructions,
  photo: med.photo_url,
  photo_url: med.photo_url,
  pronunciation_en: med.pronunciation_en,
  pronunciation_kn: med.pronunciation_kn,
  pronunciation_hi: med.pronunciation_hi,
  pronunciation_ta: med.pronunciation_ta,
  pill_description: med.pill_description,
  active: med.active,
}));

interface ElderAlert {
  id: string;
  type: 'medicine_missed' | 'sos' | 'fall' | 'vital_abnormal' | 'geofence';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  time: string;
  acknowledged: boolean;
  location?: string;
}

interface ElderAlarm {
  id: string;
  label: string;
  time: string;
  repeat: string;
  enabled: boolean;
}

const alertIcon = (type: string) => {
  switch (type) {
    case 'sos': return <ShieldAlert className="h-5 w-5 text-destructive" />;
    case 'fall': return <AlertTriangle className="h-5 w-5 text-destructive" />;
    case 'medicine_missed': return <Pill className="h-5 w-5 text-gw-amber" />;
    case 'vital_abnormal': return <Heart className="h-5 w-5 text-gw-amber" />;
    case 'geofence': return <MapPin className="h-5 w-5 text-gw-amber" />;
    default: return <AlertTriangle className="h-5 w-5 text-muted-foreground" />;
  }
};

const severityColor = (s: string) => {
  switch (s) {
    case 'critical': return 'bg-destructive text-primary-foreground';
    case 'warning': return 'bg-gw-amber text-primary-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
};

const INITIAL_ALERTS: ElderAlert[] = [
  { id: 'ea-1', type: 'vital_abnormal', severity: 'warning', message: 'Heart rate elevated to 102 bpm for 10 minutes', time: new Date(Date.now() - 7200000).toISOString(), acknowledged: false, location: 'Home — Living Room' },
  { id: 'ea-2', type: 'medicine_missed', severity: 'warning', message: 'Ecosprin 75mg missed at 9:00 AM', time: new Date(Date.now() - 14400000).toISOString(), acknowledged: false },
  { id: 'ea-3', type: 'geofence', severity: 'warning', message: 'Left safe zone for 8 minutes', time: new Date(Date.now() - 86400000).toISOString(), acknowledged: true, location: 'Sadashivanagar, Bangalore' },
  { id: 'ea-4', type: 'fall', severity: 'critical', message: 'Possible fall detected — accelerometer spike', time: new Date(Date.now() - 172800000).toISOString(), acknowledged: true, location: 'Home — Bathroom' },
  { id: 'ea-5', type: 'sos', severity: 'critical', message: '🚨 SOS button pressed on watch', time: new Date(Date.now() - 259200000).toISOString(), acknowledged: true, location: 'Sadashivanagar Park' },
];

const INITIAL_ALARMS: ElderAlarm[] = [
  { id: 'alarm-1', label: 'Morning Medication', time: '08:00 AM', repeat: 'Daily', enabled: true },
  { id: 'alarm-2', label: 'Evening Medication', time: '08:00 PM', repeat: 'Daily', enabled: true },
  { id: 'alarm-3', label: 'Blood Pressure Check', time: '10:00 AM', repeat: 'Daily', enabled: true },
  { id: 'alarm-4', label: 'Afternoon Walk', time: '04:00 PM', repeat: 'Mon-Sat', enabled: false },
];

const ElderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    activeAlerts, setActiveAlerts, resolveAlert, removeAlert,
    demoElders,
    activeElderId,
    setActiveElderId,
    demoVitals,
    medications: sharedMedications,
    setMedications,
    alarms: storeAlarms,
    setAlarms: setStoreAlarms,
    addAlarm: addStoreAlarm,
    updateAlarm: updateStoreAlarm,
    deleteAlarm: deleteStoreAlarm,
  } = useAppStore();
  const [moodRecorded, setMoodRecorded] = useState(false);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const elderAlerts = activeAlerts.filter(a => a.elder_id === id).map(a => ({ ...a, acknowledged: a.resolved })) as ElderAlert[];
  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [alarmForm, setAlarmForm] = useState({
    label: '',
    time: '08:00',
    period: 'AM',
    repeat: 'Daily',
    enabled: true,
  });

  const [medicalReports, setMedicalReports] = useState<any[]>([]);

  const elder = demoElders.find(e => e.id === id) || { id: id || '', full_name: 'Patient unavailable', age: 0, medical_conditions: [], language_pref: '', connection_status: 'disconnected', battery: null };
  const vitals = demoVitals[elder.id];
  const medications = sharedMedications
    .filter(m => m.elder_id === elder.id);

  // Synchronize active elder context across the application
  useEffect(() => {
    if (elder?.id && activeElderId !== elder.id) {
      setActiveElderId(elder.id);
    }
  }, [elder?.id, activeElderId, setActiveElderId]);

  // Fetch clinical medical reports for this elder
  useEffect(() => {
    if (!elder?.id) return;
    let cancelled = false;
    apiFetch<any[]>(`/reports?elderId=${elder.id}`)
      .then((data) => {
        if (!cancelled) setMedicalReports(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setMedicalReports([]);
      });
    return () => { cancelled = true; };
  }, [elder?.id]);

  const alarms: ElderAlarm[] = useMemo(() => {
    return storeAlarms
      .filter((a) => a.elderId === elder.id)
      .map((a) => ({
        id: a.id,
        label: a.title,
        time: a.time,
        repeat: a.repeat || 'Daily',
        enabled: a.enabled !== undefined ? a.enabled : a.status !== 'Paused',
      }));
  }, [storeAlarms, elder.id]);

  useEffect(() => {
    let ignore = false;

    apiFetch<{ medications?: ReturnType<typeof getSeedMedications>; alarms?: any[] }>('/dashboard-data')
      .then((data) => {
        if (!ignore) {
          if (Array.isArray(data.medications) && data.medications.length > 0) {
            setMedications((current) => {
              const merged = [...current];
              data.medications.forEach((m) => {
                const idx = merged.findIndex((x) => x.id === m.id);
                if (idx >= 0) merged[idx] = { ...merged[idx], ...m };
                else merged.push(m);
              });
              return merged;
            });
          }
          if (Array.isArray(data.alarms) && data.alarms.length > 0) {
            setStoreAlarms((current) => {
              const merged = [...current];
              data.alarms.forEach((a) => {
                const idx = merged.findIndex((x) => x.id === a.id);
                if (idx >= 0) merged[idx] = { ...merged[idx], ...a };
                else merged.push(a);
              });
              return merged;
            });
          }
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [elder.id, setMedications, setStoreAlarms]);

  const [liveHistory,setLiveHistory]=useState<Array<{time:string;hr:number;spo2:number;stress:number;breathing:number}>>([]);
  useEffect(()=>{let cancelled=false;setLiveHistory([]);const load=async()=>{try{const rows=await apiFetch<any[]>('/vitals?elderId='+encodeURIComponent(elder.id)+'&limit=1000');if(!cancelled)setLiveHistory(rows.filter(r=>Date.now()-new Date(r.timestamp).getTime()<=3600000).reverse().map(r=>({time:new Date(r.timestamp).toLocaleTimeString(),hr:r.heart_rate,spo2:r.spo2,stress:r.stress,breathing:r.breathing_rate})));}catch{if(!cancelled)setLiveHistory([]);}};void load();const timer=setInterval(load,5000);return()=>{cancelled=true;clearInterval(timer);};},[elder.id]);

  const chartData = liveHistory;

  const moodData: typeof DEMO_MOOD_HISTORY = [];
  const moods = [
    { emoji: '😄', label: t('mood.great'), score: 5 },
    { emoji: '🙂', label: t('mood.good'), score: 4 },
    { emoji: '😐', label: t('mood.okay'), score: 3 },
    { emoji: '😔', label: t('mood.low'), score: 2 },
    { emoji: '😰', label: t('mood.anxious'), score: 1 },
  ];

  const baselineData = [
    { vital: t('vitals.hr'), range: '60–80 bpm', current: vitals?.heart_rate ?? 'Not available', status: 'normal' },
    { vital: t('vitals.bp'), range: '110–130 mmHg', current: vitals?.systolic_bp ?? 'Not available', status: vitals && vitals.systolic_bp > 135 ? 'elevated' : 'normal' },
    { vital: t('vitals.spo2'), range: '95–99%', current: vitals?.spo2 ?? 'Not available', status: 'normal' },
    { vital: t('vitals.stress'), range: '10–45', current: vitals?.stress ?? 'Not available', status: vitals && vitals.stress > 50 ? 'elevated' : 'normal' },
    { vital: t('vitals.hydration'), range: '60–85%', current: vitals?.hydration ?? 'Not available', status: 'normal' },
  ];

  const acknowledgeElderAlert = async (alertId: string) => {
    try {
      await apiFetch('/alerts/' + encodeURIComponent(alertId), { method: 'PUT', body: JSON.stringify({ resolved: true }) });
      resolveAlert(alertId);
    } catch (error) { toast({ title: 'Unable to acknowledge alert', description: String(error), variant: 'destructive' }); }
  };

  const removeSingleElderAlert = async (alertId: string) => {
    try {
      await apiFetch('/alerts/' + encodeURIComponent(alertId), { method: 'DELETE' });
      removeAlert(alertId);
    } catch (error) { toast({ title: 'Unable to remove alert', description: String(error), variant: 'destructive' }); }
  };

  const clearElderAlertHistory = async (mode: 'all' | 'resolved' = 'all') => {
    for (const alert of elderAlerts.filter(a => mode === 'all' || a.acknowledged)) await removeSingleElderAlert(alert.id);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try { const alerts = await apiFetch<any[]>('/alerts'); if (!cancelled) setActiveAlerts(alerts); } catch {}
    };
    void load(); const timer = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [elder.id, setActiveAlerts]);

  const handlePlayAlert = (type: string) => {
    triggerAlert(type === 'medicine_missed' ? 'medicine' : type === 'vital_abnormal' ? 'vital' : type);
  };

  const unresolvedAlerts = elderAlerts.filter(a => !a.acknowledged);
  const resolvedAlerts = elderAlerts.filter(a => a.acknowledged);
  const [clearAlertHistoryConfirmOpen, setClearAlertHistoryConfirmOpen] = useState(false);

  const resetAlarmForm = () => {
    setAlarmForm({ label: '', time: '08:00', period: 'AM', repeat: 'Daily', enabled: true });
    setEditingAlarmId(null);
  };

  const openAddAlarmDialog = () => {
    resetAlarmForm();
    setAlarmDialogOpen(true);
  };

  const openEditAlarmDialog = (alarm: ElderAlarm) => {
    const parts = to12HourParts(alarm.time);
    const timePart = parts.hour + ':' + parts.minute;
    const periodPart = parts.period;
    setAlarmForm({
      label: alarm.label,
      time: timePart,
      period: periodPart,
      repeat: ['Daily','Weekdays','Weekends','Mon-Sat','Once'].find(r => r.toLowerCase() === alarm.repeat.toLowerCase()) || 'Daily',
      enabled: alarm.enabled,
    });
    setEditingAlarmId(alarm.id);
    setAlarmDialogOpen(true);
  };

  const saveAlarm = async () => {
    if (!/^(0?[1-9]|1[0-2]):[0-5]\d$/.test(alarmForm.time)) {
      toast({ title: 'Enter a time from 01:00 to 12:59', variant: 'destructive' }); return;
    }
    const [hour, minute] = alarmForm.time.split(':');
    const formattedTime = from12HourParts({ hour, minute, period: alarmForm.period as 'AM' | 'PM' });

    const storeAlarmPayload: StoreAlarm = {
      id: editingAlarmId || `alarm-${Date.now()}`,
      elderId: elder.id,
      title: alarmForm.label.trim() || 'New Alarm',
      time: formattedTime,
      repeat: alarmForm.repeat.toLowerCase(),
      type: storeAlarms.find(a => a.id === editingAlarmId)?.type || 'medication',
      appointmentDate: storeAlarms.find(a => a.id === editingAlarmId)?.appointmentDate || (alarmForm.repeat === 'Once' ? new Date().toLocaleDateString('en-CA') : undefined),
      status: alarmForm.enabled ? 'Scheduled' : 'Paused',
      notes: `${alarmForm.label.trim()} (${alarmForm.repeat})`,
      enabled: alarmForm.enabled,
    };

    try {
      await apiFetch(`/alarms${editingAlarmId ? `/${editingAlarmId}` : ''}`, {
        method: editingAlarmId ? 'PUT' : 'POST',
        body: JSON.stringify({
          id: storeAlarmPayload.id,
          elderId: elder.id,
          title: storeAlarmPayload.title,
          time: formattedTime,
          type: storeAlarmPayload.type,
          status: storeAlarmPayload.status,
          notes: storeAlarmPayload.notes,
          repeat: storeAlarmPayload.repeat.toLowerCase(),
          appointmentDate: storeAlarmPayload.appointmentDate,
        }),
      });
    } catch (error) {
      toast({ title: 'Unable to save alarm', description: String(error), variant: 'destructive' }); return;
    }

    if (editingAlarmId) {
      updateStoreAlarm(editingAlarmId, storeAlarmPayload);
    } else {
      addStoreAlarm(storeAlarmPayload);
    }

    setAlarmDialogOpen(false);
    resetAlarmForm();
  };

  const deleteAlarm = async (alarmId: string) => {
    try {
      await apiFetch(`/alarms/${alarmId}`, { method: 'DELETE' });
    } catch (error) {
      toast({ title: 'Unable to save alarm', description: String(error), variant: 'destructive' }); return;
    }
    deleteStoreAlarm(alarmId);
  };

  const toggleAlarm = async (alarmId: string, enabled: boolean) => {
    const existing = storeAlarms.find((a) => a.id === alarmId);
    if (existing) {
      try {
        await apiFetch(`/alarms/${alarmId}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...existing,
            status: enabled ? 'Scheduled' : 'Paused',
            enabled,
          }),
        });
      } catch (error) {
        toast({ title: 'Unable to update alarm', description: String(error), variant: 'destructive' }); return;
      }
      updateStoreAlarm(alarmId, { enabled, status: enabled ? 'Scheduled' : 'Paused' });
    }
  };

  const handleVoiceCommand = (command: string) => {
    if (!('speechSynthesis' in window)) return;
    let response = '';
    if (command.includes('medication')) {
      const medNames = medications.map(m => `${m.brand_name} ${m.dose_amount}${m.dose_unit}`).join(', ');
      response = `Your current medications are: ${medNames}. Please take them as scheduled.`;
    } else if (command.includes('Metformin') || command.includes('metformin')) {
      const met = medications.find(m => m.brand_name.toLowerCase().includes('metformin'));
      response = met ? `${met.brand_name} ${met.dose_amount}${met.dose_unit}. ${met.instructions}. Take it ${met.frequency}.` : 'Metformin is not in your current prescriptions.';
    } else if (command.includes('doing') || command.includes('how am')) {
      response = `${elder.full_name} is doing well. Heart rate is ${vitals?.heart_rate ?? 'Not available'} bpm. Blood pressure is ${vitals?.systolic_bp ?? 'Not available'} over ${vitals?.diastolic_bp || 82}. Oxygen saturation is ${vitals?.spo2 ?? 'Not available'} percent. All vitals are within normal range.`;
    } else if (command.includes('call')) {
      response = 'Calling your emergency contact Priya Sharma now. Please wait.';
    } else if (command.includes('help') || command.includes('SOS')) {
      response = 'Emergency SOS activated. Alerting all emergency contacts and nearby services. Help is on the way.';
      triggerAlert('sos');
    } else if (command.includes('water') || command.includes('drink')) {
      response = 'Reminder set. I will remind you to drink water in 30 minutes.';
    } else if (command.includes('day') || command.includes('date')) {
      const today = new Date();
      response = `Today is ${today.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
    } else {
      response = 'I did not understand that command. Please try again with a supported voice command.';
    }
    const utterance = new SpeechSynthesisUtterance(response);
    utterance.lang = 'en-IN';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card border-b border-border px-6 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')}><ArrowLeft className="h-5 w-5 text-muted-foreground" /></button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal/15 flex items-center justify-center text-teal font-semibold">
            {elder.full_name.split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <h1 className="font-display text-xl text-foreground">{elder.full_name}</h1>
            <p className="text-xs text-muted-foreground">Age {elder.age} · {elder.medical_conditions.join(', ')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <Tabs defaultValue="vitals">
          <TabsList className="flex-wrap h-auto gap-1 bg-muted p-1">
            <TabsTrigger value="vitals" className="gap-1.5"><Heart className="h-3.5 w-3.5" /> Live Vitals</TabsTrigger>
            <TabsTrigger value="medications" className="gap-1.5"><Pill className="h-3.5 w-3.5" /> Medications</TabsTrigger>
            <TabsTrigger value="alarms" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Alarms</TabsTrigger>
            <TabsTrigger value="mood" className="gap-1.5"><Smile className="h-3.5 w-3.5" /> Mood</TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" /> Alerts
              {unresolvedAlerts.length > 0 && (
                <Badge className="bg-destructive text-primary-foreground text-[9px] h-4 min-w-[16px] flex items-center justify-center ml-1 p-0">{unresolvedAlerts.length}</Badge>
              )}
            </TabsTrigger>            <TabsTrigger value="reports" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Reports</TabsTrigger>
          </TabsList>

          {/* TAB 1: LIVE VITALS */}
          <TabsContent value="vitals" className="space-y-6 mt-6">

            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display">Real-Time Vitals (Last 60 Minutes)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData.slice(-60)}>
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={9} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="hr" stroke="#00B4A6" strokeWidth={2} dot={false} name="Heart Rate" />
                      <Line type="monotone" dataKey="spo2" stroke="#3B82F6" strokeWidth={1.5} dot={false} name="SpO₂" />
                      <Line type="monotone" dataKey="stress" stroke="#6B46C1" strokeWidth={1.5} dot={false} name="Stress" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {vitals && <VitalsGrid vitals={vitals} />}

            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">Personal Baselines</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2 font-medium">Vital</th>
                        <th className="text-left py-2 font-medium">Normal Range</th>
                        <th className="text-left py-2 font-medium">Current</th>
                        <th className="text-left py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baselineData.map((b, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 font-medium">{b.vital}</td>
                          <td className="py-2 text-muted-foreground">{b.range}</td>
                          <td className="py-2">{b.current}</td>
                          <td className="py-2">
                            {b.status === 'normal' ? (
                              <Badge className="bg-gw-green/15 text-gw-green border-0 text-xs">{t('vitals.normal')} ✓</Badge>
                            ) : (
                              <Badge className="bg-gw-amber/15 text-gw-amber border-0 text-xs">{t('vitals.elevated')} ⚠️</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: MEDICATIONS */}
          <TabsContent value="medications" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Medications</h2>
              <MedSmartInput elderId={elder.id} />
            </div>
            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">7-Day Adherence</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1">
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                    <div key={d} className="text-center text-[10px] text-muted-foreground font-medium">{d}</div>
                  ))}
                  {medications.flatMap(med => Array.from({length: 7}, (_, i) => {
                    const statuses = ['taken','taken','taken','late','taken','missed','taken'];
                    const s = statuses[i];
                    const colors = { taken: 'bg-gw-green', late: 'bg-gw-amber', missed: 'bg-gw-red', upcoming: 'bg-muted' };
                    return (
                      <div key={`${med.id}-${i}`} className={`h-6 rounded ${colors[s as keyof typeof colors]} opacity-80`}
                        title={`${med.brand_name}: ${s}`} />
                    );
                  }))}
                </div>
              </CardContent>
            </Card>
            {medications.map(med => (
              <Card key={med.id} className="rounded-xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center">
                      {med.photo || med.photo_url ? <img src={med.photo || med.photo_url} alt={med.brand_name} className="w-14 h-14 rounded-lg object-contain" /> : <Pill className="h-6 w-6 text-teal" />}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{med.brand_name}</h3>
                      <p className="text-xs text-muted-foreground">{med.generic_name} · {med.pronunciation_en}</p>
                      <p className="text-xs text-muted-foreground">{med.dose_amount > 0 ? `${med.dose_amount}${med.dose_unit}` : 'Dose not entered'} · {med.frequency}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className="bg-gw-green/15 text-gw-green border-0 text-[10px]">{med.times?.length ? `Next: ${med.times[0]}` : 'Schedule not entered'}</Badge>
                      <Button size="sm" variant="ghost" className="text-xs text-teal" onClick={() => {
                        if ('speechSynthesis' in window) {
                          const u = new SpeechSynthesisUtterance(`${med.pronunciation_en || med.brand_name}. ${med.dose_amount > 0 ? `${med.dose_amount} ${med.dose_unit}. ${med.instructions || ''}` : 'Dose not entered.'}`);
                          u.lang = 'en-IN';
                          speechSynthesis.speak(u);
                        }
                      }}>
                        <Volume2 className="h-3 w-3 mr-1" /> Voice Preview
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* TAB 3: ALARMS */}
          <TabsContent value="alarms" className="space-y-6 mt-6">
            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">Alarms & Reminders</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {alarms.map((alarm) => (
                  <div key={alarm.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm text-foreground">{alarm.label}</p>
                      <p className="text-xs text-muted-foreground">{alarm.time} ?? {alarm.repeat}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditAlarmDialog(alarm)}>
                        <Pencil className="h-4 w-4 text-teal" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => deleteAlarm(alarm.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      <Switch checked={alarm.enabled} onCheckedChange={(enabled) => toggleAlarm(alarm.id, enabled)} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full border-dashed border-teal/30 text-teal" onClick={openAddAlarmDialog}>
                  <Plus className="h-4 w-4 mr-1" /> Add Alarm
                </Button>
              </CardContent>
            </Card>

            <Dialog
              open={alarmDialogOpen}
              onOpenChange={(open) => {
                setAlarmDialogOpen(open);
                if (!open) {
                  resetAlarmForm();
                }
              }}
            >
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display">{editingAlarmId ? 'Edit Alarm' : 'Add Alarm'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="alarm-label">Alarm Name</Label>
                    <Input
                      id="alarm-label"
                      value={alarmForm.label}
                      onChange={(e) => setAlarmForm((current) => ({ ...current, label: e.target.value }))}
                      placeholder="Morning Medication"
                    />
                  </div>
                  <div className="grid grid-cols-[1fr,120px] gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="alarm-time">Time</Label>
                      <Input
                        id="alarm-time"
                        type="text" placeholder="08:00"
                        value={alarmForm.time}
                        onChange={(e) => setAlarmForm((current) => ({ ...current, time: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>AM / PM</Label>
                      <Select value={alarmForm.period} onValueChange={(value) => setAlarmForm((current) => ({ ...current, period: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="PM">PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Repeat</Label>
                    <Select value={alarmForm.repeat} onValueChange={(value) => setAlarmForm((current) => ({ ...current, repeat: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Daily">Daily</SelectItem>
                        <SelectItem value="Weekdays">Weekdays</SelectItem>
                        <SelectItem value="Weekends">Weekends</SelectItem>
                        <SelectItem value="Mon-Sat">Mon-Sat</SelectItem>
                        <SelectItem value="Once">Once</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <Label htmlFor="alarm-enabled">Enabled</Label>
                    <Switch
                      id="alarm-enabled"
                      checked={alarmForm.enabled}
                      onCheckedChange={(enabled) => setAlarmForm((current) => ({ ...current, enabled }))}
                    />
                  </div>
                  <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground" onClick={saveAlarm}>
                    {editingAlarmId ? 'Save Changes' : 'Add Alarm'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* TAB 4: MOOD */}
          <TabsContent value="mood" className="space-y-6 mt-6">
            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">{t('mood.checkin')}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex justify-center gap-4">
                  {moods.map(m => (
                    <button key={m.score}
                      onClick={() => { setSelectedMood(m.score); setMoodRecorded(true); }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${selectedMood === m.score ? 'bg-teal/10 ring-2 ring-teal' : 'hover:bg-muted'}`}>
                      <span className="text-3xl">{m.emoji}</span>
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                    </button>
                  ))}
                </div>
                {moodRecorded && <p className="text-center text-sm text-gw-green mt-3">{t('mood.recorded')}</p>}
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">30-Day Mood Trend</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={moodData}>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="score" stroke="#00B4A6" fill="#00B4A6" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">Activity</CardTitle></CardHeader>
              <CardContent>
                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Today's Steps</span><span className="font-medium">2,340 / 3,000</span>
                  </div>
                  <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-teal rounded-full" style={{ width: '78%' }} />
                  </div>
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{d:'Mon',s:2800},{d:'Tue',s:3100},{d:'Wed',s:2400},{d:'Thu',s:3200},{d:'Fri',s:2900},{d:'Sat',s:1800},{d:'Sun',s:2340}]}>
                      <XAxis dataKey="d" tick={{ fontSize: 10 }} />
                      <Bar dataKey="s" fill="#00B4A6" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: ALERTS — Guardian-style */}
          {/* TAB 5: ALERTS — Guardian-style */}
          <TabsContent value="alerts" className="space-y-6 mt-6">
            {/* Top Bar with Clear Options */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
              <div>
                <h3 className="font-display text-lg text-foreground">Alerts & Notifications</h3>
                <p className="text-sm text-muted-foreground">Historical and active safety alerts for {elder.full_name}.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {resolvedAlerts.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 text-muted-foreground hover:bg-muted"
                    onClick={() => clearElderAlertHistory('resolved')}
                  >
                    Clear Resolved ({resolvedAlerts.length})
                  </Button>
                )}
                {elderAlerts.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => clearElderAlertHistory('all')}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Clear Alert History
                  </Button>
                )}
              </div>
            </div>

            {/* SOS Emergency Panel */}
            {unresolvedAlerts.some(a => a.type === 'sos') && (
              <Card className="rounded-xl border-2 border-destructive bg-destructive/5 animate-pulse-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="h-8 w-8 text-destructive" />
                    <div className="flex-1">
                      <h3 className="font-bold text-destructive text-lg">🚨 SOS EMERGENCY ACTIVE</h3>
                      <p className="text-sm text-foreground mt-1">{unresolvedAlerts.find(a => a.type === 'sos')?.message}</p>
                    </div>
                    <Button variant="destructive" className="rounded-xl" onClick={() => {
                      const sos = unresolvedAlerts.find(a => a.type === 'sos');
                      if (sos) acknowledgeElderAlert(sos.id);
                    }}>Acknowledge</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active Alerts */}
            <div>
              <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-gw-amber" />
                Active Alerts ({unresolvedAlerts.length})
              </h3>
              <div className="space-y-2">
                {unresolvedAlerts.length === 0 && (
                  <Card className="rounded-xl">
                    <CardContent className="p-6 text-center text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-gw-green" />
                      No active alerts — all clear
                    </CardContent>
                  </Card>
                )}
                {unresolvedAlerts.map(alert => (
                  <Card key={alert.id} className="rounded-xl border-l-4" style={{
                    borderLeftColor: alert.severity === 'critical' ? '#E53E3E' : '#F6AD55',
                  }}>
                    <CardContent className="p-4 flex items-start gap-3">
                      {alertIcon(alert.type)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground text-sm">{elder.full_name}</span>
                          <Badge className={`text-[10px] ${severityColor(alert.severity)}`}>{alert.severity}</Badge>
                          <Badge variant="outline" className="text-[10px]">{alert.type.replace('_', ' ')}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{alert.message}</p>
                        {alert.location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" /> {alert.location}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{new Date(alert.time).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handlePlayAlert(alert.type)}>
                          <Volume2 className="h-4 w-4 text-teal" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs rounded-lg" onClick={() => acknowledgeElderAlert(alert.id)}>
                          Dismiss
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Resolved Alerts / Alert History */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg text-foreground flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-gw-green" />
                  Alert History ({resolvedAlerts.length})
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 border-destructive/40 text-destructive hover:bg-destructive hover:text-white font-medium shadow-sm"
                  onClick={() => setClearAlertHistoryConfirmOpen(true)}
                  disabled={resolvedAlerts.length === 0}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear Alert History
                </Button>
              </div>

              {resolvedAlerts.length === 0 ? (
                <Card className="rounded-xl border-dashed border-border bg-muted/20">
                  <CardContent className="p-4 text-center text-xs text-muted-foreground">
                    No resolved alerts in history for this patient.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {resolvedAlerts.map(alert => (
                    <Card key={alert.id} className="rounded-xl opacity-75 hover:opacity-100 transition-opacity">
                      <CardContent className="p-3 flex items-center gap-3">
                        {alertIcon(alert.type)}
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground">{alert.message}</p>
                          {alert.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {alert.location}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">{new Date(alert.time).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs text-gw-green border-gw-green/30">Resolved</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            title="Delete from history"
                            onClick={() => removeSingleElderAlert(alert.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Alert Types Reference */}
            <Card className="rounded-xl bg-secondary/50">
              <CardContent className="p-4">
                <h3 className="font-display text-sm text-foreground mb-3">Alert Types Monitored</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { type: 'Medicine Not Taken', desc: 'Triggered when scheduled medication is missed', audio: 'medicine' },
                    { type: 'Emergency SOS', desc: 'Watch SOS button pressed', audio: 'sos' },
                    { type: 'Fall Detected', desc: 'Accelerometer detects sudden impact', audio: 'fall' },
                    { type: 'Vital Abnormal', desc: 'HR/BP/SpO₂ outside safe range', audio: 'vital' },
                  ].map(t => (
                    <div key={t.type} className="flex items-start gap-2 p-2 rounded-lg bg-card">
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{t.type}</p>
                        <p className="text-muted-foreground">{t.desc}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => triggerAlert(t.audio)}>
                        <Volume2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 6: GEOFENCE */}

          {/* TAB 7: DEVICE */}

          {/* TAB 8: REPORTS */}
          <TabsContent value="reports" className="space-y-6 mt-6">
            {/* Clinical Documents & Doctor Uploaded Reports */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-display text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-teal" /> Verified Medical Records & Reports
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Official clinical documents and test reports uploaded by attending doctors for {elder.full_name}.
                  </p>
                </div>
                <Badge variant="outline" className="border-teal/30 text-teal bg-teal/5 text-xs">
                  {medicalReports.length} {medicalReports.length === 1 ? 'Report' : 'Reports'}
                </Badge>
              </CardHeader>
              <CardContent>
                {medicalReports.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6">
                    <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="font-medium text-foreground">No medical reports uploaded yet</p>
                    <p className="text-xs mt-1">Diagnostic reports and checkup summaries uploaded by doctors will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {medicalReports.map((report) => (
                      <div key={report.id} className="p-4 bg-muted/30 border border-border/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-secondary text-teal hover:bg-secondary border-0 text-[10px]">
                              {report.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(report.createdAt || report.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="font-medium text-foreground text-sm mt-0.5">{report.title}</h4>
                          <p className="text-xs text-muted-foreground">Doctor: {report.doctorName || report.doctor_name || 'Attending Physician'}</p>
                          {report.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 bg-background/50 p-2 rounded border border-border/40 mt-1">
                              {report.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <a
                            href={getReportFileUrl(report.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal text-primary-foreground hover:bg-teal/90 transition-colors shadow-sm"
                          >
                            <FileText className="h-3.5 w-3.5" /> Open PDF
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Health Summary */}
            <Card className="rounded-xl border-gw-purple/20 bg-gw-purple/5">
              <CardHeader><CardTitle className="font-display text-lg">Today's AI Health Summary</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {vitals ? `Latest reading: heart rate ${vitals.heart_rate} bpm; blood pressure ${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg.` : 'No readings available for this patient.'}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                  {vitals ? `SpO₂ ${vitals.spo2}%; stress ${vitals.stress}/100. These are the latest values, not a clinical assessment.` : ''}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Clear Alert History Confirmation */}
      <AlertDialog open={clearAlertHistoryConfirmOpen} onOpenChange={setClearAlertHistoryConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Alert History?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove resolved alerts for {elder.full_name} from your history view. Active emergency alerts will remain safe and visible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearElderAlertHistory('resolved');
                setClearAlertHistoryConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear History
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ElderDetail;
