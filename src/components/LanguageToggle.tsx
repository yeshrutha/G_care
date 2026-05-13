import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/store';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'ta', label: 'தமிழ்' },
];

export const LanguageToggle: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { i18n } = useTranslation();
  const setLanguage = useAppStore((s) => s.setLanguage);

  const handleChange = (val: string) => {
    i18n.changeLanguage(val);
    setLanguage(val);
  };

  return (
    <Select value={i18n.language} onValueChange={handleChange}>
      <SelectTrigger className={compact ? 'w-[80px] h-8 text-xs' : 'w-[120px]'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGS.map((l) => (
          <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
