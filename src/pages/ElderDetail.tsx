import React, { useMemo, useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VitalsGrid } from '@/components/VitalsGrid';
import { MedSmartInput } from '@/components/MedSmartInput';
import { useAppStore } from '@/store';
import { triggerAlert } from '@/lib/audioAlerts';
import { DEMO_VITALS, DEMO_MEDICATIONS, DEMO_HR_HISTORY, DEMO_MOOD_HISTORY, DEMO_ELDERS } from '@/lib/demoData';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';
import { ArrowLeft, Heart, Pill, Bell, Smile, ShieldAlert, MapPin, Watch, FileText, Volume2, Check, Plus, AlertTriangle, CheckCircle, Pencil, Trash2 } from 'lucide-react';

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
  const { demoVitals } = useAppStore();
  const [moodRecorded, setMoodRecorded] = useState(false);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [elderAlerts, setElderAlerts] = useState<ElderAlert[]>(INITIAL_ALERTS);
  const [alarms, setAlarms] = useState<ElderAlarm[]>(INITIAL_ALARMS);
  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [alarmForm, setAlarmForm] = useState({
    label: '',
    time: '08:00',
    period: 'AM',
    repeat: 'Daily',
    enabled: true,
  });

  const elder = DEMO_ELDERS.find(e => e.id === id) || DEMO_ELDERS[0];
  const vitals = demoVitals[elder.id] || DEMO_VITALS[elder.id];
  const medications = DEMO_MEDICATIONS.filter(m => m.elder_id === elder.id);

  const chartData = useMemo(() => DEMO_HR_HISTORY.map(d => ({
    ...d,
    time: new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  })), []);

  const moodData = DEMO_MOOD_HISTORY;
  const moods = [
    { emoji: '😄', label: t('mood.great'), score: 5 },
    { emoji: '🙂', label: t('mood.good'), score: 4 },
    { emoji: '😐', label: t('mood.okay'), score: 3 },
    { emoji: '😔', label: t('mood.low'), score: 2 },
    { emoji: '😰', label: t('mood.anxious'), score: 1 },
  ];

  const baselineData = [
    { vital: t('vitals.hr'), range: '60–80 bpm', current: vitals?.heart_rate || 68, status: 'normal' },
    { vital: t('vitals.bp'), range: '110–130 mmHg', current: vitals?.systolic_bp || 126, status: vitals && vitals.systolic_bp > 135 ? 'elevated' : 'normal' },
    { vital: t('vitals.spo2'), range: '95–99%', current: vitals?.spo2 || 97, status: 'normal' },
    { vital: t('vitals.stress'), range: '10–45', current: vitals?.stress || 32, status: vitals && vitals.stress > 50 ? 'elevated' : 'normal' },
    { vital: t('vitals.hydration'), range: '60–85%', current: vitals?.hydration || 71, status: 'normal' },
  ];

  const acknowledgeElderAlert = (alertId: string) => {
    setElderAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
  };

  const handlePlayAlert = (type: string) => {
    triggerAlert(type === 'medicine_missed' ? 'medicine' : type === 'vital_abnormal' ? 'vital' : type);
  };

  const unresolvedAlerts = elderAlerts.filter(a => !a.acknowledged);
  const resolvedAlerts = elderAlerts.filter(a => a.acknowledged);

  const resetAlarmForm = () => {
    setAlarmForm({ label: '', time: '08:00', period: 'AM', repeat: 'Daily', enabled: true });
    setEditingAlarmId(null);
  };

  const openAddAlarmDialog = () => {
    resetAlarmForm();
    setAlarmDialogOpen(true);
  };

  const openEditAlarmDialog = (alarm: ElderAlarm) => {
    const [timePart = '08:00', periodPart = 'AM'] = alarm.time.split(' ');
    setAlarmForm({
      label: alarm.label,
      time: timePart,
      period: periodPart,
      repeat: alarm.repeat,
      enabled: alarm.enabled,
    });
    setEditingAlarmId(alarm.id);
    setAlarmDialogOpen(true);
  };

  const saveAlarm = () => {
    const nextAlarm: ElderAlarm = {
      id: editingAlarmId || `alarm-${Date.now()}`,
      label: alarmForm.label.trim() || 'New Alarm',
      time: `${alarmForm.time} ${alarmForm.period}`,
      repeat: alarmForm.repeat,
      enabled: alarmForm.enabled,
    };

    if (editingAlarmId) {
      setAlarms((current) => current.map((alarm) => (alarm.id === editingAlarmId ? nextAlarm : alarm)));
    } else {
      setAlarms((current) => [...current, nextAlarm]);
    }

    setAlarmDialogOpen(false);
    resetAlarmForm();
  };

  const deleteAlarm = (alarmId: string) => {
    setAlarms((current) => current.filter((alarm) => alarm.id !== alarmId));
  };

  const toggleAlarm = (alarmId: string, enabled: boolean) => {
    setAlarms((current) => current.map((alarm) => (alarm.id === alarmId ? { ...alarm, enabled } : alarm)));
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
      response = `${elder.full_name} is doing well. Heart rate is ${vitals?.heart_rate || 68} bpm. Blood pressure is ${vitals?.systolic_bp || 126} over ${vitals?.diastolic_bp || 82}. Oxygen saturation is ${vitals?.spo2 || 97} percent. All vitals are within normal range.`;
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
            </TabsTrigger>
            <TabsTrigger value="geofence" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> Geofence</TabsTrigger>
            <TabsTrigger value="device" className="gap-1.5"><Watch className="h-3.5 w-3.5" /> Device</TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Reports</TabsTrigger>
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
                      <Pill className="h-6 w-6 text-teal" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{med.brand_name}</h3>
                      <p className="text-xs text-muted-foreground">{med.generic_name} · {med.pronunciation_en}</p>
                      <p className="text-xs text-muted-foreground">{med.dose_amount}{med.dose_unit} · {med.frequency}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className="bg-gw-green/15 text-gw-green border-0 text-[10px]">Next: {med.times[0]}</Badge>
                      <Button size="sm" variant="ghost" className="text-xs text-teal" onClick={() => {
                        if ('speechSynthesis' in window) {
                          const u = new SpeechSynthesisUtterance(`Time to take your ${med.pronunciation_en}. ${med.dose_amount} ${med.dose_unit}. ${med.instructions}`);
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
                        type="time"
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
          <TabsContent value="alerts" className="space-y-6 mt-6">
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

            {/* Resolved Alerts */}
            {resolvedAlerts.length > 0 && (
              <div>
                <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-gw-green" />
                  Resolved ({resolvedAlerts.length})
                </h3>
                <div className="space-y-2">
                  {resolvedAlerts.map(alert => (
                    <Card key={alert.id} className="rounded-xl opacity-60">
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
                        <Badge variant="outline" className="text-xs text-gw-green border-gw-green/30">Resolved</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

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
          <TabsContent value="geofence" className="space-y-6 mt-6">
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="h-72 bg-muted rounded-xl flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MapPin className="h-10 w-10 mx-auto mb-2 text-teal" />
                    <p className="text-sm">Map loads with Leaflet when GPS data is available</p>
                    <p className="text-xs mt-1">Sadashivanagar, Bangalore — Safe Zone: 500m radius</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">Zone Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Center Address</Label>
                  <Input defaultValue="123 Sadashivanagar, Bangalore 560080" className="mt-1" />
                </div>
                <div>
                  <Label>Safe Zone Radius</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <Slider defaultValue={[500]} min={100} max={5000} step={50} className="flex-1" />
                    <span className="text-sm font-medium text-foreground w-16 text-right">500m</span>
                  </div>
                </div>
                <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground">Save Geofence</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 7: DEVICE */}
          <TabsContent value="device" className="space-y-6 mt-6">
            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">Watch Status</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Device ID', value: 'GW-2024-0847' },
                    { label: 'BLE Status', value: 'Connected', dot: 'bg-gw-green' },
                    { label: 'Battery', value: `${elder.battery}%` },
                    { label: 'Firmware', value: 'v2.4.1' },
                  ].map((d, i) => (
                    <div key={i} className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">{d.label}</p>
                      <p className="font-medium text-foreground flex items-center gap-1.5 mt-0.5">
                        {d.dot && <span className={`w-2 h-2 rounded-full ${d.dot}`} />}
                        {d.value}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl">
              <CardHeader><CardTitle className="font-display text-lg">Voice Commands</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { cmd: '"Hey Guardian, what are my medications?"', key: 'medication' },
                  { cmd: '"Hey Guardian, show me my Metformin"', key: 'Metformin' },
                  { cmd: '"Hey Guardian, how am I doing?"', key: 'how am' },
                  { cmd: '"Hey Guardian, call my daughter"', key: 'call' },
                  { cmd: '"Hey Guardian, I need help" — triggers SOS', key: 'help' },
                  { cmd: '"Hey Guardian, remind me to drink water"', key: 'water' },
                  { cmd: '"Hey Guardian, what day is it?"', key: 'day' },
                ].map((item, i) => (
                  <button key={i} onClick={() => handleVoiceCommand(item.key)}
                    className="w-full flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors text-left">
                    <Volume2 className="h-4 w-4 text-teal flex-shrink-0" />
                    <span className="flex-1">{item.cmd}</span>
                    <span className="text-[10px] text-teal font-medium">▶ Play</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 8: REPORTS */}
          <TabsContent value="reports" className="space-y-6 mt-6">
            <Card className="rounded-xl border-gw-purple/20 bg-gw-purple/5">
              <CardHeader><CardTitle className="font-display text-lg">Today's AI Health Summary</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {elder.full_name}'s vitals have been largely stable over the past 24 hours. Heart rate averaged 68 bpm,
                  well within his personal baseline of 60-80 bpm. Blood pressure readings showed a mild upward trend,
                  averaging 128/84 mmHg compared to his baseline of 120/78 mmHg.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                  SpO₂ remained stable at 97%. Stress levels were slightly elevated in the evening hours, peaking at 45/100.
                  Medication adherence was good — both Metformin doses were taken on time.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" className="bg-teal hover:bg-teal/90 text-primary-foreground">Share with Doctor</Button>
                  <Button size="sm" variant="outline">Download PDF</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ElderDetail;
