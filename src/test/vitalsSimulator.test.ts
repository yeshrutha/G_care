import { describe, it, expect } from 'vitest';
import {
  getElderBaseline,
  simulateNextVitals,
  initializePatientVitals,
  PATIENT_PHYSIOLOGICAL_PROFILES,
} from '@/lib/vitalsSimulator';
import { DEMO_ELDERS } from '@/lib/demoData';
import { useAppStore } from '@/store';

describe('Physiological Vitals Simulation Engine', () => {
  it('loads medically authentic condition-specific baselines for known patients', () => {
    const usha = DEMO_ELDERS.find((e) => e.id === 'elder-1')!;
    const lakshmi = DEMO_ELDERS.find((e) => e.id === 'elder-2')!;
    const venkatesh = DEMO_ELDERS.find((e) => e.id === 'elder-3')!;

    const ushaBase = getElderBaseline(usha);
    const lakshmiBase = getElderBaseline(lakshmi);
    const venkateshBase = getElderBaseline(venkatesh);

    // Usha: Controlled hypertension baseline
    expect(ushaBase.systolic_bp).toBeGreaterThanOrEqual(124);
    expect(ushaBase.systolic_bp).toBeLessThanOrEqual(136);
    expect(ushaBase.spo2).toBeGreaterThanOrEqual(96.0);

    // Lakshmi Devi: Higher resting HR and systolic BP with A-fib
    expect(lakshmiBase.heart_rate).toBeGreaterThanOrEqual(75);
    expect(lakshmiBase.systolic_bp).toBeGreaterThanOrEqual(132);

    // Venkatesh Rao: Chronic COPD resting hypoxemia (91-94%) and tachypnea
    expect(venkateshBase.spo2).toBeLessThanOrEqual(94.0);
    expect(venkateshBase.spo2).toBeGreaterThanOrEqual(91.0);
    expect(venkateshBase.breathing_rate).toBeGreaterThanOrEqual(19);
  });

  it('dynamically infers authentic baselines for custom elders based on conditions', () => {
    const customCopdElder = {
      id: 'elder-custom-1',
      full_name: 'Custom Patient',
      age: 75,
      medical_conditions: ['Chronic Bronchitis', 'Asthma'],
      language_pref: 'en',
    };

    const baseline = getElderBaseline(customCopdElder);
    expect(baseline.spo2).toBeLessThanOrEqual(94.0);
    expect(baseline.breathing_rate).toBeGreaterThanOrEqual(18);
  });

  it('keeps simulated vitals strictly within physiological bounds over 100 consecutive ticks', () => {
    const venkatesh = DEMO_ELDERS.find((e) => e.id === 'elder-3')!;
    let vitals = getElderBaseline(venkatesh);
    const profile = PATIENT_PHYSIOLOGICAL_PROFILES['elder-3'];

    for (let i = 0; i < 100; i++) {
      vitals = simulateNextVitals(vitals, undefined, venkatesh);

      expect(vitals.heart_rate).toBeGreaterThanOrEqual(profile.bounds.hr[0]);
      expect(vitals.heart_rate).toBeLessThanOrEqual(profile.bounds.hr[1]);

      expect(vitals.spo2).toBeGreaterThanOrEqual(profile.bounds.spo2[0]);
      expect(vitals.spo2).toBeLessThanOrEqual(profile.bounds.spo2[1]);

      expect(vitals.systolic_bp).toBeGreaterThanOrEqual(profile.bounds.systolic[0]);
      expect(vitals.systolic_bp).toBeLessThanOrEqual(profile.bounds.systolic[1]);
    }
  });

  it('mean-reverts towards baseline after temporary perturbation', () => {
    const usha = DEMO_ELDERS.find((e) => e.id === 'elder-1')!;
    const base = getElderBaseline(usha);

    // Artificial temporary spike in heart rate to 98 bpm
    let perturbed = { ...base, heart_rate: 98 };

    // Simulate 15 ticks without emergency flag
    for (let i = 0; i < 15; i++) {
      perturbed = simulateNextVitals(perturbed, base, usha);
    }

    // Must have mean-reverted significantly towards baseline (71 bpm)
    expect(perturbed.heart_rate).toBeLessThan(85);
  });

  it('preserves emergency flags and handles critical simulation mode', () => {
    const usha = DEMO_ELDERS.find((e) => e.id === 'elder-1')!;
    const emergencyVitals = {
      ...getElderBaseline(usha),
      fall_detected: true,
      panic_detected: true,
      heart_rate: 118,
      stress: 92,
    };

    const next = simulateNextVitals(emergencyVitals, undefined, usha);
    expect(next.fall_detected).toBe(true);
    expect(next.panic_detected).toBe(true);
    expect(next.heart_rate).toBeGreaterThanOrEqual(105);
  });

  it('initializes and updates live vitals in AppStore', () => {
    useAppStore.setState({
      demoElders: DEMO_ELDERS,
      demoVitals: initializePatientVitals(DEMO_ELDERS),
    });

    const initialVitals = useAppStore.getState().demoVitals['elder-1'];
    expect(initialVitals).toBeDefined();
    expect(initialVitals.heart_rate).toBeGreaterThan(0);

    // Run tick
    useAppStore.getState().updateLiveVitalsTick();

    const updatedVitals = useAppStore.getState().demoVitals['elder-1'];
    expect(updatedVitals).toBeDefined();

    const updatedElders = useAppStore.getState().demoElders;
    expect(updatedElders[0].last_vitals_at).toBeDefined();
  });
});
