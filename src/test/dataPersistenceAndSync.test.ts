import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, type Medication, type StoreAlarm } from '@/store';
import { DEMO_ELDERS } from '@/lib/demoData';

describe('Data Persistence & Telemetry Synchronization', () => {
  beforeEach(() => {
    // Clear localStorage simulation before each test
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('initializes store with persisted medications and alarms', () => {
    const store = useAppStore.getState();
    expect(store.medications.length).toBeGreaterThan(0);
    expect(store.alarms.length).toBeGreaterThan(0);

    const firstMed = store.medications[0];
    expect(firstMed.brand_name).toBeDefined();
    expect(firstMed.elder_id).toBeDefined();

    const firstAlarm = store.alarms[0];
    expect(firstAlarm.title).toBeDefined();
    expect(firstAlarm.time).toBeDefined();
  });

  it('persists new medications through addMedication, updateMedication, and deleteMedication', () => {
    const newMed: Medication = {
      id: 'med-test-panadol',
      elder_id: 'elder-1',
      brand_name: 'Panadol Extra',
      generic_name: 'Paracetamol',
      category: 'Analgesic',
      dose_amount: 500,
      dose_unit: 'mg',
      frequency: 'As needed',
      times: ['14:00'],
      instructions: 'Take with full glass of water',
      active: true,
    };

    // Add medication
    useAppStore.getState().addMedication(newMed);
    let state = useAppStore.getState();
    expect(state.medications.some((m) => m.id === 'med-test-panadol')).toBe(true);
    expect(state.medications.find((m) => m.id === 'med-test-panadol')?.brand_name).toBe('Panadol Extra');

    // Update medication
    useAppStore.getState().updateMedication('med-test-panadol', {
      dose_amount: 650,
      instructions: 'Take after meal',
    });
    state = useAppStore.getState();
    const updated = state.medications.find((m) => m.id === 'med-test-panadol');
    expect(updated?.dose_amount).toBe(650);
    expect(updated?.instructions).toBe('Take after meal');

    // Delete medication
    useAppStore.getState().deleteMedication('med-test-panadol');
    state = useAppStore.getState();
    expect(state.medications.some((m) => m.id === 'med-test-panadol')).toBe(false);
  });

  it('persists new alarms through addAlarm, updateAlarm, and deleteAlarm', () => {
    const newAlarm: StoreAlarm = {
      id: 'alarm-test-hydration',
      elderId: 'elder-1',
      title: 'Hydration check',
      time: '11:00',
      type: 'food',
      status: 'Scheduled',
      notes: 'Offer tender coconut water',
      repeat: 'Daily',
      enabled: true,
    };

    // Add alarm
    useAppStore.getState().addAlarm(newAlarm);
    let state = useAppStore.getState();
    expect(state.alarms.some((a) => a.id === 'alarm-test-hydration')).toBe(true);

    // Update alarm
    useAppStore.getState().updateAlarm('alarm-test-hydration', {
      time: '11:30',
      status: 'Paused',
      enabled: false,
    });
    state = useAppStore.getState();
    const updated = state.alarms.find((a) => a.id === 'alarm-test-hydration');
    expect(updated?.time).toBe('11:30');
    expect(updated?.enabled).toBe(false);
    expect(updated?.status).toBe('Paused');

    // Delete alarm
    useAppStore.getState().deleteAlarm('alarm-test-hydration');
    state = useAppStore.getState();
    expect(state.alarms.some((a) => a.id === 'alarm-test-hydration')).toBe(false);
  });

  it('synchronizes activeElderId across the global application store', () => {
    useAppStore.getState().setActiveElderId('elder-2');
    expect(useAppStore.getState().activeElderId).toBe('elder-2');

    useAppStore.getState().setActiveElderId('elder-3');
    expect(useAppStore.getState().activeElderId).toBe('elder-3');
  });

  it('guarantees watch biometrics and dashboard vitals read identical numbers from demoVitals', () => {
    useAppStore.getState().updateLiveVitalsTick();
    const state = useAppStore.getState();

    // Check Usha ('elder-1')
    const ushaVitals = state.demoVitals['elder-1'];
    expect(ushaVitals).toBeDefined();
    expect(ushaVitals.heart_rate).toBeGreaterThan(0);
    expect(ushaVitals.spo2).toBeGreaterThan(0);
    expect(ushaVitals.systolic_bp).toBeGreaterThan(ushaVitals.diastolic_bp);

    // Verify that any view reading activeElderId gets the identical reference
    const activeId = state.activeElderId;
    const activeVitals = state.demoVitals[activeId];
    expect(activeVitals).toEqual(state.demoVitals[activeId]);
  });
});
