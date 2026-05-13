import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store';

export const DemoModeBanner: React.FC = () => {
  const demoMode = useAppStore((s) => s.demoMode);
  const { t } = useTranslation();

  if (!demoMode) return null;

  return (
    <Badge className="bg-teal text-primary-foreground border-0 animate-pulse">
      {t('dashboard.demo_mode')}
    </Badge>
  );
};
