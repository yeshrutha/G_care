import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore, DemoAlert } from '@/store';
import { ShieldAlert, MapPin, X, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const AlertBanner: React.FC = () => {
  const { t } = useTranslation();
  const alerts = useAppStore((s) => s.activeAlerts);
  const resolveAlert = useAppStore((s) => s.resolveAlert);

  const criticalAlerts = alerts.filter(a => !a.resolved && (a.type === 'sos' || a.type === 'fall' || a.type === 'panic'));

  if (criticalAlerts.length === 0) return null;

  const alert = criticalAlerts[0];

  return (
    <div className="bg-gw-red text-primary-foreground p-4 rounded-xl animate-pulse-border">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-6 w-6 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-lg">🚨 {t('dashboard.emergency_title')}</h3>
          <p className="text-sm opacity-90 mt-1">{alert.message}</p>
          {alert.location && (
            <p className="text-sm opacity-80 flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5" /> {alert.location}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="secondary" className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0">
              <Phone className="h-3.5 w-3.5 mr-1" /> {t('dashboard.call_contacts')}
            </Button>
            <Button size="sm" variant="secondary" className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0"
              onClick={() => resolveAlert(alert.id)}>
              <X className="h-3.5 w-3.5 mr-1" /> {t('dashboard.dismiss')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
