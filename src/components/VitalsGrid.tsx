import React from 'react';
import { useTranslation } from 'react-i18next';
import { DemoVitals } from '@/store';
import { Heart, Droplets, Wind, Thermometer, Activity, Brain, Waves, AlertTriangle } from 'lucide-react';

interface Props {
  vitals: DemoVitals;
  compact?: boolean;
}

const getStatus = (val: number, min: number, max: number): 'normal' | 'elevated' | 'critical' => {
  if (val >= min && val <= max) return 'normal';
  if (val < min * 0.85 || val > max * 1.15) return 'critical';
  return 'elevated';
};

const statusColor = {
  normal: 'bg-gw-green',
  elevated: 'bg-gw-amber',
  critical: 'bg-gw-red',
};

export const VitalsGrid: React.FC<Props> = React.memo(({ vitals, compact }) => {
  const { t } = useTranslation();

  const metrics = [
    { label: t('vitals.hr'), value: vitals.heart_rate, unit: t('vitals.bpm'), icon: Heart, status: getStatus(vitals.heart_rate, 55, 90) },
    { label: t('vitals.bp'), value: `${vitals.systolic_bp}/${vitals.diastolic_bp}`, unit: t('vitals.mmhg'), icon: Activity, status: getStatus(vitals.systolic_bp, 90, 140) },
    { label: t('vitals.spo2'), value: vitals.spo2, unit: t('vitals.percent'), icon: Wind, status: getStatus(vitals.spo2, 94, 100) },
    { label: t('vitals.stress'), value: vitals.stress, unit: '/100', icon: Brain, status: getStatus(100 - vitals.stress, 40, 100) },
    { label: t('vitals.hydration'), value: vitals.hydration, unit: t('vitals.percent'), icon: Droplets, status: getStatus(vitals.hydration, 60, 100) },
    { label: t('vitals.breathing'), value: vitals.breathing_rate, unit: t('vitals.brpm'), icon: Waves, status: getStatus(vitals.breathing_rate, 12, 20) },
    { label: t('vitals.temp'), value: vitals.skin_temp, unit: t('vitals.celsius'), icon: Thermometer, status: getStatus(vitals.skin_temp, 35.5, 37.5) },
    { label: t('vitals.shiver'), value: vitals.shiver_detected ? '⚠️' : '—', unit: '', icon: AlertTriangle, status: vitals.shiver_detected ? 'critical' as const : 'normal' as const },
  ];

  if (compact) {
    return (
      <div className="flex flex-wrap gap-3">
        {metrics.slice(0, 6).map((m, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <div className={`w-1.5 h-1.5 rounded-full ${statusColor[m.status]}`} />
            <m.icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-foreground font-medium">{m.value}</span>
            <span className="text-muted-foreground">{m.unit}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {metrics.map((m, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <m.icon className="h-3.5 w-3.5 text-teal" />
              <span className="text-xs text-muted-foreground">{m.label}</span>
            </div>
            <div className={`w-2 h-2 rounded-full ${statusColor[m.status]}`} />
          </div>
          <div className="text-xl font-semibold text-foreground">{m.value}<span className="text-xs text-muted-foreground ml-1">{m.unit}</span></div>
        </div>
      ))}
    </div>
  );
});

VitalsGrid.displayName = 'VitalsGrid';
