import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  Activity,
  Heart,
  Droplets,
  Zap,
  RotateCcw,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Wind,
  ShieldAlert,
} from 'lucide-react';
import { detectVitalsAnomalies } from '@/lib/anomalyDetector';
import { broadcastGcareMessage } from '@/lib/syncChannel';

interface VitalsAnomalyTriggerProps {
  elderId?: string;
  className?: string;
  compact?: boolean;
}

export const VitalsAnomalyTrigger: React.FC<VitalsAnomalyTriggerProps> = ({
  elderId: propElderId,
  className = '',
  compact = false,
}) => {
  const {
    demoElders,
    activeElderId,
    demoVitals,
    injectVitalsAnomaly,
    stabilizeElderVitals,
    addAlert,
  } = useAppStore();

  const targetId = propElderId || activeElderId || 'elder-1';
  const targetElder = demoElders.find((e) => e.id === targetId) || demoElders[0];
  const currentVitals = demoVitals[targetId];

  const activeAnomalies = currentVitals && targetElder
    ? detectVitalsAnomalies(targetElder, currentVitals)
    : [];

  const handleTrigger = (name: string, overrides: Parameters<typeof injectVitalsAnomaly>[1]) => {
    injectVitalsAnomaly(targetId, overrides);

    if (overrides.systolic_bp && overrides.systolic_bp < 85) {
      const sosAlert = {
        id: `sos-bp-${Date.now()}`,
        elder_id: targetElder.id,
        elder_name: targetElder.full_name,
        type: 'sos' as const,
        severity: 'critical' as const,
        message: `🚨 CRITICAL EMERGENCY — ${targetElder.full_name}'s Blood Pressure dropped dangerously to ${overrides.systolic_bp}/${overrides.diastolic_bp || 48} mmHg (Severe Hypotension / Shock risk). Immediate doctor consultation needed.`,
        location: targetElder.room || 'Sadashivanagar, Bangalore',
        time: new Date().toISOString(),
        resolved: false,
      };
      addAlert(sosAlert);
      broadcastGcareMessage({
        type: 'SOS_TRIGGERED',
        id: sosAlert.id,
        elderId: targetElder.id,
        elderName: targetElder.full_name,
        alert: sosAlert,
        timestamp: Date.now(),
      });
    }

    toast({
      title: `🚨 ${name} — ${targetElder.full_name}`,
      description: `Notified Doctor (Dr. Ramesh Kumar) & Guardian. Automated alerts dispatched.`,
      variant: 'destructive',
    });
  };

  const handleTriggerSOS = () => {
    injectVitalsAnomaly(targetId, {
      panic_detected: true,
      heart_rate: 128,
      spo2: 89,
      stress: 94,
      breathing_rate: 26,
    });

    const sosAlert = {
      id: `sos-${Date.now()}`,
      elder_id: targetElder.id,
      elder_name: targetElder.full_name,
      type: 'sos' as const,
      severity: 'critical' as const,
      message: `🚨 EMERGENCY SOS — ${targetElder.full_name} pressed SOS button! Acute distress & low SpO2. Immediate attention required.`,
      location: targetElder.room || 'Sadashivanagar, Bangalore',
      time: new Date().toISOString(),
      resolved: false,
    };

    addAlert(sosAlert);

    broadcastGcareMessage({
      type: 'SOS_TRIGGERED',
      id: sosAlert.id,
      elderId: targetElder.id,
      elderName: targetElder.full_name,
      alert: sosAlert,
      timestamp: Date.now(),
    });

    toast({
      title: `🚨 Emergency SOS — ${targetElder.full_name}`,
      description: `SOS alert dispatched to Doctor Portal and Guardian. Waiting for doctor acknowledgment.`,
      variant: 'destructive',
    });
  };

  const handleStabilize = () => {
    stabilizeElderVitals(targetId);
    toast({
      title: `✅ Vitals Stabilized — ${targetElder.full_name}`,
      description: `Biometrics returned to personal baseline. Doctor & Guardian updated.`,
    });
  };

  return (
    <Card className={`border border-border/80 bg-card/95 backdrop-blur-sm shadow-sm ${className}`}>
        <CardContent className={compact ? 'p-3' : 'p-4'}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-teal/15 flex items-center justify-center text-teal">
                <Activity className="h-4 w-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Simulate Vitals Fluctuation
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium">
                    ({targetElder?.full_name})
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Trigger biometric spikes or drops to test Guardian & Doctor alert notifications.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {activeAnomalies.length > 0 ? (
                <Badge className="bg-destructive text-primary-foreground text-[10px] animate-pulse flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {activeAnomalies.length} Anomaly Detected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px]">
                  Normal Range
                </Badge>
              )}
            </div>
          </div>

          {/* Trigger Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            {/* Tachycardia */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleTrigger('Tachycardia (HR Spike)', { heart_rate: 135 })}
              className="flex items-center justify-start gap-1.5 text-xs h-9 border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive text-left"
            >
              <ArrowUpRight className="h-3.5 w-3.5 text-destructive shrink-0" />
              <div className="truncate">
                <span className="font-semibold block leading-tight">HR Spike</span>
                <span className="text-[10px] text-muted-foreground">135 bpm</span>
              </div>
            </Button>

            {/* Bradycardia */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleTrigger('Bradycardia (HR Drop)', { heart_rate: 44 })}
              className="flex items-center justify-start gap-1.5 text-xs h-9 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500 text-left"
            >
              <ArrowDownRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <div className="truncate">
                <span className="font-semibold block leading-tight">HR Drop</span>
                <span className="text-[10px] text-muted-foreground">44 bpm</span>
              </div>
            </Button>

            {/* Hypoxemia Drop */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleTrigger('Acute Hypoxemia (SpO2 Drop)', { spo2: 88, breathing_rate: 24 })}
              className="flex items-center justify-start gap-1.5 text-xs h-9 border-sky-500/30 hover:bg-sky-500/10 hover:text-sky-600 hover:border-sky-500 text-left"
            >
              <Droplets className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <div className="truncate">
                <span className="font-semibold block leading-tight">SpO₂ Drop</span>
                <span className="text-[10px] text-muted-foreground">88% (Low)</span>
              </div>
            </Button>

            {/* Hypertensive Surge */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleTrigger('Hypertensive Surge (BP Spike)', { systolic_bp: 168, diastolic_bp: 104 })}
              className="flex items-center justify-start gap-1.5 text-xs h-9 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-600 hover:border-rose-500 text-left"
            >
              <Heart className="h-3.5 w-3.5 text-rose-500 shrink-0" />
              <div className="truncate">
                <span className="font-semibold block leading-tight">BP Surge</span>
                <span className="text-[10px] text-muted-foreground">168/104 mmHg</span>
              </div>
            </Button>

            {/* Low BP Drop / Hypotension */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleTrigger('Hypotension (Low BP Drop)', { systolic_bp: 78, diastolic_bp: 48, heart_rate: 106 })}
              className="flex items-center justify-start gap-1.5 text-xs h-9 border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-600 hover:border-orange-500 text-left"
            >
              <ArrowDownRight className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <div className="truncate">
                <span className="font-semibold block leading-tight">Low BP Drop</span>
                <span className="text-[10px] text-muted-foreground">78/48 mmHg</span>
              </div>
            </Button>

            {/* Panic / High Stress */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleTrigger('Acute Distress & Hyperventilation', { stress: 86, breathing_rate: 28, heart_rate: 118 })}
              className="flex items-center justify-start gap-1.5 text-xs h-9 border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-600 hover:border-purple-500 text-left"
            >
              <Zap className="h-3.5 w-3.5 text-purple-500 shrink-0" />
              <div className="truncate">
                <span className="font-semibold block leading-tight">Stress Panic</span>
                <span className="text-[10px] text-muted-foreground">86/100, 28 brpm</span>
              </div>
            </Button>

            {/* Emergency SOS Panic */}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleTriggerSOS}
              className="flex items-center justify-start gap-1.5 text-xs h-9 bg-red-600 hover:bg-red-700 text-white font-bold text-left shadow-sm active:scale-95"
            >
              <ShieldAlert className="h-3.5 w-3.5 animate-bounce shrink-0 text-white" />
              <div className="truncate">
                <span className="font-bold block leading-tight text-white">Emergency SOS</span>
                <span className="text-[10px] text-red-100">Critical Alert</span>
              </div>
            </Button>

            {/* Stabilize */}
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handleStabilize}
              className="flex items-center justify-center gap-1 text-xs h-9 bg-teal hover:bg-teal/90 text-primary-foreground font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Normalize</span>
            </Button>
          </div>
        </CardContent>
      </Card>
  );
};

export default VitalsAnomalyTrigger;
