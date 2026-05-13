import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGuardianStore } from '@/store/guardianStore';
import { triggerAlert } from '@/lib/audioAlerts';
import { ShieldAlert, Phone, MapPin, Clock, Radio, Wifi } from 'lucide-react';

const SOSTab: React.FC = () => {
  const { addGuardianAlert, alerts, guardianUser } = useGuardianStore();
  const [sosActive, setSosActive] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const elderName = guardianUser?.elderName || 'Registered elder';
  const emergencyContacts = guardianUser?.emergencyContacts || [];

  const triggerSOS = () => {
    setSosActive(true);
    setCountdown(5);
    triggerAlert('sos');

    let c = 5;
    const interval = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(interval);
        addGuardianAlert({
          id: `sos-manual-${Date.now()}`,
          type: 'sos',
          severity: 'critical',
          message: '🚨 SOS manually triggered from Guardian Dashboard. Emergency contacts notified.',
          time: new Date().toISOString(),
          acknowledged: false,
          elderName,
        });
      }
    }, 1000);
  };

  const cancelSOS = () => {
    setSosActive(false);
    setCountdown(5);
  };

  const recentSOS = alerts.filter(a => a.type === 'sos').slice(0, 5);

  return (
    <div className="space-y-6">
      {/* SOS Trigger */}
      <Card className="rounded-xl">
        <CardContent className="p-6 text-center space-y-4">
          <h3 className="font-display text-xl text-foreground">Emergency SOS</h3>
          <p className="text-sm text-muted-foreground">
            Press the button to send an immediate emergency alert with GPS location to all emergency contacts.
          </p>

          {!sosActive ? (
            <button
              onClick={triggerSOS}
              className="w-36 h-36 mx-auto rounded-full bg-destructive hover:bg-destructive/90 text-primary-foreground flex flex-col items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
            >
              <ShieldAlert className="h-12 w-12 mb-1" />
              <span className="font-bold text-lg">SOS</span>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="w-36 h-36 mx-auto rounded-full bg-destructive text-primary-foreground flex flex-col items-center justify-center animate-pulse shadow-lg">
                <span className="text-5xl font-bold">{countdown}</span>
                <span className="text-sm">Sending...</span>
              </div>
              <Button variant="outline" className="rounded-xl" onClick={cancelSOS}>
                Cancel SOS
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Watch SOS Status */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
            <Radio className="h-5 w-5 text-teal" /> Watch Emergency Button
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Watch SOS Button</span>
              <Badge className="bg-gw-green text-primary-foreground">Active</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Fall Detection</span>
              <Badge className="bg-gw-green text-primary-foreground">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Panic Detection</span>
              <Badge className="bg-gw-green text-primary-foreground">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Auto-call Emergency</span>
              <Badge variant="outline" className="text-gw-amber border-gw-amber/30">After 30s</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contacts */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
            <Phone className="h-5 w-5 text-teal" /> Emergency Contacts
          </h3>
          <div className="space-y-2">
            {emergencyContacts.length === 0 ? (
              <div className="rounded-xl bg-secondary/50 p-4 text-sm text-muted-foreground">
                No emergency contacts added yet. Use Edit Profile to add family, doctor, or ambulance contacts.
              </div>
            ) : null}
            {emergencyContacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                <div className="w-9 h-9 rounded-full bg-teal/15 flex items-center justify-center text-teal text-sm font-semibold">
                  {c.name[0]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.phone}
                    {c.relation ? ` - ${c.relation}` : ''}
                  </p>
                </div>
                {c.primary && <Badge className="bg-teal text-primary-foreground text-[10px]">Primary</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent SOS Events */}
      {recentSOS.length > 0 && (
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" /> Recent SOS Events
            </h3>
            <div className="space-y-2">
              {recentSOS.map(sos => (
                <div key={sos.id} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-destructive/5">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  <span className="text-foreground flex-1">{sos.message}</span>
                  <span className="text-xs text-muted-foreground">{new Date(sos.time).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SOSTab;
