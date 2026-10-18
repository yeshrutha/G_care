import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VitalsGrid } from '@/components/VitalsGrid';
import { DEMO_VITALS } from '@/lib/demoData';
import { getMonthlyAverages, getWeeklyAverages, type VitalsRow } from '@/lib/csvLoader';

describe('unavailable oxygen', () => {
  it('renders unavailable and measured oxygen without a false critical status', () => {
    const vitals = { ...DEMO_VITALS['elder-1'], spo2: null };
    const unavailable = renderToStaticMarkup(<VitalsGrid vitals={vitals} />);
    expect(unavailable).toContain('Not available');
    expect(unavailable).toContain('bg-muted-foreground');
    const measured = renderToStaticMarkup(<VitalsGrid vitals={{ ...vitals, spo2: 97 }} />);
    expect(measured).not.toContain('Not available');
    expect(measured).toContain('>97<');
  });

  it('excludes unavailable readings from oxygen averages', () => {
    const row = { ...DEMO_VITALS['elder-1'], timestamp: '2026-10-18T10:00:00Z', steps: 0 } as VitalsRow;
    const data = [{ ...row, spo2: 96 }, { ...row, spo2: null }, { ...row, spo2: 98 }];
    expect(getMonthlyAverages(data)?.avg_spo2).toBe(97);
    expect(getWeeklyAverages(data)['2026-10-18'].avg_spo2).toBe(97);
    expect(getMonthlyAverages([{ ...row, spo2: null }])?.avg_spo2).toBeNull();
    expect(getWeeklyAverages([{ ...row, spo2: null }])['2026-10-18'].avg_spo2).toBeNull();
  });
});
