import { demoBattery, demoReading } from '@/lib/patientSimulation.js';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Heart, Droplets, Wind, Thermometer, Brain, Footprints, Vibrate } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';
import { loadVitalsCSV, getHourlyData, getLatestVitals, type VitalsRow } from '@/lib/csvLoader';
import { useGuardianStore } from '@/store/guardianStore';
import { useAppStore, type MotionState } from '@/store';
import { apiFetch } from '@/lib/api';

const statusColor = (val: number, low: number, high: number) => {
  if (val < low || val > high) return 'text-destructive';
  if (val < low * 1.05 || val > high * 0.95) return 'text-gw-amber';
  return 'text-gw-green';
};

const statusBg = (val: number, low: number, high: number) => {
  if (val < low || val > high) return 'bg-destructive/10 border-destructive/20';
  if (val < low * 1.05 || val > high * 0.95) return 'bg-gw-amber/10 border-gw-amber/20';
  return 'bg-gw-green/10 border-gw-green/20';
};

const MOTION_LABELS: Record<MotionState, { label: string; color: string }> = {
  walking: { label: '🚶 Walking', color: 'text-gw-green' },
  sitting: { label: '🪑 Sitting', color: 'text-teal' },
  standing: { label: '🧍 Standing', color: 'text-blue-500' },
  lying_down: { label: '🛏️ Lying Down', color: 'text-gw-purple' },
};

const FeedTab: React.FC = () => {
  const { t } = useTranslation();
  const guardianUser = useGuardianStore((state) => state.guardianUser);
  const activeElderId = useAppStore((state) => state.activeElderId);
  const patient = useAppStore(s=>s.demoElders.find(e=>e.id===activeElderId));
  const storeVitals = useAppStore((state) => state.demoVitals[activeElderId]);

  const [vitalsData, setVitalsData] = useState<VitalsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{let cancelled=false;const load=async()=>{if(!activeElderId){setVitalsData([]);setLoading(false);return;}try{const rows=await apiFetch<any[]>('/vitals?elderId='+encodeURIComponent(activeElderId)+'&limit=100');if(!cancelled)setVitalsData(rows.slice().reverse());}catch{if(!cancelled)setVitalsData([]);}finally{if(!cancelled)setLoading(false);}};void load();const t=setInterval(load,5000);return()=>{cancelled=true;clearInterval(t);};},[activeElderId]);

  const chartData = useMemo(() => {
    if (vitalsData.length === 0) return [];
    return getHourlyData(vitalsData, 6).map(r => ({
      time: r.timestamp.split('T')[1]?.substring(0, 5) || '',
      hr: Math.round(r.heart_rate),
      spo2: Math.round(r.spo2 * 10) / 10,
      stress: Math.round(r.stress),
      bp: Math.round(r.systolic_bp),
    }));
  }, [vitalsData]);

  if (loading && !storeVitals) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if(!storeVitals)return <div className="p-6 text-muted-foreground">No readings yet for this patient.</div>;
  const v = storeVitals;
  const motionState = (v?.motion_state as MotionState) || 'sitting';
  const motionInfo = MOTION_LABELS[motionState] || MOTION_LABELS['sitting'];
  const isShivering = Boolean(v?.shiver_detected);
  const isFalling = Boolean(v?.fall_detected);

  const elderName = patient?.full_name || guardianUser?.elderName || 'Registered elder';
  const elderAge = patient ? `${patient.age} years` : 'Not added';
  const elderConditions = patient?.medical_conditions?.join(', ') || 'Not added';
  const elderLanguage = patient?.language_pref || 'Not added';
  const elderPhone = guardianUser?.elderPhone || 'Not added';
  const elderAddress = guardianUser?.elderAddress || 'Not added';
  const vitalsCards = [
    { label: t('guardian.heart_rate'), value: `${Math.round(v.heart_rate)}`, unit: 'bpm', icon: Heart, low: 55, high: 100, current: v.heart_rate },
    { label: t('guardian.blood_pressure'), value: `${Math.round(v.systolic_bp)}/${Math.round(v.diastolic_bp)}`, unit: 'mmHg', icon: Activity, low: 90, high: 140, current: v.systolic_bp },
    { label: 'SpO₂', value: `${v.spo2.toFixed(1)}`, unit: '%', icon: Wind, low: 93, high: 100, current: v.spo2 },
    { label: t('guardian.stress'), value: `${Math.round(v.stress)}`, unit: '/100', icon: Brain, low: 0, high: 70, current: v.stress },
    { label: t('guardian.hydration'), value: `${Math.round(v.hydration)}`, unit: '%', icon: Droplets, low: 50, high: 100, current: v.hydration },
    { label: t('guardian.temperature'), value: `${typeof v.skin_temp === 'number' ? v.skin_temp.toFixed(1) : v.skin_temp}`, unit: '°C', icon: Thermometer, low: 35.5, high: 37.5, current: v.skin_temp },
  ];

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-gw-green animate-pulse-dot" />
        <span className="text-sm font-medium text-foreground">{v.source==='simulator'?'Vitals':v.source==='device'?'Device telemetry':'Recorded vitals'}</span>
      </div>

      {/* Fall Detection Alert */}
      {isFalling && (
        <Card className="rounded-xl border-2 border-destructive bg-destructive/10 animate-pulse">
          <CardContent className="p-4 flex items-center gap-3">
            <Footprints className="h-6 w-6 text-destructive" />
            <div>
              <h3 className="font-bold text-destructive">⚠️ FALL DETECTED</h3>
              <p className="text-sm text-foreground">Sudden impact detected by accelerometer. Verifying with elder...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Motion & Shiver Monitors */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Footprints className="h-4 w-4 text-teal" />
              <span className="text-xs text-muted-foreground font-medium">{t('guardian.motion')}</span>
            </div>
            <span className={`text-lg font-bold ${motionInfo.color}`}>{motionInfo.label}</span>
            <p className="text-xs text-muted-foreground mt-1">Accelerometer + Gyroscope</p>
          </CardContent>
        </Card>
        <Card className={`rounded-xl border ${isShivering ? 'bg-gw-amber/10 border-gw-amber/30' : 'bg-card'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Vibrate className="h-4 w-4 text-gw-purple" />
              <span className="text-xs text-muted-foreground font-medium">{t('guardian.shiver')}</span>
            </div>
            <span className={`text-lg font-bold ${isShivering ? 'text-gw-amber' : 'text-gw-green'}`}>
              {isShivering ? '⚠️ Shivering Detected' : '✅ Normal'}
            </span>
            <p className="text-xs text-muted-foreground mt-1">Micro-tremor analysis</p>
          </CardContent>
        </Card>
      </div>

      {/* Vitals Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {vitalsCards.map((card) => (
          <Card key={card.label} className={`rounded-xl border ${statusBg(card.current, card.low, card.high)} transition-all`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`h-4 w-4 ${statusColor(card.current, card.low, card.high)}`} />
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${statusColor(card.current, card.low, card.high)}`}>{card.value}</span>
                <span className="text-xs text-muted-foreground">{card.unit}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="font-display text-lg text-foreground mb-4">Heart Rate & SpO₂ — Last 6 Hours</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="hr" domain={[50, 110]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="spo2" orientation="right" domain={[90, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                <Line yAxisId="hr" type="monotone" dataKey="hr" stroke="#00B4A6" strokeWidth={2} dot={false} name="Heart Rate" />
                <Line yAxisId="spo2" type="monotone" dataKey="spo2" stroke="#3B82F6" strokeWidth={2} dot={false} name="SpO₂" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="font-display text-lg text-foreground mb-4">Stress & Blood Pressure Trend</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                <Area type="monotone" dataKey="stress" stroke="#6B46C1" fill="#6B46C1" fillOpacity={0.15} strokeWidth={2} name="Stress" />
                <Area type="monotone" dataKey="bp" stroke="#E53E3E" fill="#E53E3E" fillOpacity={0.1} strokeWidth={1.5} name="Systolic BP" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Elder Status */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="font-display text-lg text-foreground mb-3">Elder Status</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Name:</span><span className="font-medium text-foreground">{elderName}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Age:</span><span className="font-medium text-foreground">{elderAge}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Conditions:</span><span className="font-medium text-foreground">{elderConditions}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Language:</span><span className="font-medium text-foreground">{elderLanguage}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Phone:</span><span className="font-medium text-foreground">{elderPhone}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Address:</span><span className="font-medium text-foreground truncate">{elderAddress}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Battery:</span><span className="font-medium text-gw-green">{v.source === 'simulator' && patient ? demoBattery(patient,new Date(v.timestamp || Date.now()).getTime())+'%' : patient?.battery != null ? patient.battery+'%' : 'Not available'}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Steps Today:</span><span className="font-medium text-foreground">{v.source === 'simulator' && patient ? demoReading(patient,new Date(v.timestamp || Date.now()).getTime()).steps.toLocaleString() : 'Not available'}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Last Sync:</span><span className="font-medium text-foreground">{v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : 'Not available'}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeedTab;
