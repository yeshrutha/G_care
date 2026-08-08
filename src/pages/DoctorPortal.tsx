import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { LayoutDashboard, Users, Pill, Bell, ShieldAlert, FileText, Settings, LogOut, Plus, Activity, Battery, Wifi, Bluetooth, X, Brain, TrendingUp, CheckCircle2, PhoneCall, MapPin, Pencil, Trash2, UploadCloud, Folder, Clipboard, User } from 'lucide-react';
import { GuardianLogo } from '@/components/GuardianLogo';
import { AlertBanner } from '@/components/AlertBanner';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { VitalsGrid } from '@/components/VitalsGrid';
import { MedSmartInput } from '@/components/MedSmartInput';
import { useAppStore, type DemoElder, type DemoVitals, type Medication, type DemoAlert } from '@/store';
import { useGuardianStore, type Reminder } from '@/store/guardianStore';
import { useAuthStore } from '@/store/authStore';
import { apiFetch } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { DEMO_ELDERS, DEMO_MEDICATIONS, DEMO_VITALS, generateVitalsUpdate } from '@/lib/demoData';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

type DashboardSection = 'dashboard' | 'elders' | 'medications' | 'alarms' | 'alerts' | 'reports';

type DashboardMedication = Medication;

type DashboardAlarm = {
  id: string;
  elderId: string;
  title: string;
  time: string;
  type: 'medication' | 'food' | 'activity' | 'appointment';
  status: 'Due soon' | 'Scheduled' | 'Paused';
  notes: string;
};

interface ClinicalReport {
  id: string;
  elderId: string;
  doctorId: string;
  doctorName: string;
  title: string;
  description: string;
  category: string;
  fileUrl: string;
  createdAt: string;
}

interface DoctorCareTeam {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialization: string;
  hospital: string;
}

const getSeedMedications = (): DashboardMedication[] => DEMO_MEDICATIONS.map((med) => ({
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
  active: med.active,
}));

const NAV = [
  { icon: LayoutDashboard, label: 'nav.dashboard', section: 'dashboard' },
  { icon: Users, label: 'nav.elders', section: 'elders' },
  { icon: Pill, label: 'nav.medications', section: 'medications' },
  { icon: Bell, label: 'nav.alarms', section: 'alarms' },
  { icon: ShieldAlert, label: 'nav.alerts', section: 'alerts', badge: true },
  { icon: FileText, label: 'nav.reports', section: 'reports' },
  { icon: Settings, label: 'nav.settings', path: '/settings' },
] satisfies Array<{
  icon: React.ElementType;
  label: string;
  section?: DashboardSection;
  path?: string;
  badge?: boolean;
}>;

const SECTION_TITLES: Record<DashboardSection, string> = {
  dashboard: 'Dashboard',
  elders: 'Elders',
  medications: 'Medications',
  alarms: 'Alarms',
  alerts: 'Alerts',
  reports: 'Clinical Workspace',
};

const DoctorPortal: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { demoMode, setDemoMode, demoElders, setDemoElders, demoVitals, setDemoVitals, activeAlerts, setActiveAlerts, addAlert, medications, setMedications, setDemoStep, demoStep } = useAppStore();
  const { user: authUser, logout } = useAuthStore();
  const setReminders = useGuardianStore((state) => state.setReminders);

  const [addElderOpen, setAddElderOpen] = useState(false);
  const [newElder, setNewElder] = useState({
    name: '', age: '', conditions: '', language: 'en', phone: '', address: '',
  });
  const [btConnecting, setBtConnecting] = useState(false);
  const [btConnected, setBtConnected] = useState(false);
  const [btDeviceId, setBtDeviceId] = useState('');
  const [activeSection, setActiveSection] = useState<DashboardSection>('dashboard');
  const [addMedicationOpen, setAddMedicationOpen] = useState(false);
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);
  const [deleteMedicationId, setDeleteMedicationId] = useState<string | null>(null);
  const [addAlarmOpen, setAddAlarmOpen] = useState(false);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [deleteAlarmId, setDeleteAlarmId] = useState<string | null>(null);
  const [alarms, setAlarms] = useState<DashboardAlarm[]>([
    { id: 'alarm-1', time: '08:00', title: 'Morning medicines', elderId: 'elder-1', status: 'Due soon', type: 'medication', notes: 'Morning medication reminder' },
    { id: 'alarm-2', time: '08:30', title: 'Breakfast reminder', elderId: 'elder-1', status: 'Scheduled', type: 'food', notes: 'Breakfast reminder' },
    { id: 'alarm-3', time: '12:30', title: 'Lunch reminder', elderId: 'elder-2', status: 'Scheduled', type: 'food', notes: 'Lunch reminder' },
    { id: 'alarm-4', time: '18:30', title: 'Evening walk', elderId: 'elder-3', status: 'Scheduled', type: 'activity', notes: 'Evening activity reminder' },
  ]);
  const [newMedication, setNewMedication] = useState({
    elderId: '',
    tabletName: '',
    genericName: '',
    category: 'General',
    doseAmount: '',
    doseUnit: 'mg',
    frequency: 'Once daily',
    time: '08:00',
    instructions: 'Take after food',
    photo: '',
  });
  const [newAlarm, setNewAlarm] = useState({
    elderId: '',
    title: '',
    time: '08:00',
    type: 'medication' as DashboardAlarm['type'],
    status: 'Scheduled' as DashboardAlarm['status'],
    notes: '',
  });

  // Doctor Clinical Workspace Specific State
  const [clinicalElderId, setClinicalElderId] = useState<string>('');
  const [clinicalNote, setClinicalNote] = useState('');
  const [notesList, setNotesList] = useState<any[]>([]);
  const [reportsList, setReportsList] = useState<ClinicalReport[]>([]);
  const [newReport, setNewReport] = useState({
    title: '',
    category: 'Lab Report',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewReport, setPreviewReport] = useState<ClinicalReport | null>(null);
  const [careTeam, setCareTeam] = useState<DoctorCareTeam[]>([]);

  const [logVitalsOpen, setLogVitalsOpen] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    elderId: '',
    heart_rate: 72,
    systolic_bp: 120,
    diastolic_bp: 80,
    spo2: 98,
    stress: 20,
    hydration: 80,
    breathing_rate: 16,
    skin_temp: 36.6,
    source: 'manual' as const,
  });

  const handleLogVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vitalsForm.elderId) {
      toast({ title: 'Error', description: 'Please select a patient', variant: 'destructive' });
      return;
    }

    try {
      await apiFetch<any>('/vitals', {
        method: 'POST',
        body: JSON.stringify(vitalsForm),
      });

      setDemoVitals(vitalsForm.elderId, {
        heart_rate: vitalsForm.heart_rate,
        systolic_bp: vitalsForm.systolic_bp,
        diastolic_bp: vitalsForm.diastolic_bp,
        spo2: vitalsForm.spo2,
        stress: vitalsForm.stress,
        hydration: vitalsForm.hydration,
        breathing_rate: vitalsForm.breathing_rate,
        skin_temp: vitalsForm.skin_temp,
        shiver_detected: false,
        panic_detected: false,
        fall_detected: false,
      });

      toast({ title: 'Success', description: 'Vitals logged successfully' });
      setLogVitalsOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to log vitals', variant: 'destructive' });
    }
  };

  const elders = demoElders.length > 0 ? demoElders : DEMO_ELDERS;

  // Initialize selected patient in clinical space
  useEffect(() => {
    if (elders.length > 0 && !clinicalElderId) {
      setClinicalElderId(elders[0].id);
    }
  }, [elders, clinicalElderId]);

  // Load clinical records when active patient changes
  useEffect(() => {
    if (!clinicalElderId) return;
    let ignore = false;

    // Fetch notes
    apiFetch<any[]>(`/clinical-notes?elderId=${clinicalElderId}`)
      .then((data) => {
        if (ignore) return;
        setNotesList(data);
      })
      .catch(() => {
        if (ignore) return;
        setNotesList([
          { id: 'note-1', note: 'Patient showing good response to current antihypertensive regimen. BP trend improving.', doctorName: 'Dr. Ramesh Kumar', createdAt: new Date(Date.now() - 36000000).toISOString() }
        ]);
      });

    // Fetch reports
    apiFetch<ClinicalReport[]>(`/reports?elderId=${clinicalElderId}`)
      .then((data) => {
        if (ignore) return;
        setReportsList(data);
      })
      .catch(() => {
        if (ignore) return;
        setReportsList([
          { id: 'rep-1', elderId: clinicalElderId, doctorId: 'dr-1', doctorName: 'Dr. Ramesh Kumar', title: 'Complete Blood Count (CBC)', description: 'Hemoglobin levels normal. WBC and Platelets inside limits. Blood glucose marginally elevated.', category: 'Lab Report', fileUrl: 'cbc_report.pdf', createdAt: new Date(Date.now() - 172800000).toISOString() }
        ]);
      });

    // Fetch Care Team
    apiFetch<DoctorCareTeam[]>(`/care-team?elderId=${clinicalElderId}`)
      .then((data) => {
        if (ignore) return;
        setCareTeam(data);
      })
      .catch(() => {
        if (ignore) return;
        setCareTeam([
          { id: 'dr-1', name: 'Dr. Ramesh Kumar', email: 'dr.ramesh@apollo.in', phone: '+91 98765 43211', specialization: 'Cardiologist', hospital: 'Apollo Hospitals' }
        ]);
      });

    return () => { ignore = true; };
  }, [clinicalElderId]);

  const handleSaveNote = async () => {
    if (!clinicalNote.trim() || !clinicalElderId) return;
    try {
      const saved = await apiFetch<any>('/clinical-notes', {
        method: 'POST',
        body: JSON.stringify({
          elderId: clinicalElderId,
          note: clinicalNote,
        }),
      });
      setNotesList((prev) => [saved, ...prev]);
      setClinicalNote('');
      toast({ title: 'Success', description: 'Clinical note saved successfully' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save note', variant: 'destructive' });
    }
  };

  const simulateFileUpload = () => {
    setSelectedFile({ name: `${newReport.title.toLowerCase().replace(/\s+/g, '_') || 'medical_record'}.pdf`, size: '1.2 MB' });
  };

  const handleUploadReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReport.title.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter a report title.', variant: 'destructive' });
      return;
    }

    try {
      setUploadProgress(10);
      const timer = setInterval(() => {
        setUploadProgress((p) => {
          if (p === null) return null;
          if (p >= 100) {
            clearInterval(timer);
            return 100;
          }
          return p + 30;
        });
      }, 150);

      await new Promise((r) => setTimeout(r, 600));
      const fileUrl = selectedFile ? selectedFile.name : 'uploaded_report.pdf';

      const saved = await apiFetch<ClinicalReport>('/reports', {
        method: 'POST',
        body: JSON.stringify({
          elderId: clinicalElderId,
          title: newReport.title,
          category: newReport.category,
          description: newReport.description,
          fileUrl,
        }),
      });

      setReportsList((prev) => [saved, ...prev]);
      setNewReport({ title: '', category: 'Lab Report', description: '' });
      setSelectedFile(null);
      setUploadProgress(null);
      toast({ title: 'Success', description: 'Clinical report uploaded successfully' });
    } catch (err: any) {
      setUploadProgress(null);
      toast({ title: 'Error', description: err.message || 'Failed to upload report', variant: 'destructive' });
    }
  };

  useEffect(() => {
    const medReminders = medications.map(med => {
      const dosage = `${med.dose_amount}${med.dose_unit}`;
      return med.times.map((time, idx) => ({
        id: `med-${med.id}-${idx}`,
        elderId: med.elder_id,
        elderName: elders.find((elder) => elder.id === med.elder_id)?.full_name || 'Registered elder',
        type: 'medication' as const,
        title: `${med.brand_name} ${dosage}`,
        time: time,
        repeat: 'daily' as const,
        verified: false,
        pillName: med.brand_name,
        dosage: dosage,
        photo: med.photo || '',
        createdAt: new Date().toISOString(),
      }));
    }).flat();

    const alarmReminders = alarms.filter(alarm => alarm.type !== 'medication').map(alarm => ({
      id: `alarm-${alarm.id}`,
      elderId: alarm.elderId,
      elderName: elders.find((elder) => elder.id === alarm.elderId)?.full_name || 'Registered elder',
      type: alarm.type,
      title: alarm.title,
      time: alarm.time,
      repeat: 'daily' as const,
      verified: false,
      createdAt: new Date().toISOString(),
    }));

    setReminders([...medReminders, ...alarmReminders]);
  }, [medications, alarms, elders, setReminders]);

  // Initialize demo data if demoMode is enabled
  useEffect(() => {
    if (demoMode) {
      if (demoElders.length === 0) setDemoElders(DEMO_ELDERS);
      if (medications.length === 0) setMedications(getSeedMedications());
      Object.entries(DEMO_VITALS).forEach(([id, v]) => setDemoVitals(id, v));
    }
  }, [demoMode, demoElders.length, medications.length, setDemoElders, setDemoVitals, setMedications]);

  useEffect(() => {
    if (demoMode) return;
    let ignore = false;

    apiFetch<any>('/dashboard-data')
      .then((data) => {
        if (ignore) return;
        if (Array.isArray(data.elders)) {
          setDemoElders(data.elders);
        }
        if (Array.isArray(data.medications)) setMedications(data.medications);
        if (Array.isArray(data.alarms)) setAlarms(data.alarms);
        if (Array.isArray(data.alerts)) setActiveAlerts(data.alerts);
        if (data.vitals) {
          Object.entries(data.vitals).forEach(([id, v]) => setDemoVitals(id, v as any));
        }
      })
      .catch(() => {});

    return () => { ignore = true; };
  }, [demoMode, setActiveAlerts, setMedications]);

  // Demo mode scripted timeline
  useEffect(() => {
    if (!demoMode) { setDemoStep(0); return; }
    const timers: NodeJS.Timeout[] = [];
    timers.push(setTimeout(() => setDemoStep(1), 20000));
    timers.push(setTimeout(() => setDemoStep(2), 40000));
    timers.push(setTimeout(() => setDemoStep(3), 55000));
    timers.push(setTimeout(() => {
      setDemoStep(4);
      addAlert({
        id: 'demo-geo', elder_name: 'Usha', type: 'geofence', severity: 'warning',
        message: 'Usha left safe zone (Sadashivanagar, Bangalore) at 9:14 AM. Currently 340m away.',
        location: 'Sadashivanagar, Bangalore', time: new Date().toISOString(), resolved: false,
      });
    }, 70000));
    timers.push(setTimeout(() => {
      setDemoStep(5);
      addAlert({
        id: 'demo-sos', elder_name: 'Usha', type: 'sos', severity: 'critical',
        message: '🚨 EMERGENCY — Usha pressed SOS at 9:15 AM',
        location: 'Sadashivanagar, Bangalore', time: new Date().toISOString(), resolved: false,
      });
    }, 85000));
    timers.push(setTimeout(() => setDemoStep(6), 100000));
    timers.push(setTimeout(() => setDemoStep(7), 120000));
    return () => timers.forEach(clearTimeout);
  }, [demoMode, setDemoStep, addAlert]);

  // Live vitals updates inside simulator mode
  useEffect(() => {
    if (!demoMode) return;
    const interval = setInterval(() => {
      Object.entries(demoVitals).forEach(([id, v]) => {
        setDemoVitals(id, generateVitalsUpdate(v));
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [demoMode, demoVitals, setDemoVitals]);

  const unresolvedCount = activeAlerts.filter(a => !a.resolved).length;

  const sparkData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({ v: 65 + Math.sin(i / 1.5) * 6 + Math.random() * 3 }));
  }, []);

  const careIntelligence = useMemo(() => {
    if (elders.length === 0) return { topPriority: null, profiles: [] };
    const profiles = elders.map((elder) => {
      const vitals = demoVitals[elder.id] || DEMO_VITALS[elder.id];
      
      let score = 0;
      if (elder.connection_status === 'disconnected') score += 10;
      if (elder.battery < 20) score += 15;
      
      if (vitals) {
        if (vitals.spo2 < 94) score += 24;
        if (vitals.systolic_bp >= 140 || vitals.diastolic_bp >= 90) score += 18;
        if (vitals.heart_rate > 95 || vitals.heart_rate < 55) score += 14;
        if (vitals.stress > 55) score += 12;
      }

      let risk: 'low' | 'moderate' | 'high' = 'low';
      let color = 'text-gw-green border-gw-green/30 bg-gw-green/10';
      let border = 'border-gw-green/30';
      let label = 'Stable';
      if (score > 15) { risk = 'moderate'; color = 'text-gw-amber border-gw-amber/30 bg-gw-amber/10'; border = 'border-gw-amber/30'; label = 'Observation'; }
      if (score > 30) { risk = 'high'; color = 'text-gw-red border-gw-red/30 bg-gw-red/10'; border = 'border-gw-red/30'; label = 'Action Required'; }

      let recommendation = 'Vitals are inside personal range. Keep routine monitoring active.';
      if (vitals) {
        if (vitals.spo2 < 94) recommendation = 'Check breathing comfort and keep oxygen trend under review.';
        else if (vitals.systolic_bp >= 140 || vitals.diastolic_bp >= 90) recommendation = 'Repeat BP reading after rest and notify doctor if trend continues.';
        else if (vitals.stress > 55) recommendation = 'Schedule a short check-in and review sleep or anxiety triggers.';
      }

      return { elder, vitals, riskScore: score, risk: { label, color, border }, recommendation };
    });

    const sorted = [...profiles].sort((a, b) => b.riskScore - a.riskScore);
    return {
      topPriority: sorted[0]?.riskScore > 0 ? sorted[0] : null,
      profiles: sorted,
    };
  }, [elders, demoVitals]);

  const handleAddElder = async () => {
    if (!newElder.name || !newElder.age) return;
    const body = {
      full_name: newElder.name,
      age: Number(newElder.age),
      medical_conditions: newElder.conditions.split(',').map(s => s.trim()).filter(Boolean),
      language_pref: newElder.language,
      connection_status: 'connected' as const,
      battery: 100,
      last_vitals_at: new Date().toISOString(),
      baselines_learned: false,
      baseline_day: 1,
    };

    let savedElder = {
      ...body,
      id: `elder-${Date.now()}`,
    };

    try {
      const saved = await apiFetch<any>('/elders', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (saved) savedElder = saved;
    } catch {}

    setDemoElders([...elders, savedElder]);
    setDemoVitals(savedElder.id, {
      heart_rate: 72, systolic_bp: 120, diastolic_bp: 78, spo2: 97,
      stress: 30, hydration: 70, breathing_rate: 16, skin_temp: 36.5,
      shiver_detected: false, panic_detected: false, fall_detected: false,
    });
    setNewElder({ name: '', age: '', conditions: '', language: 'en', phone: '', address: '' });
    setAddElderOpen(false);
    toast({ title: 'Success', description: 'Patient profile created successfully' });
  };

  const handleAddMedication = async (medication: Omit<Medication, 'id'>) => {
    let savedMedication = medication as Medication;
    try {
      savedMedication = await apiFetch<DashboardMedication>(`/medications${editingMedicationId ? `/${editingMedicationId}` : ''}`, {
        method: editingMedicationId ? 'PUT' : 'POST',
        body: JSON.stringify(medication),
      });
    } catch {}

    if (editingMedicationId) {
      setMedications(medications.map(m => m.id === editingMedicationId ? savedMedication : m));
    } else {
      setMedications([savedMedication, ...medications]);
    }
    setAddMedicationOpen(false);
    setEditingMedicationId(null);
    toast({ title: 'Success', description: 'Medication schedule saved' });
  };

  const handleAddAlarm = async (alarm: Omit<DashboardAlarm, 'id'>) => {
    let savedAlarm = alarm as DashboardAlarm;
    try {
      savedAlarm = await apiFetch<DashboardAlarm>(`/alarms${editingAlarmId ? `/${editingAlarmId}` : ''}`, {
        method: editingAlarmId ? 'PUT' : 'POST',
        body: JSON.stringify(alarm),
      });
    } catch {}

    if (editingAlarmId) {
      setAlarms(alarms.map(a => a.id === editingAlarmId ? savedAlarm : a));
    } else {
      setAlarms([savedAlarm, ...alarms]);
    }
    setAddAlarmOpen(false);
    setEditingAlarmId(null);
    toast({ title: 'Success', description: 'Reminder alarm saved' });
  };

  const handleDeleteMedication = async () => {
    if (!deleteMedicationId) return;
    try {
      await apiFetch(`/medications/${deleteMedicationId}`, { method: 'DELETE' });
    } catch {}
    setMedications(medications.filter(m => m.id !== deleteMedicationId));
    setDeleteMedicationId(null);
    toast({ title: 'Deleted', description: 'Medication removed' });
  };

  const handleDeleteAlarm = async () => {
    if (!deleteAlarmId) return;
    try {
      await apiFetch(`/alarms/${deleteAlarmId}`, { method: 'DELETE' });
    } catch {}
    setAlarms(alarms.filter(a => a.id !== deleteAlarmId));
    setDeleteAlarmId(null);
    toast({ title: 'Deleted', description: 'Reminder alarm removed' });
  };

  const activeReport = null;
  const activeReportId = null;
  const setActiveReportId = (id: any) => {};

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <GuardianLogo />
          <p className="text-xs text-muted-foreground mt-2 font-semibold tracking-wider text-teal uppercase">Doctor Portal</p>
        </div>
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-teal text-primary-foreground flex items-center justify-center font-bold">
            {(authUser?.name || 'D')[0]}
          </div>
          <div className="text-sm">
            <p className="font-medium text-foreground">{authUser?.name || 'Dr. Ramesh Kumar'}</p>
            <p className="text-xs text-muted-foreground capitalize">{authUser?.role || 'doctor'}</p>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((item, i) => (
            <button key={i} onClick={() => item.path ? navigate(item.path) : item.section && setActiveSection(item.section)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                item.section === activeSection
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}>
              <item.icon className="h-4 w-4" />
              <span>{t(item.label)}</span>
              {item.badge && unresolvedCount > 0 && (
                <Badge className="ml-auto bg-gw-red text-primary-foreground border-0 text-[10px] h-5 min-w-[20px] flex items-center justify-center">{unresolvedCount}</Badge>
              )}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <button onClick={async () => { await logout(); navigate('/'); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="flex items-center justify-between border-b border-border/60 pb-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">
                {t(SECTION_TITLES[activeSection])}
              </h1>
              <p className="text-sm text-muted-foreground">
                {activeSection === 'dashboard' ? 'Overview of all monitored patient profiles.' : 'Manage details for ' + SECTION_TITLES[activeSection]}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 border border-gw-purple/30 bg-gw-purple/5 px-3 py-1.5 rounded-lg">
                <span className="text-xs text-muted-foreground">{t('dashboard.demo_mode')}</span>
                <Switch checked={demoMode} onCheckedChange={setDemoMode} />
              </div>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={async () => { await logout(); navigate('/'); }}>
                <LogOut className="h-4 w-4 mr-1" /> {t('nav.logout')}
              </Button>
            </div>
          </header>

          {/* Active section rendering */}

          {/* DASHBOARD SECTION */}
          {activeSection === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Alert panel */}
                {unresolvedCount > 0 && (
                  <AlertBanner count={unresolvedCount} onClick={() => setActiveSection('alerts')} />
                )}
                
                {/* Main Care Intelligence summaries */}
                {careIntelligence.topPriority && (
                  <Card className="rounded-xl border border-gw-amber/30 bg-gw-amber/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                        <Brain className="h-4 w-4 text-gw-amber" /> Care Intelligence Alert
                      </CardTitle>
                      <Badge variant="outline" className={`${careIntelligence.topPriority.risk.color} ${careIntelligence.topPriority.risk.border} bg-background/70`}>
                        {careIntelligence.topPriority.risk.label} {careIntelligence.topPriority.riskScore}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <p className="text-base font-semibold text-foreground">
                        {careIntelligence.topPriority.elder.full_name}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                        {careIntelligence.topPriority.recommendation}
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-background/80 p-3">
                          <p className="text-muted-foreground">SpO2</p>
                          <p className="mt-1 font-semibold text-foreground">{careIntelligence.topPriority?.vitals?.spo2 ?? '--'}%</p>
                        </div>
                        <div className="rounded-lg bg-background/80 p-3">
                          <p className="text-muted-foreground">BP</p>
                          <p className="mt-1 font-semibold text-foreground">
                            {careIntelligence.topPriority?.vitals ? `${careIntelligence.topPriority.vitals.systolic_bp}/${careIntelligence.topPriority.vitals.diastolic_bp}` : '--'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-background/80 p-3">
                          <p className="text-muted-foreground">Stress</p>
                          <p className="mt-1 font-semibold text-foreground">{careIntelligence.topPriority?.vitals?.stress ?? '--'}/100</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              
              <div className="space-y-6">
                <Card className="rounded-xl border border-gw-purple/30 bg-gw-purple/5">
                  <CardHeader><CardTitle className="font-display text-sm flex items-center gap-2">🤖 AI Mood Insight</CardTitle></CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Usha has reported feeling Anxious 3 of the last 5 days. Consider checking in.
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ELDERS LIST SECTION */}
          {(activeSection === 'dashboard' || activeSection === 'elders') && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl text-foreground">{t('nav.elders')}</h2>
                <div className="flex gap-2">
                  {!demoMode && (
                    <Dialog open={logVitalsOpen} onOpenChange={(open) => {
                      setLogVitalsOpen(open);
                      if (open && elders.length > 0 && !vitalsForm.elderId) {
                        setVitalsForm(prev => ({ ...prev, elderId: elders[0].id }));
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="border-teal text-teal hover:bg-teal/10 rounded-lg">
                          <Activity className="h-4 w-4 mr-1" /> Log Vitals
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="font-display">Log Patient Vitals</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleLogVitals} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="vitals-elder">Select Patient *</Label>
                            <Select value={vitalsForm.elderId} onValueChange={(val) => setVitalsForm({ ...vitalsForm, elderId: val })}>
                              <SelectTrigger id="vitals-elder"><SelectValue placeholder="Choose a patient" /></SelectTrigger>
                              <SelectContent>
                                {elders.map((e) => (
                                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label htmlFor="vitals-hr">Heart Rate (bpm)</Label>
                              <Input id="vitals-hr" type="number" min="0" max="300" value={vitalsForm.heart_rate}
                                onChange={e => setVitalsForm({ ...vitalsForm, heart_rate: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="vitals-spo2">Oxygen SpO2 (%)</Label>
                              <Input id="vitals-spo2" type="number" min="0" max="100" value={vitalsForm.spo2}
                                onChange={e => setVitalsForm({ ...vitalsForm, spo2: Number(e.target.value) })} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label htmlFor="vitals-sbp">Systolic BP (mmHg)</Label>
                              <Input id="vitals-sbp" type="number" min="0" max="300" value={vitalsForm.systolic_bp}
                                onChange={e => setVitalsForm({ ...vitalsForm, systolic_bp: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="vitals-dbp">Diastolic BP (mmHg)</Label>
                              <Input id="vitals-dbp" type="number" min="0" max="200" value={vitalsForm.diastolic_bp}
                                onChange={e => setVitalsForm({ ...vitalsForm, diastolic_bp: Number(e.target.value) })} />
                            </div>
                          </div>
                          <Button type="submit" className="w-full bg-teal hover:bg-teal/90 text-primary-foreground mt-4">Save Vitals</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                  <Dialog open={addElderOpen} onOpenChange={setAddElderOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-teal hover:bg-teal/90 text-primary-foreground rounded-lg">
                        <Plus className="h-4 w-4 mr-1" /> {t('dashboard.add_elder')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                      <DialogHeader><DialogTitle>Add New Elder Profile</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="elder-name">Full Name *</Label>
                          <Input id="elder-name" placeholder="Usha" value={newElder.name} onChange={e => setNewElder({ ...newElder, name: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="elder-age">Age *</Label>
                            <Input id="elder-age" type="number" placeholder="77" value={newElder.age} onChange={e => setNewElder({ ...newElder, age: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Preferred Language</Label>
                            <Select value={newElder.language} onValueChange={v => setNewElder({ ...newElder, language: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="kn">ಕನ್ನಡ</SelectItem>
                                <SelectItem value="hi">हिंदी</SelectItem>
                                <SelectItem value="ta">தமிழ்</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="elder-conditions">Medical Conditions (comma separated)</Label>
                          <Input id="elder-conditions" placeholder="Hypertension, Diabetes" value={newElder.conditions} onChange={e => setNewElder({ ...newElder, conditions: e.target.value })} />
                        </div>
                        <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground" onClick={handleAddElder} disabled={!newElder.name || !newElder.age}>
                          Create Elder Profile
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {elders.map((elder) => {
                  const vitals = demoVitals[elder.id] || DEMO_VITALS[elder.id];
                  return (
                    <Card key={elder.id} className="rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/elder/${elder.id}`)}>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-11 h-11 rounded-full bg-teal/15 flex items-center justify-center text-teal font-semibold">
                            {elder.full_name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground">{elder.full_name}</h3>
                            <p className="text-xs text-muted-foreground">Age {elder.age}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className={`w-2 h-2 rounded-full ${elder.connection_status === 'connected' ? 'bg-gw-green animate-pulse-dot' : 'bg-gw-red'}`} />
                            <Battery className="h-3 w-3" />{elder.battery}%
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {elder.medical_conditions.map((c, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-full bg-secondary text-teal text-[10px] font-medium">{c}</span>
                          ))}
                        </div>

                        {vitals && <VitalsGrid vitals={vitals} compact />}

                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/elder/${elder.id}`); }}>
                            {t('dashboard.view_health')}
                          </Button>
                          <MedSmartInput elderId={elder.id} trigger={
                            <Button size="sm" variant="outline" className="text-xs text-teal border-teal/30" onClick={(e) => e.stopPropagation()}>
                              <Pill className="h-3 w-3 mr-1" /> {t('dashboard.add_medication')}
                            </Button>
                          } />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* MEDICATIONS LIST SECTION */}
          {activeSection === 'medications' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl text-foreground">Medications List</h2>
                <Button className="bg-teal hover:bg-teal/90 text-primary-foreground" onClick={() => { setNewMedication({ elderId: elders[0]?.id || '', tabletName: '', genericName: '', category: 'General', doseAmount: '', doseUnit: 'mg', frequency: 'Once daily', time: '08:00', instructions: '' }); setEditingMedicationId(null); setAddMedicationOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Medication
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {medications.map((med) => (
                  <Card key={med.id} className="rounded-xl border-border shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground">{med.brand_name}</h3>
                        <p className="text-sm text-muted-foreground">{med.generic_name} · {med.category}</p>
                        <p className="text-xs text-muted-foreground mt-1">Dosage: {med.dose_amount} {med.dose_unit} · {med.frequency}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingMedicationId(med.id); setNewMedication({ elderId: med.elder_id, tabletName: med.brand_name, genericName: med.generic_name, category: med.category || 'General', doseAmount: String(med.dose_amount), doseUnit: med.dose_unit, frequency: med.frequency, time: med.times[0] || '08:00', instructions: med.instructions || '' }); setAddMedicationOpen(true); }}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteMedicationId(med.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* ALARMS LIST SECTION */}
          {activeSection === 'alarms' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl text-foreground">Alarms & Reminders</h2>
                <Button className="bg-teal hover:bg-teal/90 text-primary-foreground" onClick={() => { setNewAlarm({ elderId: elders[0]?.id || '', title: '', time: '08:00', type: 'medication', status: 'Scheduled', notes: '' }); setEditingAlarmId(null); setAddAlarmOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Alarm
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {alarms.map((alarm) => (
                  <Card key={alarm.id} className="rounded-xl border-border shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground">{alarm.title}</h3>
                        <p className="text-sm text-muted-foreground">Time: {alarm.time} · Type: {alarm.type}</p>
                        {alarm.notes && <p className="text-xs text-muted-foreground mt-1">{alarm.notes}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingAlarmId(alarm.id); setNewAlarm({ elderId: alarm.elderId, title: alarm.title, time: alarm.time, type: alarm.type, status: alarm.status, notes: alarm.notes }); setAddAlarmOpen(true); }}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteAlarmId(alarm.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* ALERTS SECTION */}
          {activeSection === 'alerts' && (
            <section className="space-y-4">
              <h2 className="font-display text-xl text-foreground">Active Notifications</h2>
              <div className="space-y-2">
                {activeAlerts.map((alert) => (
                  <div key={alert.id} className={`p-4 border rounded-xl flex items-center justify-between ${
                    alert.severity === 'critical' ? 'border-gw-red/30 bg-gw-red/5' : 'border-border bg-card'
                  }`}>
                    <div>
                      <p className="font-semibold text-foreground">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Time: {new Date(alert.time).toLocaleTimeString()}</p>
                    </div>
                    {!alert.resolved && (
                      <Button size="sm" className="bg-teal text-primary-foreground" onClick={async () => {
                        try {
                          await apiFetch(`/alerts/${alert.id}`, { method: 'PUT', body: JSON.stringify({ resolved: true }) });
                          setActiveAlerts(activeAlerts.map(a => a.id === alert.id ? { ...a, resolved: true } : a));
                          toast({ title: 'Acknowledged', description: 'Alert resolved successfully' });
                        } catch {}
                      }}>Acknowledge</Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CLINICAL WORKSPACE / REPORTS SECTION */}
          {activeSection === 'reports' && (
            <section className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">Clinical Workspace</h2>
                  <p className="text-sm text-muted-foreground">Upload reports, view the care team, and write clinical notes.</p>
                </div>
                
                {/* Patient selection dropdown inside clinical space */}
                <div className="flex items-center gap-2 min-w-[280px]">
                  <Label htmlFor="clinical-patient-select" className="text-xs font-semibold text-muted-foreground uppercase shrink-0">Selected Patient:</Label>
                  <Select value={clinicalElderId} onValueChange={(val) => setClinicalElderId(val)}>
                    <SelectTrigger id="clinical-patient-select" className="bg-card border-border"><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>
                      {elders.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {clinicalElderId ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Upload and list reports */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Upload Report Form */}
                    <Card className="rounded-xl border border-border/80 shadow-sm">
                      <CardHeader>
                        <CardTitle className="font-display text-base flex items-center gap-2 text-foreground">
                          <UploadCloud className="h-5 w-5 text-teal" /> Upload Medical Document / Report
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleUploadReport} className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="clinical-title">Report Title *</Label>
                              <Input id="clinical-title" placeholder="Complete Blood Count, Chest X-Ray..." value={newReport.title}
                                onChange={e => setNewReport({ ...newReport, title: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="clinical-category">Category</Label>
                              <Select value={newReport.category} onValueChange={v => setNewReport({ ...newReport, category: v })}>
                                <SelectTrigger id="clinical-category"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Lab Report">Lab Report / Blood Test</SelectItem>
                                  <SelectItem value="ECG / Cardiology">ECG / Cardiology</SelectItem>
                                  <SelectItem value="Radiology / Scan">Radiology / Imaging</SelectItem>
                                  <SelectItem value="Prescription">Prescription Document</SelectItem>
                                  <SelectItem value="Discharge Summary">Discharge Summary</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="clinical-description">Observations / Findings</Label>
                            <Textarea id="clinical-description" placeholder="Enter diagnositc findings, abnormal indicators, follow-ups..."
                              value={newReport.description} onChange={e => setNewReport({ ...newReport, description: e.target.value })}
                              className="min-h-[80px]" />
                          </div>

                          <div className="space-y-2">
                            <Label>Attach Report Document</Label>
                            {selectedFile ? (
                              <div className="flex items-center justify-between p-3 bg-secondary/35 rounded-lg border border-teal/20 text-xs">
                                <span className="font-medium text-teal">{selectedFile.name} ({selectedFile.size})</span>
                                <Button type="button" variant="ghost" size="sm" className="h-6 text-destructive px-2" onClick={() => setSelectedFile(null)}>Remove</Button>
                              </div>
                            ) : (
                              <div onClick={simulateFileUpload} className="border-2 border-dashed border-border hover:border-teal/50 cursor-pointer rounded-lg p-5 flex flex-col items-center justify-center text-xs text-muted-foreground gap-1.5">
                                <Folder className="h-6 w-6 text-muted-foreground/60" />
                                <span>Click to select PDF/Doc file for upload simulation</span>
                              </div>
                            )}
                          </div>

                          {uploadProgress !== null && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Uploading file...</span>
                                <span>{Math.min(uploadProgress, 100)}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-teal" style={{ width: `${uploadProgress}%` }} />
                              </div>
                            </div>
                          )}

                          <Button type="submit" disabled={!newReport.title} className="w-full bg-teal hover:bg-teal/90 text-primary-foreground">
                            Add Report to Patient History
                          </Button>
                        </form>
                      </CardContent>
                    </Card>

                    {/* Reports History */}
                    <Card className="rounded-xl border border-border/80 shadow-sm">
                      <CardHeader>
                        <CardTitle className="font-display text-base flex items-center gap-2 text-foreground">
                          <Folder className="h-5 w-5 text-teal" /> Medical Record History
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {reportsList.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-6">No records uploaded yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {reportsList.map((report) => (
                              <div key={report.id} className="p-3 bg-muted/40 border border-border/60 rounded-xl flex items-center justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-secondary text-teal hover:bg-secondary border-0 text-[10px]">{report.category}</Badge>
                                    <span className="text-[10px] text-muted-foreground">{new Date(report.createdAt).toLocaleDateString()}</span>
                                  </div>
                                  <h4 className="font-medium text-foreground text-sm mt-1">{report.title}</h4>
                                  <p className="text-[10px] text-muted-foreground">Doctor: {report.doctorName}</p>
                                </div>
                                <Button size="sm" variant="outline" className="border-teal text-teal hover:bg-teal/5 text-xs" onClick={() => setPreviewReport(report)}>
                                  View Details
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right Column: Recommendations & Care Team */}
                  <div className="space-y-6">
                    {/* Care Team Directory */}
                    <Card className="rounded-xl border border-border shadow-sm">
                      <CardHeader>
                        <CardTitle className="font-display text-base flex items-center gap-2 text-foreground">
                          <User className="h-5 w-5 text-teal" /> Care Team Directory
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {careTeam.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No care team assigned.</p>
                        ) : (
                          careTeam.map((doc) => (
                            <div key={doc.id} className="p-3 bg-secondary/15 rounded-xl border border-teal/10 space-y-1">
                              <p className="text-sm font-semibold text-teal">{doc.name}</p>
                              <p className="text-xs text-foreground font-medium">{doc.specialization}</p>
                              <p className="text-[10px] text-muted-foreground">{doc.hospital}</p>
                              <div className="pt-2 border-t border-teal/10 mt-1 flex flex-col gap-0.5 text-[9px] text-muted-foreground">
                                <span>Email: {doc.email}</span>
                                <span>Phone: {doc.phone}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    {/* Recommendations and notes */}
                    <Card className="rounded-xl border border-border shadow-sm">
                      <CardHeader>
                        <CardTitle className="font-display text-base flex items-center gap-2 text-foreground">
                          <Clipboard className="h-5 w-5 text-teal" /> Recommendations & Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Textarea placeholder="Add quick recommendations, prescriptions, followups..." value={clinicalNote} onChange={e => setClinicalNote(e.target.value)}
                            className="min-h-[90px]" />
                          <Button onClick={handleSaveNote} disabled={!clinicalNote.trim()} className="w-full bg-teal hover:bg-teal/90 text-primary-foreground text-xs">
                            Save Note
                          </Button>
                        </div>
                        
                        <div className="space-y-2 pt-2 border-t border-border/60">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clinical Log</p>
                          {notesList.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-2">No notes written yet.</p>
                          ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                              {notesList.map((noteItem) => (
                                <div key={noteItem.id} className="p-3 bg-muted/60 rounded-lg text-xs space-y-1">
                                  <div className="flex justify-between text-[9px] text-muted-foreground font-medium">
                                    <span>{noteItem.doctorName || noteItem.doctor_name || 'Dr. Ramesh Kumar'}</span>
                                    <span>{new Date(noteItem.createdAt || noteItem.created_at || Date.now()).toLocaleDateString()}</span>
                                  </div>
                                  <p className="text-foreground leading-relaxed">{noteItem.note}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
                  Please register an elder profile to activate clinical workspace.
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Dialog for Report Details */}
      {previewReport && (
        <Dialog open={previewReport !== null} onOpenChange={(open) => { if (!open) setPreviewReport(null); }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-display text-lg">{previewReport.title}</DialogTitle>
              <DialogDescription className="text-xs">
                Medical record uploaded on {new Date(previewReport.createdAt).toLocaleString()} by {previewReport.doctorName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-muted-foreground block mb-0.5">Category</span>
                  <Badge className="bg-secondary text-teal hover:bg-secondary border-0">{previewReport.category}</Badge>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground block mb-0.5">Attached File</span>
                  <span className="text-teal font-medium hover:underline cursor-pointer flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {previewReport.fileUrl || 'No file attached'}
                  </span>
                </div>
              </div>
              
              <div className="p-4 bg-muted/50 rounded-xl space-y-1.5 border border-border/40">
                <span className="font-semibold text-xs text-muted-foreground block">Clinical Observations & Findings</span>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {previewReport.description || 'No comments entered.'}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setPreviewReport(null)} className="bg-teal hover:bg-teal/90 text-primary-foreground">Close</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Medication Dialog */}
      <Dialog open={addMedicationOpen} onOpenChange={(open) => { setAddMedicationOpen(open); if (!open) setEditingMedicationId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMedicationId ? 'Edit Medication' : 'Add Medication'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Patient *</Label>
              <Select value={newMedication.elderId} onValueChange={(val) => setNewMedication({ ...newMedication, elderId: val })}>
                <SelectTrigger><SelectValue placeholder="Choose patient" /></SelectTrigger>
                <SelectContent>
                  {elders.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Brand/Tablet Name *</Label>
                <Input placeholder="Dolo 650" value={newMedication.tabletName} onChange={e => setNewMedication({ ...newMedication, tabletName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Generic Name *</Label>
                <Input placeholder="Paracetamol" value={newMedication.genericName} onChange={e => setNewMedication({ ...newMedication, genericName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>Dose Amount</Label>
                <Input type="number" placeholder="500" value={newMedication.doseAmount} onChange={e => setNewMedication({ ...newMedication, doseAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input placeholder="mg" value={newMedication.doseUnit} onChange={e => setNewMedication({ ...newMedication, doseUnit: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={newMedication.time} onChange={e => setNewMedication({ ...newMedication, time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Input placeholder="Take after food" value={newMedication.instructions} onChange={e => setNewMedication({ ...newMedication, instructions: e.target.value })} />
            </div>
            <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground" onClick={() => handleAddMedication({
              elder_id: newMedication.elderId,
              brand_name: newMedication.tabletName,
              generic_name: newMedication.genericName,
              category: newMedication.category,
              dose_amount: Number(newMedication.doseAmount),
              dose_unit: newMedication.doseUnit,
              frequency: newMedication.frequency,
              times: [newMedication.time],
              instructions: newMedication.instructions,
              photo: newMedication.photo,
              active: true,
            })} disabled={!newMedication.tabletName || !newMedication.elderId}>
              Save Medication Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Medication Alert */}
      <AlertDialog open={Boolean(deleteMedicationId)} onOpenChange={(open) => !open && setDeleteMedicationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This medication schedule will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMedication} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Alarm Dialog */}
      <Dialog open={addAlarmOpen} onOpenChange={(open) => { setAddAlarmOpen(open); if (!open) setEditingAlarmId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAlarmId ? 'Edit Alarm' : 'Add Alarm'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Patient *</Label>
              <Select value={newAlarm.elderId} onValueChange={(val) => setNewAlarm({ ...newAlarm, elderId: val })}>
                <SelectTrigger><SelectValue placeholder="Choose patient" /></SelectTrigger>
                <SelectContent>
                  {elders.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Alarm Title *</Label>
              <Input placeholder="Morning medicines, Evening walk..." value={newAlarm.title} onChange={e => setNewAlarm({ ...newAlarm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input type="time" value={newAlarm.time} onChange={e => setNewAlarm({ ...newAlarm, time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Alarm Type</Label>
                <Select value={newAlarm.type} onValueChange={(v: any) => setNewAlarm({ ...newAlarm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medication">Medication Reminder</SelectItem>
                    <SelectItem value="food">Food Reminder</SelectItem>
                    <SelectItem value="activity">Activity Reminder</SelectItem>
                    <SelectItem value="appointment">Appointment Reminder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input placeholder="Extra notes..." value={newAlarm.notes} onChange={e => setNewAlarm({ ...newAlarm, notes: e.target.value })} />
            </div>
            <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground" onClick={() => handleAddAlarm(newAlarm)} disabled={!newAlarm.title || !newAlarm.elderId}>
              Save Alarm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Alarm Alert */}
      <AlertDialog open={Boolean(deleteAlarmId)} onOpenChange={(open) => !open && setDeleteAlarmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This reminder alarm will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAlarm} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DoctorPortal;
