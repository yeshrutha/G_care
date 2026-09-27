import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShieldAlert,
  HeartPulse,
  Droplets,
  Activity,
  Zap,
  CheckCircle2,
  Stethoscope,
  Users,
  RotateCcw,
  Watch,
  ExternalLink,
} from 'lucide-react';
import { VitalsAnomaly } from '@/lib/anomalyDetector';
import { useAppStore } from '@/store';

interface VitalsAnomalyAlertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anomaly: VitalsAnomaly | null;
  onNormalize?: () => void;
}

export const VitalsAnomalyAlertModal: React.FC<VitalsAnomalyAlertModalProps> = ({
  open,
  onOpenChange,
  anomaly,
  onNormalize,
}) => {
  const navigate = useNavigate();
  const stabilizeElderVitals = useAppStore((s) => s.stabilizeElderVitals);

  if (!anomaly) return null;

  const getMetricIcon = () => {
    switch (anomaly.metric) {
      case 'heart_rate':
        return <HeartPulse className="h-6 w-6 text-red-500 animate-pulse" />;
      case 'spo2':
        return <Droplets className="h-6 w-6 text-sky-500 animate-pulse" />;
      case 'systolic_bp':
      case 'diastolic_bp':
        return <Activity className="h-6 w-6 text-rose-500 animate-pulse" />;
      case 'stress':
      case 'breathing_rate':
        return <Zap className="h-6 w-6 text-purple-500 animate-pulse" />;
      default:
        return <ShieldAlert className="h-6 w-6 text-destructive animate-pulse" />;
    }
  };

  const handleNormalize = () => {
    if (onNormalize) {
      onNormalize();
    } else {
      stabilizeElderVitals(anomaly.elderId);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-2 border-destructive/40 bg-card p-6 shadow-2xl sm:rounded-2xl">
        <DialogHeader className="text-left space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 border border-destructive/20">
                {getMetricIcon()}
              </div>
              <div>
                <DialogTitle className="text-lg font-display text-destructive font-bold flex items-center gap-2">
                  <span>🚨 Physiological Anomaly Alert</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Real-time clinical threshold violation detected from wearable telemetry.
                </DialogDescription>
              </div>
            </div>
            <Badge className={`uppercase text-[10px] font-bold ${
              anomaly.severity === 'critical' ? 'bg-destructive text-primary-foreground' : 'bg-amber-500 text-slate-950'
            }`}>
              {anomaly.severity}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Main Anomaly Summary Card */}
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground text-sm">{anomaly.elderName}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(anomaly.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">{anomaly.title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{anomaly.message}</p>
            {anomaly.clinicalRecommendation && (
              <div className="mt-2 rounded-lg bg-background/80 p-2.5 border border-border/80">
                <p className="text-[11px] font-semibold text-teal flex items-center gap-1 mb-0.5">
                  <Stethoscope className="h-3.5 w-3.5" /> Clinical Guidance:
                </p>
                <p className="text-xs text-foreground/90">{anomaly.clinicalRecommendation}</p>
              </div>
            )}
          </div>

          {/* Delivery Routing Confirmation Status */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-foreground uppercase tracking-wide">
              Automated Alert Routing Status
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Doctor Clinical Portal</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Delivered to Dr. Ramesh Kumar (Cardiology). Patient triage elevated.
                </p>
              </div>

              <div className="rounded-xl border border-teal/30 bg-teal/10 p-3 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-teal">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Guardian Dashboard</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Delivered to Family Guardian. Audio chime & SMS alert dispatched.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              navigate('/doctor');
            }}
            className="text-xs border-teal/40 text-teal hover:bg-teal/10 flex items-center gap-1"
          >
            <Stethoscope className="h-3.5 w-3.5" />
            <span>Open Doctor Portal</span>
            <ExternalLink className="h-3 w-3 ml-0.5" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              navigate('/guardian/dashboard');
            }}
            className="text-xs border-primary/40 text-foreground hover:bg-secondary flex items-center gap-1"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Open Guardian Portal</span>
            <ExternalLink className="h-3 w-3 ml-0.5" />
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleNormalize}
            className="text-xs bg-teal hover:bg-teal/90 text-primary-foreground font-semibold flex items-center gap-1"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Normalize Vitals</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VitalsAnomalyAlertModal;
