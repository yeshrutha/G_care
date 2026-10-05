import { describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { DEMO_ELDERS, DEMO_VITALS } from '@/lib/demoData';
import { processVitalsTickWithAlerts } from '@/lib/anomalyDetector';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(() => Promise.resolve(null)), getStoredToken: () => null, getStoredUser: () => null }));
vi.mock('@/lib/audioAlerts', () => ({ triggerAlert: vi.fn() }));

describe('Fresh application alert initialization', () => {
  it('initializes Guardian alerts and generates a synchronized episode without test-specific store resets', () => {
    expect(useGuardianStore.getState().alerts).toBeInstanceOf(Array);
    expect(useGuardianStore.getState().alerts.every(a => a.acknowledged)).toBe(true);
    processVitalsTickWithAlerts(DEMO_ELDERS[2], { ...DEMO_VITALS['elder-3'], spo2: 92 });
    const app = useAppStore.getState().activeAlerts.find(a => !a.resolved)!;
    const guardian = useGuardianStore.getState().alerts.find(a => !a.acknowledged)!;
    expect(guardian.id).toBe(app.id);
    expect(useAppStore.getState().activeAlerts.filter(a => a.type === 'appointment')).toHaveLength(3);
  });
});
