import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { VitalsGrid } from '@/components/VitalsGrid';
import { MedSmartInput } from '@/components/MedSmartInput';
import { useAppStore, type DemoElder, type DemoVitals, type Medication, type DemoAlert, type StoreAlarm } from '@/store';
import { useGuardianStore, type Reminder } from '@/store/guardianStore';
import { useAuthStore } from '@/store/authStore';
import { apiFetch, getReportFileUrl } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { DEMO_ELDERS, DEMO_MEDICATIONS, DEMO_VITALS, generateVitalsUpdate } from '@/lib/demoData';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import {
  broadcastGcareMessage,
  subscribeToGcareBroadcast,
  calculateMinutesBefore,
  formatTime12Hour,
  generateAppointmentKannadaMessage,
  generateAppointmentMultilingualMessage,
} from '@/lib/syncChannel';

const FREE_SCHEDULER_SLOTS = [
  { label: 'Slot 1', time: '09:30' },
  { label: 'Slot 2', time: '10:00' },
  { label: 'Slot 3', time: '11:30' },
  { label: 'Slot 4', time: '14:00' },
  { label: 'Slot 5', time: '16:30' },
];

type DashboardSection = 'dashboard' | 'elders' | 'medications' | 'alarms' | 'alerts' | 'reports';

type DashboardMedication = Medication;

type DashboardAlarm = StoreAlarm;

interface ClinicalReport {
  id: string;
  elderId: string;
  doctorId: string;
  doctorName: string;
  title: string;
  description: string;
  category: string;
  fileUrl: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
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

type DemoAppointmentStatus = 'requested' | 'confirmed';

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
  const {
    demoMode, setDemoMode, demoElders, setDemoElders, demoVitals, setDemoVitals,
    activeAlerts, setActiveAlerts, addAlert, resolveAlert, clearAlerts, removeAlert, stabilizeElderVitals,
    medications, setMedications, addMedication, updateMedication, deleteMedication,
    alarms, setAlarms, addAlarm, updateAlarm, deleteAlarm,
    setDemoStep, demoStep,
  } = useAppStore();
  const { user: authUser, logout } = useAuthStore();
  const setReminders = useGuardianStore((state) => state.setReminders);
  const addGuardianAlert = useGuardianStore((state) => state.addGuardianAlert);
  const addGuardianReminder = useGuardianStore((state) => state.addReminder);
  const acknowledgeGuardianAlert = useGuardianStore((state) => state.acknowledgeAlert);

  const [addElderOpen, setAddElderOpen] = useState(false);
  const [newElder, setNewElder] = useState({
    name: '', age: '', conditions: '', language: 'en', phone: '', address: '',
  });
  const [btConnecting, setBtConnecting] = useState(false);
  const [btConnected, setBtConnected] = useState(false);
  const [btDeviceId, setBtDeviceId] = useState('');
  const [activeSection, setActiveSection] = useState<DashboardSection>('dashboard');
  const [demoAppointmentStatus, setDemoAppointmentStatus] = useState<DemoAppointmentStatus>('requested');
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [appointmentAlert, setAppointmentAlert] = useState<DemoAlert | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    time: '10:00',
    notes: '',
  });
  const [addMedicationOpen, setAddMedicationOpen] = useState(false);
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);
  const [deleteMedicationId, setDeleteMedicationId] = useState<string | null>(null);
  const [addAlarmOpen, setAddAlarmOpen] = useState(false);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [deleteAlarmId, setDeleteAlarmId] = useState<string | null>(null);
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [clearAlertHistoryConfirmOpen, setClearAlertHistoryConfirmOpen] = useState(false);
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
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

  // Hydrate clinical alerts from server backend on mount
  useEffect(() => {
    let ignore = false;
    apiFetch<any[]>('/alerts')
      .then((serverAlerts) => {
        if (ignore || !Array.isArray(serverAlerts)) return;
        const currentIds = new Set(useAppStore.getState().activeAlerts.map(a => a.id));
        const newItems: DemoAlert[] = serverAlerts.map((sa: any) => ({
          id: sa.id,
          elder_id: sa.elder_id || sa.elderId || '',
          elder_name: sa.elder_name || sa.elderName || 'Patient',
          type: (sa.type || 'high_hr') as DemoAlert['type'],
          severity: (sa.severity || 'warning') as DemoAlert['severity'],
          message: sa.message || '',
          time: sa.time || new Date().toISOString(),
          resolved: sa.resolved ?? false,
        })).filter(a => !currentIds.has(a.id));

        if (newItems.length > 0) {
          useAppStore.setState((s) => {
            const combined = [...newItems, ...s.activeAlerts];
            const seen = new Set<string>();
            const deduped: DemoAlert[] = [];
            for (const a of combined) {
              const key = `${a.elder_name || ''}-${a.type}-${a.severity}-${a.resolved}`;
              if (!seen.has(key)) {
                seen.add(key);
                deduped.push(a);
              }
            }
            return { activeAlerts: deduped.slice(0, 15) };
          });
        }
      })
      .catch(() => {});

    // Prune existing alerts in state on mount to purge accumulated repetitive warning spam
    const state = useAppStore.getState();
    const seen = new Set<string>();
    const deduped: DemoAlert[] = [];
    let changed = false;
    for (const a of state.activeAlerts) {
      const key = `${a.elder_name || ''}-${a.type}-${a.severity}-${a.resolved}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(a);
      } else {
        changed = true;
      }
    }
    if (changed || state.activeAlerts.length > 15) {
      useAppStore.getState().setActiveAlerts(deduped.slice(0, 15));
    }

    return () => { ignore = true; };
  }, []);

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

  const NON_CLINICAL_REGEX = /\b(assignment|bda|big\s*data|homework|coursework|syllabus|semester|exam|quiz|lecture|notes|curriculum|vtu|b\.?tech|b\.?e\.?|computer\s*science|algorithm|hadoop|spark|mapreduce|kaggle|dataset|invoice|resume)\b/i;

  const validateAndSetFile = (file: File) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast({
        title: 'Invalid File Format',
        description: 'Please select a valid PDF clinical document (.pdf).',
        variant: 'destructive',
      });
      return;
    }

    if (NON_CLINICAL_REGEX.test(file.name)) {
      toast({
        title: 'Invalid Medical Report',
        description: `Academic or non-clinical document detected ("${file.name}"). Please select a valid clinical/checkup report.`,
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'The selected report exceeds the 10 MB limit.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim();
    if (!NON_CLINICAL_REGEX.test(cleanTitle)) {
      setNewReport((prev) => ({ ...prev, title: cleanTitle }));
    } else {
      setNewReport((prev) => ({ ...prev, title: '' }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleUploadReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReport.title.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter a report title.', variant: 'destructive' });
      return;
    }

    if (NON_CLINICAL_REGEX.test(newReport.title)) {
      toast({
        title: 'Invalid Medical Report Title',
        description: 'Report title cannot be an academic assignment or non-clinical subject. Please enter a valid medical report title (e.g. Complete Blood Count, Chest X-Ray).',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedFile) {
      toast({ title: 'Validation Error', description: 'Please select a medical report PDF from your computer.', variant: 'destructive' });
      return;
    }

    try {
      setUploadProgress(15);

      // Read local file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read document from disk'));
      });
      reader.readAsDataURL(selectedFile);
      const base64Data = await base64Promise;

      setUploadProgress(50);

      const saved = await apiFetch<ClinicalReport>('/reports', {
        method: 'POST',
        body: JSON.stringify({
          elderId: clinicalElderId,
          title: newReport.title,
          category: newReport.category,
          description: newReport.description,
          fileName: selectedFile.name,
          fileType: selectedFile.type || 'application/pdf',
          fileSize: selectedFile.size,
          fileData: base64Data,
        }),
      });

      setUploadProgress(100);
      setReportsList((prev) => [saved, ...prev]);
      setNewReport({ title: '', category: 'Lab Report', description: '' });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadProgress(null), 400);
      toast({ title: 'Report Verified & Uploaded', description: 'Clinical report validated and attached to patient history successfully.' });
    } catch (err: any) {
      setUploadProgress(null);
      toast({
        title: 'Upload Rejected',
        description: err.message || 'Invalid medical report. Please upload a valid clinical/checkup report.',
        variant: 'destructive',
      });
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
    let ignore = false;

    apiFetch<any>('/dashboard-data')
      .then((data) => {
        if (ignore) return;
        if (Array.isArray(data.elders) && data.elders.length > 0) {
          setDemoElders(data.elders);
        }
        if (Array.isArray(data.medications) && data.medications.length > 0) {
          setMedications((current) => {
            const merged = [...current];
            data.medications.forEach((m: any) => {
              const idx = merged.findIndex((x) => x.id === m.id);
              if (idx >= 0) merged[idx] = { ...merged[idx], ...m };
              else merged.push(m);
            });
            return merged;
          });
        }
        if (Array.isArray(data.alarms) && data.alarms.length > 0) {
          setAlarms((current) => {
            const merged = [...current];
            data.alarms.forEach((a: any) => {
              const idx = merged.findIndex((x) => x.id === a.id);
              if (idx >= 0) merged[idx] = { ...merged[idx], ...a };
              else merged.push(a);
            });
            return merged;
          });
        }
        if (Array.isArray(data.alerts) && data.alerts.length > 0) {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem('gcare_active_alerts') : null;
          if (raw !== '[]') {
            setActiveAlerts(data.alerts);
          }
        }
        if (data.vitals) {
          Object.entries(data.vitals).forEach(([id, v]) => setDemoVitals(id, v as any));
        }
      })
      .catch(() => {});

    return () => { ignore = true; };
  }, [setActiveAlerts, setDemoElders, setDemoVitals, setMedications, setAlarms]);

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

  // Doctor-only emergency appointment request.
  // It appears shortly after Demo Mode is enabled and resets when Demo Mode is turned off.
  useEffect(() => {
    if (!demoMode) {
      setDemoAppointmentStatus('requested');
      return;
    }

    const timer = window.setTimeout(() => {
      setDemoAppointmentStatus('requested');
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [demoMode]);

  const demoAppointmentVisible = demoMode;

  // Real-time cross-window listener for SOS alerts from Watch Simulator
  useEffect(() => {
    const unsubscribe = subscribeToGcareBroadcast((msg) => {
      if (msg.type === 'SOS_TRIGGERED') {
        if (msg.alert) {
          setActiveAlerts((prev) => {
            const exists = prev.some((a) => a.id === msg.alert.id);
            if (exists) return prev;
            return [msg.alert, ...prev];
          });
        }
        toast({
          title: '🚨 EMERGENCY SOS RECEIVED!',
          description: `Urgent SOS emergency from ${msg.elderName || 'Patient'}. Open alert to schedule urgent consultation.`,
          variant: 'destructive',
        });
      } else if (msg.type === 'ALERT_RESOLVED' || msg.type === 'ALERT_ACKNOWLEDGED') {
        if (msg.id) resolveAlert(msg.id);
      }
    });

    return unsubscribe;
  }, [setActiveAlerts, resolveAlert]);

  const confirmDemoAppointment = async () => {
    setDemoAppointmentStatus('confirmed');
    const doctorName = authUser?.name || 'Dr. Ramesh Kumar';
    const elder = elders.find((e) => e.full_name.toLowerCase().includes('usha')) || elders[0];
    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const apptHour = (now.getHours() + 2) % 24;
    const apptTime = `${String(apptHour).padStart(2, '0')}:00`;
    const prepAlarmTime = calculateMinutesBefore(apptTime, 60);

    const { spokenText, displayText, prepNotes } = generateAppointmentKannadaMessage(
      elder?.full_name || 'Usha',
      todayStr,
      apptTime,
      doctorName,
      prepAlarmTime
    );

    if (elder) {
      stabilizeElderVitals(elder.id);
      addAlarm({
        id: `demo-prep-alarm-${Date.now()}`,
        elderId: elder.id,
        title: `ಆಸ್ಪತ್ರೆ ತಪಾಸಣೆ ತಯಾರಿ (Hospital Checkup Preparation)`,
        time: prepAlarmTime,
        type: 'appointment',
        status: 'Scheduled',
        notes: `${prepNotes} (60 min prior alarm)`,
      });

      addGuardianReminder({
        id: `demo-guardian-prep-${Date.now()}`,
        elderId: elder.id,
        elderName: elder.full_name,
        type: 'appointment',
        title: `ಆಸ್ಪತ್ರೆ ತಪಾಸಣೆ ತಯಾರಿ (Hospital Prep)`,
        time: prepAlarmTime,
        repeat: 'once',
        verified: false,
        doctorName,
        appointmentDate: todayStr,
      });

      broadcastGcareMessage({
        type: 'APPOINTMENT_SCHEDULED',
        elderId: elder.id,
        elderName: elder.full_name,
        language: elder.language_pref || 'kn',
        date: todayStr,
        time: apptTime,
        prepAlarmTime,
        doctorName,
        kannadaMessage: spokenText,
        englishMessage: `Emergency appointment confirmed for ${elder.full_name} at ${apptTime}. Preparation alarm set for ${prepAlarmTime} (60 min prior).`,
        timestamp: Date.now(),
      });
    }

    toast({
      title: 'Emergency Appointment Confirmed',
      description: `Immediate appointment confirmed for Usha at ${apptTime}. Watch alerted in Kannada with voice output. Prep alarm: ${prepAlarmTime}.`,
    });
  };

  const unresolvedCount = activeAlerts.filter(a => !a.resolved).length;

  const beginAlertAcknowledgement = (selectedAlert?: DemoAlert) => {
    const alert = selectedAlert || activeAlerts.find((item) => !item.resolved);
    if (!alert) return;
    setAppointmentAlert(alert);
    setAppointmentDialogOpen(true);
  };

  const handleDirectAcknowledge = async (selectedAlert?: DemoAlert) => {
    const alert = selectedAlert || activeAlerts.find((item) => !item.resolved);
    if (!alert) return;

    const elder = elders.find((item) => item.id === alert.elder_id)
      || elders.find((item) => item.full_name === alert.elder_name)
      || elders[0];
    const doctorName = authUser?.name || 'Dr. Ramesh Kumar';
    const notification = `Appointment booked and resolved by Dr. ${doctorName} for ${elder?.full_name || 'Patient'}.`;

    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const apptHour = (now.getHours() + 1) % 24;
    const apptTime = `${String(apptHour).padStart(2, '0')}:30`;
    const prepAlarmTime = calculateMinutesBefore(apptTime, 60);
    const prefLang = elder?.language_pref || 'kn';
    const apptId = `direct-ack-${Date.now()}`;

    const { spokenText, displayText, prepNotes, speechLang } = generateAppointmentMultilingualMessage(
      elder?.full_name || 'Usha',
      todayStr,
      apptTime,
      doctorName,
      prepAlarmTime,
      prefLang
    );

    resolveAlert(alert.id);
    try {
      await apiFetch(`/alerts/${alert.id}`, { method: 'PUT', body: JSON.stringify({ resolved: true }) });
    } catch {}

    if (elder) {
      await apiFetch('/alerts', {
        method: 'POST',
        body: JSON.stringify({
          elderId: elder.id,
          elder_id: elder.id,
          elder_name: elder.full_name,
          type: 'appointment',
          severity: 'info',
          message: notification,
          resolved: true,
        }),
      }).catch(() => {});

      addGuardianAlert({
        id: `appointment-ack-${Date.now()}`,
        type: 'vital_abnormal',
        severity: 'info',
        message: notification,
        time: new Date().toISOString(),
        acknowledged: true,
        elderName: elder.full_name,
      });

      addAlarm({
        id: `direct-ack-prep-${Date.now()}`,
        elderId: elder.id,
        title: prefLang === 'kn' ? 'ಆಸ್ಪತ್ರೆ ತಪಾಸಣೆ ತಯಾರಿ (Hospital Checkup Preparation)' :
               prefLang === 'hi' ? 'अस्पताल जांच तैयारी (Hospital Preparation)' :
               prefLang === 'ta' ? 'மருத்துவமனை பரிசோதனை தயாரிப்பு (Hospital Preparation)' :
               'Hospital Checkup Preparation',
        time: prepAlarmTime,
        type: 'appointment',
        status: 'Scheduled',
        notes: `${prepNotes} (60 min prior alarm)`,
        appointmentId: apptId,
        appointmentDate: todayStr,
        appointmentTime: apptTime,
        doctorName,
        isOneHourReminder: true,
      });

      addGuardianReminder({
        id: `direct-ack-guardian-${Date.now()}`,
        elderId: elder.id,
        elderName: elder.full_name,
        type: 'appointment',
        title: prefLang === 'kn' ? 'ಆಸ್ಪತ್ರೆ ತಪಾಸಣೆ ತಯಾರಿ (Hospital Prep)' :
               prefLang === 'hi' ? 'अस्पताल तैयारी (Hospital Prep)' :
               prefLang === 'ta' ? 'மருத்துவமனை தயாரிப்பு (Hospital Prep)' :
               'Hospital Checkup Preparation',
        time: prepAlarmTime,
        repeat: 'once',
        verified: false,
        doctorName,
        appointmentId: apptId,
        appointmentDate: todayStr,
        appointmentTime: apptTime,
        isOneHourReminder: true,
      });

      stabilizeElderVitals(elder.id);

      broadcastGcareMessage({
        type: 'APPOINTMENT_SCHEDULED',
        appointmentId: apptId,
        elderId: elder.id,
        elderName: elder.full_name,
        language: prefLang,
        date: todayStr,
        time: apptTime,
        prepAlarmTime,
        doctorName,
        patientMessage: displayText,
        spokenText,
        speechLang,
        kannadaMessage: spokenText,
        englishMessage: `${notification}. Preparation alarm set for ${prepAlarmTime} (60 min prior).`,
        alertId: alert.id,
        timestamp: Date.now(),
      });
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gcare:acknowledge-alert', {
          detail: { id: alert.id, elderId: elder?.id, elderName: elder?.full_name },
        })
      );
    }

    toast({
      title: 'Alert Acknowledged & Resolved',
      description: `Appointment booked and resolved. Watch alerted in ${prefLang.toUpperCase()} with voice output. Prep alarm: ${prepAlarmTime}.`,
    });
  };

  const handleAcknowledgeAll = async () => {
    const unres = activeAlerts.filter((a) => !a.resolved);
    if (unres.length === 0) return;

    const handledElderIds = new Set<string>();

    for (const alert of unres) {
      resolveAlert(alert.id);
      try {
        await apiFetch(`/alerts/${alert.id}`, { method: 'PUT', body: JSON.stringify({ resolved: true }) });
      } catch {}

      const elder = elders.find((item) => item.id === alert.elder_id)
        || elders.find((item) => item.full_name === alert.elder_name);

      if (elder && !handledElderIds.has(elder.id)) {
        handledElderIds.add(elder.id);
        stabilizeElderVitals(elder.id);
        broadcastGcareMessage({
          type: 'ALERT_RESOLVED',
          id: alert.id,
          elderId: elder.id,
          elderName: elder.full_name,
          timestamp: Date.now(),
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('gcare:acknowledge-alert', {
              detail: { id: alert.id, elderId: elder.id, elderName: elder.full_name },
            })
          );
        }
      }
    }

    toast({
      title: 'All Alerts Acknowledged & Resolved',
      description: `Resolved ${unres.length} alert(s) and stabilized patient telemetry streams.`,
    });
  };

  const handleClearAlertHistory = async (mode: 'all' | 'resolved' = 'all') => {
    clearAlerts(mode);
    try {
      await apiFetch(`/alerts${mode === 'resolved' ? '?resolved=true' : ''}`, { method: 'DELETE' });
    } catch {}

    broadcastGcareMessage({
      type: 'ALERTS_CLEARED',
      mode,
      timestamp: Date.now(),
    });

    toast({
      title: mode === 'resolved' ? 'Resolved Alerts Cleared' : 'Alert History Cleared',
      description: mode === 'resolved'
        ? 'Cleared all resolved alerts from clinical history.'
        : 'All clinical alerts and notifications have been cleared.',
    });
  };

  const handleRemoveSingleAlert = async (id: string) => {
    removeAlert(id);
    try {
      await apiFetch(`/alerts/${id}`, { method: 'DELETE' });
    } catch {}
    toast({
      title: 'Alert Removed',
      description: 'The selected alert was removed from history.',
    });
  };

  const scheduleAlertAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!appointmentAlert) return;

    const elder = elders.find((item) => item.id === appointmentAlert.elder_id)
      || elders.find((item) => item.full_name === appointmentAlert.elder_name)
      || elders[0];
    if (!elder) {
      toast({ title: 'Unable to schedule', description: 'Choose a patient before scheduling an appointment.', variant: 'destructive' });
      return;
    }

    // Past date/time validation
    const apptDateTime = new Date(`${appointmentForm.date}T${appointmentForm.time}:00`);
    const now = new Date();
    if (isNaN(apptDateTime.getTime())) {
      toast({ title: 'Invalid Date/Time', description: 'Please enter a valid appointment date and time.', variant: 'destructive' });
      return;
    }
    if (apptDateTime.getTime() < now.getTime() - 60000) {
      toast({
        title: 'Cannot Schedule in the Past',
        description: 'Selected appointment date and time has already passed. Please pick a future date/time.',
        variant: 'destructive',
      });
      return;
    }

    const doctorName = authUser?.name || 'Dr. Ramesh Kumar';
    const prepAlarmTime = calculateMinutesBefore(appointmentForm.time, 60);
    const prefLang = elder.language_pref || 'kn';
    const apptId = `appt-${Date.now()}`;

    const { spokenText, displayText, prepNotes, speechLang } = generateAppointmentMultilingualMessage(
      elder.full_name,
      appointmentForm.date,
      appointmentForm.time,
      doctorName,
      prepAlarmTime,
      prefLang
    );

    const notification = `Appointment booked by Dr. ${doctorName} for ${elder.full_name} on ${appointmentForm.date} at ${appointmentForm.time}.`;

    try {
      // 1. Save Main Appointment Alarm
      const savedAlarm = await apiFetch<DashboardAlarm>('/alarms', {
        method: 'POST',
        body: JSON.stringify({
          id: apptId,
          elderId: elder.id,
          title: `Appointment with Dr. ${doctorName}`,
          time: appointmentForm.time,
          type: 'appointment',
          status: 'Scheduled',
          notes: `${notification}${appointmentForm.notes.trim() ? ` Notes: ${appointmentForm.notes.trim()}` : ''}`,
          appointmentId: apptId,
          appointmentDate: appointmentForm.date,
          appointmentTime: appointmentForm.time,
          doctorName,
        }),
      });

      // 2. Save 60-Minute-Prior Hospital Checkup Preparation Alarm
      const prepAlarmId = `prep-${Date.now()}`;
      const prepAlarm = await apiFetch<DashboardAlarm>('/alarms', {
        method: 'POST',
        body: JSON.stringify({
          id: prepAlarmId,
          elderId: elder.id,
          title: prefLang === 'kn' ? 'ಆಸ್ಪತ್ರೆ ತಪಾಸಣೆ ತಯಾರಿ (Hospital Checkup Preparation)' :
                 prefLang === 'hi' ? 'अस्पताल जांच तैयारी (Hospital Preparation)' :
                 prefLang === 'ta' ? 'மருத்துவமனை பரிசோதனை தயாரிப்பு (Hospital Preparation)' :
                 'Hospital Checkup Preparation',
          time: prepAlarmTime,
          type: 'appointment',
          status: 'Scheduled',
          notes: `${prepNotes} Appointment at ${appointmentForm.time} on ${appointmentForm.date} with Dr. ${doctorName}. Leave early!`,
          appointmentId: apptId,
          appointmentDate: appointmentForm.date,
          appointmentTime: appointmentForm.time,
          doctorName,
          isOneHourReminder: true,
        }),
      }).catch(() => null);

      await apiFetch('/alerts', {
        method: 'POST',
        body: JSON.stringify({
          elderId: elder.id,
          elder_id: elder.id,
          elder_name: elder.full_name,
          type: 'appointment',
          severity: 'info',
          message: `${notification} (Appointment booked & resolved)`,
          resolved: true,
        }),
      }).catch(() => {});

      addAlarm({
        ...savedAlarm,
        type: 'appointment',
        appointmentId: apptId,
        appointmentDate: appointmentForm.date,
        appointmentTime: appointmentForm.time,
        doctorName,
      });
      if (prepAlarm) {
        addAlarm({
          ...prepAlarm,
          type: 'appointment',
          appointmentId: apptId,
          appointmentDate: appointmentForm.date,
          appointmentTime: appointmentForm.time,
          doctorName,
          isOneHourReminder: true,
        });
      }

      addGuardianReminder({
        id: `guardian-prep-alarm-${Date.now()}`,
        elderId: elder.id,
        elderName: elder.full_name,
        type: 'appointment',
        title: prefLang === 'kn' ? 'ಆಸ್ಪತ್ರೆ ತಪಾಸಣೆ ತಯಾರಿ (Hospital Prep - 60 min early)' :
               prefLang === 'hi' ? 'अस्पताल तैयारी (Hospital Prep - 60 min early)' :
               prefLang === 'ta' ? 'மருத்துவமனை தயாரிப்பு (Hospital Prep - 60 min early)' :
               'Hospital Checkup Preparation (60 min early)',
        time: prepAlarmTime,
        repeat: 'once',
        verified: false,
        doctorName,
        appointmentId: apptId,
        appointmentDate: appointmentForm.date,
        appointmentTime: appointmentForm.time,
        isOneHourReminder: true,
      });

      addGuardianAlert({
        id: `appointment-${savedAlarm.id}`,
        type: 'vital_abnormal',
        severity: 'info',
        message: `${notification} (Appointment booked & resolved)`,
        time: new Date().toISOString(),
        acknowledged: true,
        elderName: elder.full_name,
      });

      resolveAlert(appointmentAlert.id);
      try {
        await apiFetch(`/alerts/${appointmentAlert.id}`, { method: 'PUT', body: JSON.stringify({ resolved: true }) });
      } catch {}

      stabilizeElderVitals(elder.id);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('gcare:acknowledge-alert', {
            detail: { id: appointmentAlert.id, elderId: elder.id, elderName: elder.full_name },
          })
        );
      }

      // Cross-window / Split-screen broadcast
      broadcastGcareMessage({
        type: 'APPOINTMENT_SCHEDULED',
        appointmentId: apptId,
        elderId: elder.id,
        elderName: elder.full_name,
        language: prefLang,
        date: appointmentForm.date,
        time: appointmentForm.time,
        prepAlarmTime,
        doctorName,
        patientMessage: displayText,
        spokenText,
        speechLang,
        kannadaMessage: spokenText,
        englishMessage: `${notification}. Preparation alarm set for ${prepAlarmTime} (60 mins prior).`,
        alertId: appointmentAlert.id,
        timestamp: Date.now(),
      });

      setAppointmentDialogOpen(false);
      setAppointmentAlert(null);
      toast({
        title: 'Appointment scheduled & resolved',
        description: `Patient watch updated in ${prefLang.toUpperCase()} with voice output. Preparation alarm registered for ${prepAlarmTime} (60 min prior).`,
      });
    } catch (err: any) {
      toast({ title: 'Unable to schedule appointment', description: err.message || 'Please try again.', variant: 'destructive' });
    }
  };

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
      updateMedication(editingMedicationId, savedMedication);
    } else {
      addMedication(savedMedication);
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
      updateAlarm(editingAlarmId, savedAlarm);
    } else {
      addAlarm(savedAlarm);
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
    deleteMedication(deleteMedicationId);
    setDeleteMedicationId(null);
    toast({ title: 'Deleted', description: 'Medication removed' });
  };

  const handleDeleteAlarm = async () => {
    if (!deleteAlarmId) return;
    try {
      await apiFetch(`/alarms/${deleteAlarmId}`, { method: 'DELETE' });
    } catch {}
    deleteAlarm(deleteAlarmId);
    setDeleteAlarmId(null);
    toast({ title: 'Deleted', description: 'Reminder alarm removed' });
  };

  const handleDeleteReport = async () => {
    if (!deleteReportId) return;
    try {
      await apiFetch(`/reports/${deleteReportId}`, { method: 'DELETE' });
      setReportsList((prev) => prev.filter((r) => r.id !== deleteReportId));
      toast({ title: 'Report Deleted', description: 'Medical record deleted from patient history.' });
    } catch {
      setReportsList((prev) => prev.filter((r) => r.id !== deleteReportId));
      toast({ title: 'Report Removed', description: 'Medical record removed.' });
    } finally {
      setDeleteReportId(null);
    }
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
            <div className="flex items-center gap-3 flex-wrap">
              {activeSection === 'alerts' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive hover:text-white font-medium text-xs h-8 shadow-sm"
                  onClick={() => handleClearAlertHistory('all')}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear Alert History
                </Button>
              )}
              <div className="flex items-center gap-2 border border-gw-purple/30 bg-gw-purple/5 px-3 py-1.5 rounded-lg">
                <span className="text-xs text-muted-foreground">{t('dashboard.demo_mode')}</span>
                <Switch checked={demoMode} onCheckedChange={setDemoMode} />
              </div>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={async () => { await logout(); navigate('/'); }}>
                <LogOut className="h-4 w-4 mr-1" /> {t('nav.logout')}
              </Button>
            </div>
          </header>

          {/* Critical Vitals Anomaly Banner for Doctors */}
          {unresolvedCount > 0 && (
            <Card className="rounded-xl border-2 border-gw-red bg-gw-red/10 shadow-sm p-4 animate-pulse-border">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="h-6 w-6 text-gw-red flex-shrink-0 mt-0.5 animate-bounce" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gw-red text-base">🚨 URGENT PATIENT VITALS ALERT</h3>
                      <Badge className="bg-gw-red text-white text-[10px] uppercase font-semibold">
                        {activeAlerts.find(a => !a.resolved)?.severity || 'CRITICAL'}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1">
                      {activeAlerts.find(a => !a.resolved)?.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Received {new Date(activeAlerts.find(a => !a.resolved)?.time || Date.now()).toLocaleTimeString()} · Monitored Telemetry Stream
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 border-destructive/40 text-destructive hover:bg-destructive hover:text-white font-medium bg-background/80"
                    onClick={() => setClearAlertHistoryConfirmOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Clear History
                  </Button>
                  {unresolvedCount > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 border-teal/40 text-teal hover:bg-teal/10"
                      onClick={handleAcknowledgeAll}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Resolve All ({unresolvedCount})
                    </Button>
                  )}
                  <Button size="sm" className="bg-teal text-primary-foreground text-xs h-8" onClick={() => setActiveSection('alerts')}>
                    Review All Alerts ({unresolvedCount})
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleDirectAcknowledge()}>
                    Acknowledge
                  </Button>
                  <Button size="sm" className="bg-teal text-primary-foreground text-xs h-8" onClick={() => beginAlertAcknowledgement()}>
                    Schedule Appt
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Dialog open={appointmentDialogOpen} onOpenChange={setAppointmentDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Schedule urgent appointment</DialogTitle>
                <DialogDescription>
                  Acknowledge this alert and notify the guardian and caretaker/nurse of the appointment time.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={scheduleAlertAppointment} className="space-y-4">
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium">{appointmentAlert?.elder_name || 'Selected patient'}</p>
                  <p className="mt-1 text-muted-foreground">{appointmentAlert?.message}</p>
                </div>

                {/* Free Scheduler Slots */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-muted-foreground">Free Scheduler Slots</Label>
                    <span className="text-[10px] text-teal font-medium">Doctor Available</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {FREE_SCHEDULER_SLOTS.map((slot) => (
                      <Button
                        key={slot.time}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`text-xs h-7 px-1 justify-center transition-all ${
                          appointmentForm.time === slot.time
                            ? 'border-teal bg-teal/15 text-teal font-bold shadow-sm'
                            : 'hover:border-teal/40'
                        }`}
                        onClick={() => setAppointmentForm({ ...appointmentForm, time: slot.time })}
                      >
                        <span className="font-mono text-[11px]">{slot.time}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="appointment-date">Date</Label>
                    <Input id="appointment-date" type="date" min={new Date().toISOString().slice(0, 10)} value={appointmentForm.date}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, date: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="appointment-time">Time</Label>
                    <Input id="appointment-time" type="time" value={appointmentForm.time}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, time: e.target.value })} required />
                  </div>
                </div>

                {/* 60-Minute Preparation Alarm Info Box */}
                <div className="rounded-lg bg-teal/10 border border-teal/20 p-2.5 text-xs text-teal-900 dark:text-teal-200">
                  <p className="font-semibold flex items-center gap-1.5 text-teal">
                    <Bell className="h-3.5 w-3.5 shrink-0" />
                    <span>Automatic 60-Minute Preparation Alarm</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    Alarm will be registered on the patient's watch for <span className="font-mono font-bold text-foreground">{calculateMinutesBefore(appointmentForm.time, 60)}</span> (60 minutes prior) with Kannada voice notification to leave early for checkup.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appointment-notes">Notes for guardian and nurse</Label>
                  <Textarea id="appointment-notes" value={appointmentForm.notes} placeholder="Bring current medications and recent reports."
                    onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAppointmentDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-teal hover:bg-teal/90 text-primary-foreground">Confirm & notify</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Active section rendering */}

          {/* DASHBOARD SECTION */}
          {activeSection === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {demoAppointmentVisible && (
                  <Card className="rounded-xl border-2 border-red-500/30 bg-red-500/5 shadow-lg">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
                      <div>
                        <CardTitle className="font-display text-base font-bold text-red-600 flex items-center gap-2">
                          🚨 Urgent Appointment Request
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Emergency consultation requested for Usha.
                        </p>
                      </div>
                      <Badge className={demoAppointmentStatus === 'confirmed' ? 'bg-emerald-600 text-white border-0' : 'bg-red-600 text-white border-0'}>
                        {demoAppointmentStatus === 'confirmed' ? 'CONFIRMED' : 'URGENT'}
                      </Badge>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-border bg-background p-3">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Patient</p>
                          <p className="mt-1 font-semibold text-foreground">Usha</p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Emergency</p>
                          <p className="mt-1 font-semibold text-red-600">Fall + SOS</p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Heart Rate</p>
                          <p className="mt-1 font-semibold text-foreground">118 BPM</p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">SpO₂</p>
                          <p className="mt-1 font-semibold text-red-600">91%</p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                        <p className="text-sm font-semibold text-red-600">Emergency reason</p>
                        <p className="mt-1 text-sm text-foreground">Fall detected and SOS activated for Usha.</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Sadashivanagar, Bangalore</span>
                          <span>Doctor: Dr. Ramesh Kumar</span>
                          <span>Hospital: Apollo Hospitals</span>
                        </div>
                      </div>

                      {demoAppointmentStatus === 'requested' ? (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                          <div>
                            <p className="font-semibold text-amber-700">Emergency appointment requested</p>
                            <p className="text-xs text-muted-foreground">Immediate consultation is required for this demo emergency.</p>
                          </div>
                          <Button className="bg-teal hover:bg-teal/90 text-primary-foreground" onClick={confirmDemoAppointment}>
                            Confirm Emergency Appointment
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                          <p className="font-semibold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Emergency appointment confirmed</p>
                          <p className="mt-1 text-xs text-muted-foreground">Usha's immediate consultation has been confirmed.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
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
                          <div className="w-11 h-11 rounded-full bg-teal/15 flex items-center justify-center text-teal font-semibold shrink-0">
                            {elder.full_name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{elder.full_name}</h3>
                            <p className="text-xs text-muted-foreground">Age {elder.age}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border/50">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${elder.connection_status === 'connected' ? 'bg-gw-green animate-pulse-dot' : 'bg-gw-red'}`} />
                            <Battery className="h-3.5 w-3.5 text-teal shrink-0" />
                            <span className="font-mono font-medium">{elder.battery}%</span>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">{alarm.title}</h3>
                          {alarm.isOneHourReminder && (
                            <Badge variant="outline" className="text-[10px] text-teal border-teal/40 bg-teal/10">
                              60-Min Prep Alarm
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Time: <span className="font-mono font-medium text-foreground">{formatTime12Hour(alarm.time)}</span> · Type: {alarm.type}
                          {alarm.appointmentTime && <span className="text-teal ml-1.5 font-medium">(For Appt at {formatTime12Hour(alarm.appointmentTime)})</span>}
                        </p>
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
            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div>
                  <h2 className="font-display text-xl text-foreground">Clinical Notifications & Alerts</h2>
                  <p className="text-sm text-muted-foreground">Real-time physiological alerts, threshold violations, and urgent events.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {unresolvedCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 border-teal/40 text-teal hover:bg-teal/10 font-medium"
                      onClick={handleAcknowledgeAll}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Acknowledge All ({unresolvedCount})
                    </Button>
                  )}
                  <Badge variant="outline" className="text-teal border-teal/30">
                    {unresolvedCount} Active
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground border-border">
                    {activeAlerts.filter((a) => a.resolved).length} in History
                  </Badge>
                </div>
              </div>

              {/* 1. ACTIVE ALERTS SECTION */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    Active Alerts ({unresolvedCount})
                  </h3>
                </div>

                {unresolvedCount === 0 ? (
                  <Card className="rounded-xl border-border bg-card">
                    <CardContent className="p-6 text-center text-muted-foreground">
                      <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-gw-green" />
                      <p className="font-medium text-foreground text-sm">All Patients Stable</p>
                      <p className="text-xs text-muted-foreground mt-0.5">No active abnormal vital notifications across connected patient watches.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2.5">
                    {activeAlerts.filter((a) => !a.resolved).map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3.5 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm ${
                          alert.severity === 'critical'
                            ? 'border-gw-red/40 bg-gw-red/10'
                            : 'border-gw-amber/40 bg-gw-amber/10'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">{alert.elder_name}</span>
                            <Badge className={`text-[10px] uppercase font-semibold ${
                              alert.severity === 'critical' ? 'bg-gw-red text-white' : 'bg-gw-amber text-slate-950'
                            }`}>
                              {alert.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(alert.time).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="font-medium text-sm text-foreground">{alert.message}</p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleDirectAcknowledge(alert)}>
                            Acknowledge
                          </Button>
                          <Button size="sm" className="bg-teal text-primary-foreground text-xs h-8" onClick={() => beginAlertAcknowledgement(alert)}>
                            Schedule Appt
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Delete alert"
                            onClick={() => handleRemoveSingleAlert(alert.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. ALERT HISTORY SECTION */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-gw-green" />
                    Alert History ({activeAlerts.filter((a) => a.resolved).length})
                  </h3>
                  {activeAlerts.some((a) => a.resolved) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 border-destructive/40 text-destructive hover:bg-destructive hover:text-white font-medium shadow-sm"
                      onClick={() => setClearAlertHistoryConfirmOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Clear Alert History
                    </Button>
                  )}
                </div>

                {activeAlerts.filter((a) => a.resolved).length === 0 ? (
                  <Card className="rounded-xl border-dashed border-border bg-muted/20">
                    <CardContent className="p-4 text-center text-xs text-muted-foreground">
                      No resolved alerts in history.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {activeAlerts.filter((a) => a.resolved).map((alert) => (
                      <div
                        key={alert.id}
                        className="p-3 border rounded-xl flex items-center justify-between gap-3 bg-muted/30 border-border opacity-85 hover:opacity-100 transition-opacity"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground text-xs">{alert.elder_name}</span>
                            <Badge variant="outline" className="text-[10px] text-gw-green border-gw-green/40">Resolved</Badge>
                            <span className="text-[11px] text-muted-foreground">{new Date(alert.time).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{alert.message}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete from history"
                          onClick={() => handleRemoveSingleAlert(alert.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
                            <Label htmlFor="doctor-medical-report-file" className="text-sm font-semibold flex items-center justify-between">
                              <span>Attach Medical Document (PDF) *</span>
                              <span className="text-xs font-normal text-muted-foreground">Select file from local computer</span>
                            </Label>
                            <input
                              type="file"
                              id="doctor-medical-report-file"
                              ref={fileInputRef}
                              accept=".pdf,application/pdf"
                              onChange={handleFileChange}
                              className="sr-only"
                            />
                            {selectedFile ? (
                              <div className="flex items-center justify-between p-3.5 bg-secondary/35 rounded-xl border border-teal/30 text-xs">
                                <div className="flex items-center gap-2.5 overflow-hidden">
                                  <div className="p-2 bg-teal/15 text-teal rounded-lg shrink-0">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <span className="font-semibold text-foreground truncate block">{selectedFile.name}</span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {(selectedFile.size / 1024).toFixed(1)} KB · Local file ready to upload
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-destructive hover:bg-destructive/10 px-3 shrink-0 text-xs font-medium"
                                  onClick={() => {
                                    setSelectedFile(null);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                  }}
                                >
                                  Remove
                                </Button>
                              </div>
                            ) : (
                              <label
                                htmlFor="doctor-medical-report-file"
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleFileDrop}
                                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                                  isDragging
                                    ? 'border-teal bg-teal/5 scale-[1.01]'
                                    : 'border-border hover:border-teal/50 hover:bg-muted/30'
                                }`}
                              >
                                <div className="p-3 rounded-full bg-teal/10 text-teal mb-2">
                                  <UploadCloud className="h-6 w-6" />
                                </div>
                                <span className="font-semibold text-foreground text-sm">
                                  Click here to choose PDF from your computer
                                </span>
                                <span className="text-xs text-muted-foreground mt-0.5">
                                  Drag & drop your medical document here, or click to open file explorer
                                </span>
                                <span className="text-[10px] text-muted-foreground/80 mt-2 bg-muted/60 px-2 py-0.5 rounded-full border border-border/50">
                                  Accepts PDF up to 10 MB (Blood tests, CBC, ECG, Radiology, Prescriptions)
                                </span>
                              </label>
                            )}
                          </div>

                          {uploadProgress !== null && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Verifying & uploading document...</span>
                                <span>{Math.min(uploadProgress, 100)}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-teal transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                              </div>
                            </div>
                          )}

                          <Button
                            type="submit"
                            disabled={!newReport.title || !selectedFile || uploadProgress !== null}
                            className="w-full bg-teal hover:bg-teal/90 text-primary-foreground font-medium"
                          >
                            {uploadProgress !== null ? 'Validating & Uploading...' : 'Add Report to Patient History'}
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
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-secondary text-teal hover:bg-secondary border-0 text-[10px]">{report.category}</Badge>
                                    <span className="text-[10px] text-muted-foreground">{new Date(report.createdAt).toLocaleDateString()}</span>
                                  </div>
                                  <h4 className="font-medium text-foreground text-sm mt-1 truncate">{report.title}</h4>
                                  <p className="text-[10px] text-muted-foreground">Doctor: {report.doctorName}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <a
                                    href={getReportFileUrl(report.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal/10 text-teal hover:bg-teal/20 transition-colors"
                                  >
                                    <FileText className="h-3.5 w-3.5" /> Open PDF
                                  </a>
                                  <Button size="sm" variant="outline" className="border-border text-foreground hover:bg-secondary/40 text-xs" onClick={() => setPreviewReport(report)}>
                                    Details
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                                    title="Delete report from patient history"
                                    onClick={() => setDeleteReportId(report.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
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
                  <a
                    href={getReportFileUrl(previewReport.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal font-medium hover:underline flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[200px]">{previewReport.fileName || previewReport.fileUrl || 'View Attached PDF'}</span>
                  </a>
                </div>
              </div>
              
              <div className="p-4 bg-muted/50 rounded-xl space-y-1.5 border border-border/40">
                <span className="font-semibold text-xs text-muted-foreground block">Clinical Observations & Findings</span>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {previewReport.description || 'No comments entered.'}
                </p>
              </div>

              <div className="flex justify-between items-center pt-2">
                <a
                  href={getReportFileUrl(previewReport.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-teal text-primary-foreground hover:bg-teal/90 transition-colors shadow-sm"
                >
                  <FileText className="h-4 w-4" /> Open Document in New Tab
                </a>
                <Button onClick={() => setPreviewReport(null)} variant="outline">Close</Button>
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

      {/* Delete Report Alert */}
      <AlertDialog open={Boolean(deleteReportId)} onOpenChange={(open) => !open && setDeleteReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Medical Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This medical document will be permanently removed from this patient's medical history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteReport} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Alert History Confirmation */}
      <AlertDialog open={clearAlertHistoryConfirmOpen} onOpenChange={setClearAlertHistoryConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Alert History?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all acknowledged and resolved clinical alerts from history.
              Active unacknowledged emergency alerts will be safely preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleClearAlertHistory('resolved');
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

export default DoctorPortal;
