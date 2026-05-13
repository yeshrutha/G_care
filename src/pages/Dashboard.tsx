import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { LayoutDashboard, Users, Pill, Bell, ShieldAlert, FileText, Stethoscope, Settings, LogOut, Plus, Activity, Battery, Wifi, Bluetooth, X, Brain, TrendingUp, CheckCircle2, PhoneCall, MapPin, Pencil, Trash2 } from 'lucide-react';
import { GuardianLogo } from '@/components/GuardianLogo';
import { AlertBanner } from '@/components/AlertBanner';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { VitalsGrid } from '@/components/VitalsGrid';
import { MedSmartInput } from '@/components/MedSmartInput';
import { useAppStore, type DemoElder, type DemoVitals } from '@/store';
import { useGuardianStore, type Reminder } from '@/store/guardianStore';
import { DEMO_ELDERS, DEMO_MEDICATIONS, DEMO_VITALS, generateVitalsUpdate } from '@/lib/demoData';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

type DashboardSection = 'dashboard' | 'elders' | 'medications' | 'alarms' | 'alerts' | 'reports';

type DashboardMedication = {
  id: string;
  elder_id: string;
  brand_name: string;
  generic_name: string;
  category: string;
  dose_amount: number;
  dose_unit: string;
  frequency: string;
  times: string[];
  instructions: string;
  photo?: string;
};

type DashboardAlarm = {
  id: string;
  elderId: string;
  title: string;
  time: string;
  type: 'medication' | 'food' | 'activity' | 'appointment';
  status: 'Due soon' | 'Scheduled' | 'Paused';
  notes: string;
};

type CareReport = {
  id: string;
  title: string;
  summary: string;
  generatedAt: string;
  sections: string[];
  actions: string[];
};

const API_BASE = '/api';

const NAV = [
  { icon: LayoutDashboard, label: 'nav.dashboard', section: 'dashboard' },
  { icon: Users, label: 'nav.elders', section: 'elders' },
  { icon: Pill, label: 'nav.medications', section: 'medications' },
  { icon: Bell, label: 'nav.alarms', section: 'alarms' },
  { icon: ShieldAlert, label: 'nav.alerts', section: 'alerts', badge: true },
  { icon: FileText, label: 'nav.reports', section: 'reports' },
  { icon: Stethoscope, label: 'nav.doctor', path: '/doctor' },
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
  reports: 'Reports',
};

const CARE_REPORTS: CareReport[] = [
  {
    id: 'daily-vitals',
    title: 'Daily vitals summary',
    summary: 'Vitals stayed within baseline for most profiles, with oxygen watch needed for Venkatesh Rao.',
    generatedAt: 'Today, 7:30 AM',
    sections: [
      'Usha: heart rate averaged 68 bpm, BP stayed near 126/82, SpO2 remained stable at 97%.',
      'Lakshmi Devi: BP trend is mildly elevated at 138/88. Continue routine monitoring.',
      'Venkatesh Rao: SpO2 is lower than the others at 93%, with breathing rate near 20 rpm.',
    ],
    actions: [
      'Recheck Venkatesh Rao oxygen trend this evening.',
      'Share summary with doctor if SpO2 drops below 92%.',
      'Keep all watches charged above 30%.',
    ],
  },
  {
    id: 'med-adherence',
    title: 'Medication adherence',
    summary: 'Morning adherence is strong. One aspirin reminder still needs confirmation.',
    generatedAt: 'Today, 9:15 AM',
    sections: [
      'Metformin and Amlodipine reminders are scheduled for Usha in the morning.',
      'Ecosprin for Lakshmi Devi is set for 09:00 and should be verified after breakfast.',
      'No duplicate medication alarms were detected in today\'s schedule.',
    ],
    actions: [
      'Confirm Ecosprin was taken by Lakshmi Devi.',
      'Add tablet photos for medicines that do not have one yet.',
      'Review missed-dose alerts at the end of the day.',
    ],
  },
  {
    id: 'sos-audit',
    title: 'Fall and SOS audit',
    summary: 'No fall detected today. SOS workflow is ready and contacts are configured.',
    generatedAt: 'Today, 10:00 AM',
    sections: [
      'No fall flags are active across connected elder profiles.',
      'SOS monitoring is enabled for demo workflows and emergency escalation checks.',
      'Location status is available for active alerts when the watch reports it.',
    ],
    actions: [
      'Run one test SOS alert during caregiver training.',
      'Verify emergency contacts every week.',
      'Keep geofence boundaries updated for each elder.',
    ],
  },
];

const getRiskScore = (elder: DemoElder, vitals?: DemoVitals) => {
  if (!vitals) return 0;

  let score = 8;
  if (vitals.spo2 < 94) score += 24;
  if (vitals.spo2 < 92) score += 18;
  if (vitals.systolic_bp >= 140 || vitals.diastolic_bp >= 90) score += 18;
  if (vitals.heart_rate > 95 || vitals.heart_rate < 55) score += 14;
  if (vitals.stress > 55) score += 12;
  if (vitals.hydration < 60) score += 10;
  if (vitals.breathing_rate > 20) score += 8;
  if (elder.connection_status !== 'connected') score += 15;
  if (elder.battery < 25) score += 10;
  if (!elder.baselines_learned) score += 5;

  return Math.min(100, score);
};

const getRiskLevel = (score: number) => {
  if (score >= 70) return { label: 'Critical', color: 'text-gw-red', bg: 'bg-gw-red/10', border: 'border-gw-red/30' };
  if (score >= 45) return { label: 'Watch', color: 'text-gw-amber', bg: 'bg-gw-amber/10', border: 'border-gw-amber/30' };
  return { label: 'Stable', color: 'text-gw-green', bg: 'bg-gw-green/10', border: 'border-gw-green/30' };
};

const getCareRecommendation = (elder: DemoElder, vitals?: DemoVitals) => {
  if (!vitals) return 'Waiting for latest vitals stream.';
  if (vitals.spo2 < 94) return 'Check breathing comfort and keep oxygen trend under review.';
  if (vitals.systolic_bp >= 140 || vitals.diastolic_bp >= 90) return 'Repeat BP reading after rest and notify doctor if trend continues.';
  if (vitals.stress > 55) return 'Schedule a short check-in and review sleep or anxiety triggers.';
  if (vitals.hydration < 60) return 'Prompt fluids and recheck hydration within the hour.';
  if (elder.battery < 25) return 'Charge watch soon to avoid monitoring gaps.';
  if (!elder.baselines_learned) return 'Continue baseline learning before automating stronger alerts.';
  return 'Vitals are inside personal range. Keep routine monitoring active.';
};

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { demoMode, setDemoMode, authUser, setAuthUser, demoElders, setDemoElders, demoVitals, setDemoVitals, activeAlerts, addAlert, setDemoStep, demoStep } = useAppStore();
  const addGuardianReminder = useGuardianStore((state) => state.addReminder);
  const guardianUser = useGuardianStore((state) => state.guardianUser);
  const setGuardianUser = useGuardianStore((state) => state.setGuardianUser);

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
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [medications, setMedications] = useState<DashboardMedication[]>(DEMO_MEDICATIONS.map((med) => ({
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
  })));
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

  // Initialize demo data
  useEffect(() => {
    if (!authUser) {
      setAuthUser({ id: '1', name: 'Demo Caretaker', role: 'caretaker', email: 'demo@guardianwatch.in' });
    }
    if (demoElders.length === 0) setDemoElders(DEMO_ELDERS);
    Object.entries(DEMO_VITALS).forEach(([id, v]) => setDemoVitals(id, v));
  }, []);

  useEffect(() => {
    let ignore = false;

    fetch(`${API_BASE}/dashboard-data`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Backend unavailable')))
      .then((data: { medications?: DashboardMedication[]; alarms?: DashboardAlarm[] }) => {
        if (ignore) return;
        if (Array.isArray(data.medications)) setMedications(data.medications);
        if (Array.isArray(data.alarms)) setAlarms(data.alarms);
      })
      .catch(() => {
        // Keep demo seed data when the local backend is not running.
      });

    return () => {
      ignore = true;
    };
  }, []);

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
  }, [demoMode]);

  // Live vitals updates
  useEffect(() => {
    const interval = setInterval(() => {
      Object.entries(demoVitals).forEach(([id, v]) => {
        setDemoVitals(id, generateVitalsUpdate(v));
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [demoVitals]);

  const elders = demoElders.length > 0 ? demoElders : DEMO_ELDERS;
  const sparkData = useMemo(() => Array.from({ length: 30 }, (_, i) => ({ v: 65 + Math.sin(i / 4) * 5 + Math.random() * 3 })), []);

  const unresolvedCount = activeAlerts.filter(a => !a.resolved).length;
  const medicationSchedule = useMemo(() => (
    medications.map((med) => ({
      ...med,
      elderName: elders.find(elder => elder.id === med.elder_id)?.full_name || 'Unknown elder',
    }))
  ), [elders, medications]);
  const upcomingAlarms = useMemo(() => (
    alarms.map((alarm) => ({
      ...alarm,
      elderName: elders.find(elder => elder.id === alarm.elderId)?.full_name || 'Unknown elder',
      displayTime: new Date(`2026-01-01T${alarm.time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }))
  ), [alarms, elders]);
  const careIntelligence = useMemo(() => {
    const profiles = elders.map((elder) => {
      const vitals = demoVitals[elder.id] || DEMO_VITALS[elder.id];
      const riskScore = getRiskScore(elder, vitals);
      return {
        elder,
        vitals,
        riskScore,
        risk: getRiskLevel(riskScore),
        recommendation: getCareRecommendation(elder, vitals),
      };
    }).sort((a, b) => b.riskScore - a.riskScore);

    const connected = elders.filter(e => e.connection_status === 'connected').length;
    const averageRisk = profiles.length
      ? Math.round(profiles.reduce((sum, item) => sum + item.riskScore, 0) / profiles.length)
      : 0;
    const lowBatteryCount = elders.filter(e => e.battery < 30).length;
    const stableCount = profiles.filter(item => item.riskScore < 45).length;

    return {
      profiles,
      averageRisk,
      connected,
      lowBatteryCount,
      stableCount,
      topPriority: profiles[0],
    };
  }, [elders, demoVitals]);

  const handleAddElder = () => {
    if (!newElder.name || !newElder.age) return;
    const elder: DemoElder = {
      id: `elder-${Date.now()}`,
      full_name: newElder.name,
      age: parseInt(newElder.age) || 70,
      medical_conditions: newElder.conditions.split(',').map(c => c.trim()).filter(Boolean),
      language_pref: newElder.language,
      connection_status: btConnected ? 'connected' : 'disconnected',
      battery: btConnected ? 85 : 0,
      last_vitals_at: new Date().toISOString(),
      baselines_learned: false,
      baseline_day: 1,
    };
    setDemoElders([...elders, elder]);
    setDemoVitals(elder.id, {
      heart_rate: 72, systolic_bp: 120, diastolic_bp: 78, spo2: 97,
      stress: 30, hydration: 70, breathing_rate: 16, skin_temp: 36.5,
      shiver_detected: false, panic_detected: false, fall_detected: false,
    });
    setNewElder({ name: '', age: '', conditions: '', language: 'en', phone: '', address: '' });
    setBtConnected(false);
    setBtDeviceId('');
    setAddElderOpen(false);
  };

  const handleBluetoothConnect = () => {
    setBtConnecting(true);
    // Simulate BT pairing
    setTimeout(() => {
      setBtConnecting(false);
      setBtConnected(true);
      setBtDeviceId(`GW-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
    }, 2500);
  };

  const handleAddMedication = async () => {
    if (!newMedication.elderId || !newMedication.tabletName || !newMedication.doseAmount || !newMedication.time) return;

    const selectedElder = elders.find((elder) => elder.id === newMedication.elderId);
    const medication: DashboardMedication = {
      id: editingMedicationId || `med-${Date.now()}`,
      elder_id: newMedication.elderId,
      brand_name: newMedication.tabletName,
      generic_name: newMedication.genericName || newMedication.tabletName,
      category: newMedication.category,
      dose_amount: Number(newMedication.doseAmount) || 0,
      dose_unit: newMedication.doseUnit,
      frequency: newMedication.frequency,
      times: [newMedication.time],
      instructions: newMedication.instructions,
      photo: newMedication.photo,
    };

    let savedMedication = medication;
    try {
      const response = await fetch(`${API_BASE}/medications${editingMedicationId ? `/${editingMedicationId}` : ''}`, {
        method: editingMedicationId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(medication),
      });
      if (response.ok) savedMedication = await response.json();
    } catch {
      // Save locally if the backend is not running.
    }

    setMedications((current) => editingMedicationId
      ? current.map((med) => med.id === editingMedicationId ? savedMedication : med)
      : [savedMedication, ...current]);

    if (!editingMedicationId) {
      const dosage = `${savedMedication.dose_amount}${savedMedication.dose_unit}`;
      const reminder: Reminder = {
        id: `dash-${savedMedication.id}`,
        type: 'medication',
        title: `${savedMedication.brand_name} ${dosage}`,
        time: savedMedication.times[0] || '08:00',
        repeat: 'daily',
        verified: false,
        createdAt: new Date().toISOString(),
        photo: savedMedication.photo || '',
        pillName: savedMedication.brand_name,
        dosage,
      };
      addGuardianReminder(reminder);
    }

    if (selectedElder) {
      setGuardianUser({
        name: guardianUser?.name || 'Guardian User',
        email: guardianUser?.email || 'guardian@example.com',
        phone: guardianUser?.phone || '+91 98765 43210',
        ...guardianUser,
        elderName: selectedElder.full_name,
        elderAge: String(selectedElder.age),
        elderLanguage: selectedElder.language_pref,
        elderConditions: selectedElder.medical_conditions.join(', '),
      });
    }

    setNewMedication({
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
    setEditingMedicationId(null);
    setAddMedicationOpen(false);
  };

  const openAddMedication = () => {
    setEditingMedicationId(null);
    setNewMedication({
      elderId: elders[0]?.id || '',
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
    setAddMedicationOpen(true);
  };

  const openEditMedication = (medication: DashboardMedication) => {
    setEditingMedicationId(medication.id);
    setNewMedication({
      elderId: medication.elder_id,
      tabletName: medication.brand_name,
      genericName: medication.generic_name,
      category: medication.category,
      doseAmount: String(medication.dose_amount),
      doseUnit: medication.dose_unit,
      frequency: medication.frequency,
      time: medication.times[0] || '08:00',
      instructions: medication.instructions,
      photo: medication.photo || '',
    });
    setAddMedicationOpen(true);
  };

  const handleMedicationDialogChange = (open: boolean) => {
    setAddMedicationOpen(open);
    if (!open) {
      setEditingMedicationId(null);
      setNewMedication({
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
    }
  };

  const medicationPendingDelete = medications.find((med) => med.id === deleteMedicationId);

  const handleDeleteMedication = async () => {
    if (!deleteMedicationId) return;
    try {
      await fetch(`${API_BASE}/medications/${deleteMedicationId}`, { method: 'DELETE' });
    } catch {
      // Remove locally if the backend is not running.
    }
    setMedications((current) => current.filter((med) => med.id !== deleteMedicationId));
    setDeleteMedicationId(null);
  };

  const handleMedicationPhotoChange = (file?: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setNewMedication((current) => ({ ...current, photo: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const resetAlarmForm = () => {
    setEditingAlarmId(null);
    setNewAlarm({
      elderId: '',
      title: '',
      time: '08:00',
      type: 'medication',
      status: 'Scheduled',
      notes: '',
    });
  };

  const handleSaveAlarm = async () => {
    if (!newAlarm.elderId || !newAlarm.title || !newAlarm.time) return;

    const alarm: DashboardAlarm = {
      id: editingAlarmId || `alarm-${Date.now()}`,
      elderId: newAlarm.elderId,
      title: newAlarm.title,
      time: newAlarm.time,
      type: newAlarm.type,
      status: newAlarm.status,
      notes: newAlarm.notes,
    };

    let savedAlarm = alarm;
    try {
      const response = await fetch(`${API_BASE}/alarms${editingAlarmId ? `/${editingAlarmId}` : ''}`, {
        method: editingAlarmId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alarm),
      });
      if (response.ok) savedAlarm = await response.json();
    } catch {
      // Save locally if the backend is not running.
    }

    setAlarms((current) => editingAlarmId
      ? current.map((item) => item.id === editingAlarmId ? savedAlarm : item)
      : [savedAlarm, ...current]);
    resetAlarmForm();
    setAddAlarmOpen(false);
  };

  const openAddAlarm = () => {
    resetAlarmForm();
    setAddAlarmOpen(true);
  };

  const openEditAlarm = (alarm: DashboardAlarm) => {
    setEditingAlarmId(alarm.id);
    setNewAlarm({
      elderId: alarm.elderId,
      title: alarm.title,
      time: alarm.time,
      type: alarm.type,
      status: alarm.status,
      notes: alarm.notes,
    });
    setAddAlarmOpen(true);
  };

  const handleAlarmDialogChange = (open: boolean) => {
    setAddAlarmOpen(open);
    if (!open) resetAlarmForm();
  };

  const alarmPendingDelete = alarms.find((alarm) => alarm.id === deleteAlarmId);
  const activeReport = CARE_REPORTS.find((report) => report.id === activeReportId);

  const handleDeleteAlarm = async () => {
    if (!deleteAlarmId) return;
    try {
      await fetch(`${API_BASE}/alarms/${deleteAlarmId}`, { method: 'DELETE' });
    } catch {
      // Remove locally if the backend is not running.
    }
    setAlarms((current) => current.filter((alarm) => alarm.id !== deleteAlarmId));
    setDeleteAlarmId(null);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-60 bg-card border-r border-border flex-col">
        <div className="p-4 border-b border-border">
          <GuardianLogo />
        </div>
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-teal/20 flex items-center justify-center text-teal font-semibold text-sm">
              {(authUser?.name || 'D')[0]}
            </div>
            <div className="text-sm">
              <p className="font-medium text-foreground">{authUser?.name || 'Demo User'}</p>
              <p className="text-xs text-muted-foreground capitalize">{authUser?.role || 'caretaker'}</p>
            </div>
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
          <button onClick={() => { setAuthUser(null); navigate('/'); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-card border-b border-border px-6 py-3 flex items-center justify-between">
          <h1 className="font-display text-2xl text-foreground">{SECTION_TITLES[activeSection]}</h1>
          <div className="flex items-center gap-4">
            <DemoModeBanner />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('dashboard.demo_mode')}</span>
              <Switch checked={demoMode} onCheckedChange={setDemoMode} />
            </div>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setAuthUser(null); navigate('/'); }}>
              <LogOut className="h-4 w-4 mr-1" /> {t('nav.logout')}
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          {/* Emergency Banner */}
          <AlertBanner />

          {/* Care Intelligence */}
          {activeSection === 'dashboard' && (
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <Card className="rounded-xl border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">AI risk index</p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">{careIntelligence.averageRisk}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-teal/10 flex items-center justify-center">
                      <Brain className="h-5 w-5 text-teal" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Weighted from vitals, battery, alerts, and baseline status.</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Live devices</p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">{careIntelligence.connected}/{elders.length}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-gw-green/10 flex items-center justify-center">
                      <Wifi className="h-5 w-5 text-gw-green" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Connected watches streaming recent health signals.</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Unresolved alerts</p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">{unresolvedCount}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-gw-amber/10 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-gw-amber" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Active care events that still need attention.</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Stable profiles</p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">{careIntelligence.stableCount}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-gw-green/10 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-gw-green" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{careIntelligence.lowBatteryCount} watch needs charging soon.</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.9fr] gap-4">
              <Card className={`rounded-xl shadow-sm ${careIntelligence.topPriority?.risk.border || 'border-border'} ${careIntelligence.topPriority?.risk.bg || ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Highest priority</p>
                      <h2 className="mt-1 font-display text-xl text-foreground">{careIntelligence.topPriority?.elder.full_name || 'No active elder'}</h2>
                    </div>
                    {careIntelligence.topPriority && (
                      <Badge variant="outline" className={`${careIntelligence.topPriority.risk.color} ${careIntelligence.topPriority.risk.border} bg-background/70`}>
                        {careIntelligence.topPriority.risk.label} {careIntelligence.topPriority.riskScore}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                    {careIntelligence.topPriority?.recommendation || 'Add elder profiles to activate care intelligence.'}
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
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" className="bg-teal hover:bg-teal/90 text-primary-foreground" onClick={() => careIntelligence.topPriority && navigate(`/elder/${careIntelligence.topPriority.elder.id}`)}>
                      <Activity className="h-4 w-4 mr-1" /> Review vitals
                    </Button>
                    <Button size="sm" variant="outline">
                      <PhoneCall className="h-4 w-4 mr-1" /> Call family
                    </Button>
                    <Button size="sm" variant="outline">
                      <MapPin className="h-4 w-4 mr-1" /> Locate
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-border shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="font-display text-xl text-foreground">AI care queue</h2>
                      <p className="text-xs text-muted-foreground">Ranked by current risk and monitoring reliability.</p>
                    </div>
                    <Badge variant="outline" className="border-teal/30 text-teal bg-teal/5">
                      <TrendingUp className="h-3 w-3 mr-1" /> Live scoring
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {careIntelligence.profiles.map(({ elder, vitals, riskScore, risk, recommendation }) => (
                      <button key={elder.id} onClick={() => navigate(`/elder/${elder.id}`)}
                        className="w-full rounded-lg border border-border bg-background p-3 text-left hover:border-teal/40 hover:bg-teal/5 transition-colors">
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                          <div className="flex items-center gap-3 md:w-52">
                            <div className="h-9 w-9 rounded-lg bg-teal/15 flex items-center justify-center text-teal text-sm font-semibold">
                              {elder.full_name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{elder.full_name}</p>
                              <p className="text-xs text-muted-foreground">Age {elder.age}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 flex-1 text-xs">
                            <span className="rounded-md bg-muted px-2 py-1">HR {vitals?.heart_rate ?? '--'}</span>
                            <span className="rounded-md bg-muted px-2 py-1">SpO2 {vitals?.spo2 ?? '--'}%</span>
                            <span className="rounded-md bg-muted px-2 py-1">Battery {elder.battery}%</span>
                          </div>
                          <div className="md:w-64">
                            <p className="text-xs text-muted-foreground line-clamp-2">{recommendation}</p>
                          </div>
                          <Badge variant="outline" className={`${risk.color} ${risk.border} ${risk.bg} justify-center md:w-24`}>
                            {riskScore}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
          )}

          {/* Predictive Risk Panel (demo step 1+) */}
          {activeSection === 'dashboard' && demoMode && demoStep >= 1 && (
            <Card className="border-gw-amber/30 bg-gw-amber/5 rounded-xl animate-fade-in">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Activity className="h-5 w-5 text-gw-amber mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">{t('dashboard.predictive_title')}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Usha — {t('dashboard.predictive_bp', { slope: '3.8', days: '3' })} {t('dashboard.predictive_recommend')}
                    </p>
                    <Button size="sm" variant="outline" className="mt-2 text-gw-amber border-gw-amber/30" onClick={() => navigate('/elder/elder-1')}>
                      {t('dashboard.view_details')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'dashboard' && demoMode && demoStep >= 3 && (
            <Card className="border-gw-purple/30 bg-gw-purple/5 rounded-xl animate-fade-in">
              <CardContent className="p-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <span className="text-gw-purple">💜</span> AI Mood Insight
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Usha has reported feeling Anxious 3 of the last 5 days.
                  Combined with elevated stress (avg 58/100), consider a check-in call.
                </p>
              </CardContent>
            </Card>
          )}

          {activeSection === 'dashboard' && demoMode && demoStep >= 7 && (
            <Card className="border-gw-purple/30 bg-gw-purple/5 rounded-xl animate-fade-in">
              <CardContent className="p-4">
                <h3 className="font-semibold text-foreground">🤖 AI Morning Summary</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Good morning. All of Usha's vitals remained within personal baseline ranges overnight.
                  Heart rate averaged 66 bpm with no significant deviations. Blood pressure showed a mild upward trend
                  over the past 3 days that warrants monitoring. SpO₂ remained stable at 97%.
                </p>
              </CardContent>
            </Card>
          )}

          {activeSection === 'medications' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl text-foreground">Medication Schedule</h2>
                  <p className="text-sm text-muted-foreground">Active prescriptions grouped with elder, dose, and reminder times.</p>
                </div>
                <Dialog open={addMedicationOpen} onOpenChange={handleMedicationDialogChange}>
                  <DialogTrigger asChild>
                    <Button className="bg-teal hover:bg-teal/90 text-primary-foreground" onClick={openAddMedication}>
                      <Plus className="h-4 w-4 mr-1" /> Add Medication
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="font-display">{editingMedicationId ? 'Edit Tablet' : 'Add Tablet'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Select Elder *</Label>
                        <Select value={newMedication.elderId} onValueChange={v => setNewMedication({ ...newMedication, elderId: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose elder" />
                          </SelectTrigger>
                          <SelectContent>
                            {elders.map((elder) => (
                              <SelectItem key={elder.id} value={elder.id}>{elder.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tablet-photo">Tablet Photo</Label>
                        <div className="flex items-center gap-3">
                          <div className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
                            {newMedication.photo ? (
                              <img src={newMedication.photo} alt="Tablet preview" className="h-full w-full object-cover" />
                            ) : (
                              <Pill className="h-7 w-7 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1">
                            <Input id="tablet-photo" type="file" accept="image/*"
                              onChange={e => handleMedicationPhotoChange(e.target.files?.[0])} />
                            <p className="mt-1 text-xs text-muted-foreground">Upload a tablet strip or pill photo for easier verification.</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="tablet-name">Tablet Name *</Label>
                          <Input id="tablet-name" placeholder="Dolo 650" value={newMedication.tabletName}
                            onChange={e => setNewMedication({ ...newMedication, tabletName: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="generic-name">Generic Name</Label>
                          <Input id="generic-name" placeholder="Paracetamol" value={newMedication.genericName}
                            onChange={e => setNewMedication({ ...newMedication, genericName: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="dose-amount">Dose *</Label>
                          <Input id="dose-amount" type="number" placeholder="650" value={newMedication.doseAmount}
                            onChange={e => setNewMedication({ ...newMedication, doseAmount: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit</Label>
                          <Select value={newMedication.doseUnit} onValueChange={v => setNewMedication({ ...newMedication, doseUnit: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mg">mg</SelectItem>
                              <SelectItem value="ml">ml</SelectItem>
                              <SelectItem value="tablet">tablet</SelectItem>
                              <SelectItem value="drops">drops</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Frequency</Label>
                          <Select value={newMedication.frequency} onValueChange={v => setNewMedication({ ...newMedication, frequency: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Once daily">Once daily</SelectItem>
                              <SelectItem value="Twice daily">Twice daily</SelectItem>
                              <SelectItem value="Three times daily">Three times daily</SelectItem>
                              <SelectItem value="As needed">As needed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="med-time">Reminder Time *</Label>
                          <Input id="med-time" type="time" value={newMedication.time}
                            onChange={e => setNewMedication({ ...newMedication, time: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="med-category">Category</Label>
                          <Input id="med-category" placeholder="Pain relief" value={newMedication.category}
                            onChange={e => setNewMedication({ ...newMedication, category: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="med-instructions">Instructions</Label>
                        <Textarea id="med-instructions" placeholder="Take after food" value={newMedication.instructions}
                          onChange={e => setNewMedication({ ...newMedication, instructions: e.target.value })} />
                      </div>
                      <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground" onClick={handleAddMedication}
                        disabled={!newMedication.elderId || !newMedication.tabletName || !newMedication.doseAmount || !newMedication.time}>
                        {editingMedicationId ? <Pencil className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                        {editingMedicationId ? 'Save Changes' : 'Add Tablet'}
                      </Button>
                      {(!newMedication.elderId || !newMedication.tabletName || !newMedication.doseAmount || !newMedication.time) && (
                        <p className="text-center text-xs text-muted-foreground">
                          Choose an elder, tablet name, dose, and reminder time to enable Add Tablet.
                        </p>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {medicationSchedule.map((med) => (
                  <Card key={med.id} className="rounded-xl border-border shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
                            {med.photo ? (
                              <img src={med.photo} alt={`${med.brand_name} tablet`} className="h-full w-full object-cover" />
                            ) : (
                              <Pill className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                          <h3 className="font-semibold text-foreground">{med.brand_name}</h3>
                          <p className="text-sm text-muted-foreground">{med.generic_name} · {med.category}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-teal/30 text-teal bg-teal/5">{med.elderName}</Badge>
                          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEditMedication(med)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 px-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteMedicationId(med.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-muted-foreground">Dose</p>
                          <p className="mt-1 font-semibold text-foreground">{med.dose_amount}{med.dose_unit}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-muted-foreground">Frequency</p>
                          <p className="mt-1 font-semibold text-foreground">{med.frequency}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-muted-foreground">Times</p>
                          <p className="mt-1 font-semibold text-foreground">{med.times.join(', ')}</p>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-muted-foreground">{med.instructions}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <AlertDialog open={Boolean(deleteMedicationId)} onOpenChange={(open) => !open && setDeleteMedicationId(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete medication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {medicationPendingDelete
                        ? `${medicationPendingDelete.brand_name} will be removed from the medication schedule.`
                        : 'This medication will be removed from the medication schedule.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteMedication}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
          )}

          {activeSection === 'alarms' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl text-foreground">Upcoming Alarms</h2>
                  <p className="text-sm text-muted-foreground">Medication, food, activity, and appointment reminders for today.</p>
                </div>
                <Dialog open={addAlarmOpen} onOpenChange={handleAlarmDialogChange}>
                  <DialogTrigger asChild>
                    <Button className="bg-teal hover:bg-teal/90 text-primary-foreground" onClick={openAddAlarm}>
                      <Plus className="h-4 w-4 mr-1" /> New Alarm
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="font-display">{editingAlarmId ? 'Edit Alarm' : 'New Alarm'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Select Elder *</Label>
                        <Select value={newAlarm.elderId} onValueChange={v => setNewAlarm({ ...newAlarm, elderId: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose elder" />
                          </SelectTrigger>
                          <SelectContent>
                            {elders.map((elder) => (
                              <SelectItem key={elder.id} value={elder.id}>{elder.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="alarm-title">Alarm Title *</Label>
                          <Input id="alarm-title" placeholder="Morning medicines" value={newAlarm.title}
                            onChange={e => setNewAlarm({ ...newAlarm, title: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="alarm-time">Time *</Label>
                          <Input id="alarm-time" type="time" value={newAlarm.time}
                            onChange={e => setNewAlarm({ ...newAlarm, time: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={newAlarm.type} onValueChange={v => setNewAlarm({ ...newAlarm, type: v as DashboardAlarm['type'] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="medication">Medication</SelectItem>
                              <SelectItem value="food">Food</SelectItem>
                              <SelectItem value="activity">Activity</SelectItem>
                              <SelectItem value="appointment">Appointment</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select value={newAlarm.status} onValueChange={v => setNewAlarm({ ...newAlarm, status: v as DashboardAlarm['status'] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Scheduled">Scheduled</SelectItem>
                              <SelectItem value="Due soon">Due soon</SelectItem>
                              <SelectItem value="Paused">Paused</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="alarm-notes">Notes</Label>
                        <Textarea id="alarm-notes" placeholder="Reminder instructions" value={newAlarm.notes}
                          onChange={e => setNewAlarm({ ...newAlarm, notes: e.target.value })} />
                      </div>
                      <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground" onClick={handleSaveAlarm}
                        disabled={!newAlarm.elderId || !newAlarm.title || !newAlarm.time}>
                        {editingAlarmId ? <Pencil className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                        {editingAlarmId ? 'Save Changes' : 'Create Alarm'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingAlarms.map((alarm) => (
                  <Card key={alarm.id} className="rounded-xl border-border shadow-sm">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="h-11 w-11 rounded-lg bg-gw-amber/10 flex items-center justify-center">
                        <Bell className="h-5 w-5 text-gw-amber" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{alarm.title}</h3>
                        <p className="text-sm text-muted-foreground">{alarm.elderName} · {alarm.displayTime}</p>
                        {alarm.notes && <p className="mt-1 text-xs text-muted-foreground">{alarm.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-gw-amber/30 text-gw-amber bg-gw-amber/5">{alarm.status}</Badge>
                        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEditAlarm(alarm)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteAlarmId(alarm.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <AlertDialog open={Boolean(deleteAlarmId)} onOpenChange={(open) => !open && setDeleteAlarmId(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete alarm?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {alarmPendingDelete
                        ? `${alarmPendingDelete.title} will be removed from upcoming alarms.`
                        : 'This alarm will be removed from upcoming alarms.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteAlarm}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
          )}

          {activeSection === 'alerts' && (
            <section className="space-y-4">
              <div>
                <h2 className="font-display text-xl text-foreground">Alert Center</h2>
                <p className="text-sm text-muted-foreground">Unresolved and recent safety events from connected watches.</p>
              </div>
              <div className="space-y-3">
                {activeAlerts.length === 0 ? (
                  <Card className="rounded-xl border-border shadow-sm">
                    <CardContent className="p-6 text-sm text-muted-foreground">No active alerts right now. Turn on demo mode to simulate events.</CardContent>
                  </Card>
                ) : activeAlerts.map((alert) => (
                  <Card key={alert.id} className={`rounded-xl shadow-sm ${alert.severity === 'critical' ? 'border-gw-red/40 bg-gw-red/5' : 'border-gw-amber/40 bg-gw-amber/5'}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-foreground">{alert.elder_name}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                          {alert.location && <p className="mt-2 text-xs text-muted-foreground">{alert.location}</p>}
                        </div>
                        <Badge variant="outline" className={alert.resolved ? 'border-gw-green/30 text-gw-green' : 'border-gw-red/30 text-gw-red'}>
                          {alert.resolved ? 'Resolved' : alert.severity}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {activeSection === 'reports' && (
            <section className="space-y-4">
              <div>
                <h2 className="font-display text-xl text-foreground">Care Reports</h2>
                <p className="text-sm text-muted-foreground">Generated summaries for clinical review and family updates.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {CARE_REPORTS.map((report) => (
                  <Card key={report.id} className="rounded-xl border-border shadow-sm">
                    <CardContent className="p-5">
                      <div className="h-10 w-10 rounded-lg bg-teal/10 flex items-center justify-center mb-4">
                        <FileText className="h-5 w-5 text-teal" />
                      </div>
                      <h3 className="font-semibold text-foreground">{report.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{report.summary}</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setActiveReportId(report.id)}>
                        View Report
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Dialog open={Boolean(activeReportId)} onOpenChange={(open) => !open && setActiveReportId(null)}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="font-display">{activeReport?.title || 'Care Report'}</DialogTitle>
                  </DialogHeader>
                  {activeReport && (
                    <div className="space-y-5">
                      <div className="rounded-lg border border-border bg-muted/40 p-4">
                        <p className="text-xs text-muted-foreground">Generated</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{activeReport.generatedAt}</p>
                        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{activeReport.summary}</p>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Findings</h3>
                        <div className="mt-3 space-y-2">
                          {activeReport.sections.map((section) => (
                            <div key={section} className="rounded-lg bg-background border border-border p-3 text-sm text-muted-foreground">
                              {section}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Recommended Actions</h3>
                        <div className="mt-3 space-y-2">
                          {activeReport.actions.map((action) => (
                            <div key={action} className="flex items-start gap-2 rounded-lg bg-teal/5 border border-teal/20 p-3 text-sm text-muted-foreground">
                              <CheckCircle2 className="h-4 w-4 text-teal mt-0.5 shrink-0" />
                              <span>{action}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button variant="outline" onClick={() => setActiveReportId(null)}>Close</Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </section>
          )}

          {/* Elder grid */}
          {(activeSection === 'dashboard' || activeSection === 'elders') && (
          <>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-foreground">{t('nav.elders')}</h2>
            <Dialog open={addElderOpen} onOpenChange={setAddElderOpen}>
              <DialogTrigger asChild>
                <Button className="bg-teal hover:bg-teal/90 text-primary-foreground rounded-lg">
                  <Plus className="h-4 w-4 mr-1" /> {t('dashboard.add_elder')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display">Add New Elder Profile</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="elder-name">Full Name *</Label>
                    <Input id="elder-name" placeholder="Usha" value={newElder.name}
                      onChange={e => setNewElder({ ...newElder, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="elder-age">Age *</Label>
                      <Input id="elder-age" type="number" placeholder="77" value={newElder.age}
                        onChange={e => setNewElder({ ...newElder, age: e.target.value })} />
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
                    <Input id="elder-conditions" placeholder="Hypertension, Diabetes, Arthritis" value={newElder.conditions}
                      onChange={e => setNewElder({ ...newElder, conditions: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="elder-phone">Phone Number</Label>
                    <Input id="elder-phone" type="tel" placeholder="+91 98765 43210" value={newElder.phone}
                      onChange={e => setNewElder({ ...newElder, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="elder-address">Address</Label>
                    <Textarea id="elder-address" placeholder="123 Sadashivanagar, Bangalore" value={newElder.address}
                      onChange={e => setNewElder({ ...newElder, address: e.target.value })} />
                  </div>

                  {/* Bluetooth Device Connection */}
                  <Card className="rounded-xl border-dashed border-2 border-teal/30">
                    <CardContent className="p-4">
                      <h4 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                        <Bluetooth className="h-4 w-4 text-teal" /> Connect Watch Device
                      </h4>
                      {btConnected ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 p-3 bg-gw-green/10 rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-gw-green animate-pulse" />
                            <span className="text-sm font-medium text-gw-green">Device Connected</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 bg-muted rounded-lg">
                              <span className="text-muted-foreground">Device ID:</span>
                              <span className="font-medium text-foreground ml-1">{btDeviceId}</span>
                            </div>
                            <div className="p-2 bg-muted rounded-lg">
                              <span className="text-muted-foreground">Battery:</span>
                              <span className="font-medium text-foreground ml-1">85%</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="text-xs text-destructive" onClick={() => { setBtConnected(false); setBtDeviceId(''); }}>
                            <X className="h-3 w-3 mr-1" /> Disconnect
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">Pair the G Care watch via Bluetooth to start monitoring vitals.</p>
                          <Button onClick={handleBluetoothConnect} disabled={btConnecting}
                            className="w-full bg-teal hover:bg-teal/90 text-primary-foreground rounded-lg">
                            {btConnecting ? (
                              <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" /> Scanning...</>
                            ) : (
                              <><Bluetooth className="h-4 w-4 mr-2" /> Scan & Connect Device</>
                            )}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Button className="w-full h-11 bg-teal hover:bg-teal/90 text-primary-foreground rounded-xl" onClick={handleAddElder}
                    disabled={!newElder.name || !newElder.age}>
                    <Plus className="h-4 w-4 mr-1" /> Create Elder Profile
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {elders.map((elder) => {
              const vitals = demoVitals[elder.id] || DEMO_VITALS[elder.id];
              return (
                <Card key={elder.id} className="rounded-xl shadow-sm hover:shadow-md transition-shadow border-border cursor-pointer"
                  onClick={() => navigate(`/elder/${elder.id}`)}>
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

                    <div className="mt-3 h-12">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparkData}>
                          <Line type="monotone" dataKey="v" stroke="#00B4A6" strokeWidth={1.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] border-teal/30 text-teal">
                        {elder.baselines_learned ? t('dashboard.baselines_learned') : t('dashboard.learning_day', { day: elder.baseline_day || 1 })}
                      </Badge>
                    </div>

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
          </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
