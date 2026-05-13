import React, { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGuardianStore, type GuardianAlert } from '@/store/guardianStore';
import { triggerAlert } from '@/lib/audioAlerts';
import { ShieldAlert, Pill, Heart, AlertTriangle, MapPin, Volume2, CheckCircle } from 'lucide-react';

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

const AlertsTab: React.FC = () => {
  const { alerts, acknowledgeAlert, addGuardianAlert, guardianUser } = useGuardianStore();
  const elderName = guardianUser?.elderName || 'Registered elder';

  // Simulate incoming alerts for demo
  useEffect(() => {
    const timer1 = setTimeout(() => {
      const newAlert: GuardianAlert = {
        id: `ga-live-${Date.now()}`, type: 'vital_abnormal', severity: 'warning',
        message: 'SpO₂ dropped to 92% — below safe threshold of 93%',
        time: new Date().toISOString(), acknowledged: false, elderName,
      };
      addGuardianAlert(newAlert);
      triggerAlert('vital');
    }, 15000);

    const timer2 = setTimeout(() => {
      const sosAlert: GuardianAlert = {
        id: `ga-sos-${Date.now()}`, type: 'sos', severity: 'critical',
        message: '🚨 EMERGENCY — SOS button pressed on watch. Location: Sadashivanagar, Bangalore',
        time: new Date().toISOString(), acknowledged: false, elderName,
      };
      addGuardianAlert(sosAlert);
      triggerAlert('sos');
    }, 45000);

    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [addGuardianAlert, elderName]);

  const handlePlayAlert = (type: string) => {
    triggerAlert(type === 'medicine_missed' ? 'medicine' : type === 'vital_abnormal' ? 'vital' : type);
  };

  const unresolved = alerts.filter(a => !a.acknowledged);
  const resolved = alerts.filter(a => a.acknowledged);

  return (
    <div className="space-y-6">
      {/* SOS Emergency Panel */}
      {unresolved.some(a => a.type === 'sos') && (
        <Card className="rounded-xl border-2 border-destructive bg-destructive/5 animate-pulse-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-bold text-destructive text-lg">🚨 SOS EMERGENCY ACTIVE</h3>
                <p className="text-sm text-foreground mt-1">
                  {unresolved.find(a => a.type === 'sos')?.message}
                </p>
              </div>
              <Button variant="destructive" className="rounded-xl" onClick={() => {
                const sos = unresolved.find(a => a.type === 'sos');
                if (sos) acknowledgeAlert(sos.id);
              }}>
                Acknowledge
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Alerts */}
      <div>
        <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-gw-amber" />
          Active Alerts ({unresolved.length})
        </h3>
        <div className="space-y-2">
          {unresolved.length === 0 && (
            <Card className="rounded-xl">
              <CardContent className="p-6 text-center text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-gw-green" />
                No active alerts — all clear
              </CardContent>
            </Card>
          )}
          {unresolved.map(alert => (
            <Card key={alert.id} className="rounded-xl border-l-4" style={{
              borderLeftColor: alert.severity === 'critical' ? '#E53E3E' : '#F6AD55',
            }}>
              <CardContent className="p-4 flex items-start gap-3">
                {alertIcon(alert.type)}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground text-sm">{alert.elderName}</span>
                    <Badge className={`text-[10px] ${severityColor(alert.severity)}`}>{alert.severity}</Badge>
                    <Badge variant="outline" className="text-[10px]">{alert.type.replace('_', ' ')}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(alert.time).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handlePlayAlert(alert.type)}>
                    <Volume2 className="h-4 w-4 text-teal" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs rounded-lg" onClick={() => acknowledgeAlert(alert.id)}>
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Resolved Alerts */}
      {resolved.length > 0 && (
        <div>
          <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-gw-green" />
            Resolved ({resolved.length})
          </h3>
          <div className="space-y-2">
            {resolved.map(alert => (
              <Card key={alert.id} className="rounded-xl opacity-60">
                <CardContent className="p-3 flex items-center gap-3">
                  {alertIcon(alert.type)}
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">{new Date(alert.time).toLocaleTimeString()}</p>
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
    </div>
  );
};

export default AlertsTab;
