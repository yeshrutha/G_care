import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useGuardianStore } from '@/store/guardianStore';
import { Tv, Heart, Pill, Clock, Maximize2, Minimize2, Activity, Volume2 } from 'lucide-react';
import { loadVitalsCSV, getLatestVitals, type VitalsRow } from '@/lib/csvLoader';

const SmartTVTab: React.FC = () => {
  const { smartTvMode, setSmartTvMode, reminders } = useGuardianStore();
  const [liveVitals, setLiveVitals] = useState<VitalsRow | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadVitalsCSV().then(data => setLiveVitals(getLatestVitals(data)));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Simulate vitals update
  useEffect(() => {
    if (!liveVitals) return;
    const interval = setInterval(() => {
      setLiveVitals(prev => prev ? {
        ...prev,
        heart_rate: Math.round(prev.heart_rate + (Math.random() - 0.5) * 3),
        spo2: Math.min(100, Math.round((prev.spo2 + (Math.random() - 0.5) * 0.5) * 10) / 10),
      } : prev);
    }, 4000);
    return () => clearInterval(interval);
  }, [liveVitals !== null]);

  const upcomingReminders = reminders.filter(r => !r.verified).slice(0, 4);

  if (smartTvMode && liveVitals) {
    return (
      <div className="fixed inset-0 z-50 bg-navy p-8 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Tv className="h-8 w-8 text-teal" />
            <span className="font-display text-3xl text-primary-foreground">GuardianWatch</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-4xl font-display text-primary-foreground">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Button variant="ghost" className="text-primary-foreground" onClick={() => setSmartTvMode(false)}>
              <Minimize2 className="h-6 w-6" />
            </Button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-6">
          {/* Vitals Panel */}
          <div className="col-span-2 grid grid-cols-3 gap-4">
            {[
              { label: 'Heart Rate', value: Math.round(liveVitals.heart_rate), unit: 'bpm', color: 'text-teal' },
              { label: 'Blood Pressure', value: `${Math.round(liveVitals.systolic_bp)}/${Math.round(liveVitals.diastolic_bp)}`, unit: 'mmHg', color: 'text-gw-amber' },
              { label: 'SpO₂', value: liveVitals.spo2.toFixed(1), unit: '%', color: 'text-blue-400' },
              { label: 'Stress', value: Math.round(liveVitals.stress), unit: '/100', color: 'text-gw-purple' },
              { label: 'Temperature', value: liveVitals.skin_temp, unit: '°C', color: 'text-gw-amber' },
              { label: 'Hydration', value: Math.round(liveVitals.hydration), unit: '%', color: 'text-teal' },
            ].map(v => (
              <div key={v.label} className="bg-primary-foreground/5 rounded-2xl p-6 border border-primary-foreground/10">
                <p className="text-primary-foreground/60 text-sm mb-2">{v.label}</p>
                <p className={`text-5xl font-bold ${v.color}`}>{v.value}</p>
                <p className="text-primary-foreground/40 text-sm">{v.unit}</p>
              </div>
            ))}
          </div>

          {/* Reminders Panel */}
          <div className="space-y-4">
            <h3 className="text-xl font-display text-primary-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-teal" /> Upcoming
            </h3>
            {upcomingReminders.map(r => (
              <div key={r.id} className="bg-primary-foreground/5 rounded-xl p-4 border border-primary-foreground/10">
                <div className="flex items-center gap-2 mb-1">
                  {r.type === 'medication' ? <Pill className="h-4 w-4 text-teal" /> : <Clock className="h-4 w-4 text-gw-amber" />}
                  <span className="text-primary-foreground font-medium">{r.title}</span>
                </div>
                <p className="text-primary-foreground/60 text-sm">{r.time} • {r.repeat}</p>
              </div>
            ))}
            <div className="bg-gw-green/10 rounded-xl p-4 border border-gw-green/20 mt-4">
              <p className="text-gw-green text-sm font-medium">✓ All systems normal</p>
              <p className="text-primary-foreground/40 text-xs mt-1">Watch connected • Battery 78%</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-xl">
        <CardContent className="p-6 text-center space-y-4">
          <Tv className="h-16 w-16 mx-auto text-teal" />
          <h3 className="font-display text-xl text-foreground">Smart TV Display</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Cast vitals, reminders, and health status to a TV screen for easy monitoring.
            The elder and family members can see real-time health data at a glance.
          </p>
          <Button className="bg-teal hover:bg-teal/90 text-primary-foreground rounded-xl" onClick={() => setSmartTvMode(true)}>
            <Maximize2 className="h-4 w-4 mr-2" /> Launch TV Mode
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="font-display text-lg text-foreground mb-3">TV Display Settings</h3>
          <div className="space-y-3">
            {[
              { label: 'Show vitals on TV', defaultOn: true },
              { label: 'Show medication reminders', defaultOn: true },
              { label: 'Show appointment alerts', defaultOn: true },
              { label: 'Show activity videos', defaultOn: true },
              { label: 'Voice announcements on TV', defaultOn: false },
              { label: 'Emergency alerts full screen', defaultOn: true },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{s.label}</span>
                <Switch defaultChecked={s.defaultOn} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SmartTVTab;
