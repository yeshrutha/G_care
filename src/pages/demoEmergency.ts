export const DEMO_ELDER_NAME = 'Usha';

export const DEMO_DOCTOR_NAME = 'Dr. Ramesh Kumar';

export const DEMO_HOSPITAL_NAME = 'Apollo Hospitals';

export const DEMO_EMERGENCY_STORAGE_KEY =
  'gcare_demo_emergency_event';

export type DemoEmergencyStatus =
  | 'active'
  | 'appointment_requested'
  | 'appointment_confirmed'
  | 'resolved';

export interface DemoEmergencyEvent {
  id: string;
  elderName: string;
  eventType: 'fall' | 'sos' | 'fall_sos';
  severity: 'critical';
  message: string;
  location: string;
  heartRate: number;
  spo2: number;
  detectedAt: string;
  doctorName: string;
  hospitalName: string;
  appointmentStatus:
    | 'not_requested'
    | 'requested'
    | 'confirmed';
  status: DemoEmergencyStatus;
}

export function createDemoEmergencyEvent(): DemoEmergencyEvent {
  return {
    id: `demo-sos-${Date.now()}`,

    elderName: DEMO_ELDER_NAME,

    eventType: 'fall_sos',

    severity: 'critical',

    message:
      '🚨 Emergency — Fall detected and SOS activated for Usha.',

    location:
      'Sadashivanagar, Bangalore',

    heartRate: 118,

    spo2: 91,

    detectedAt:
      new Date().toISOString(),

    doctorName:
      DEMO_DOCTOR_NAME,

    hospitalName:
      DEMO_HOSPITAL_NAME,

    appointmentStatus:
      'requested',

    status:
      'appointment_requested',
  };
}

export function saveDemoEmergency(
  event: DemoEmergencyEvent,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    DEMO_EMERGENCY_STORAGE_KEY,
    JSON.stringify(event),
  );

  /*
   * Same-tab event.
   *
   * StorageEvent normally fires in OTHER tabs,
   * not the tab that performed setItem().
   */
  window.dispatchEvent(
    new CustomEvent(
      DEMO_EMERGENCY_STORAGE_KEY,
      {
        detail: event,
      },
    ),
  );
}

export function getDemoEmergency():
  | DemoEmergencyEvent
  | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw =
    window.localStorage.getItem(
      DEMO_EMERGENCY_STORAGE_KEY,
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(
      raw,
    ) as DemoEmergencyEvent;
  } catch {
    return null;
  }
}

export function updateDemoEmergency(
  updates: Partial<DemoEmergencyEvent>,
) {
  const current =
    getDemoEmergency();

  if (!current) {
    return null;
  }

  const next = {
    ...current,
    ...updates,
  };

  saveDemoEmergency(next);

  return next;
}

export function clearDemoEmergency() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(
    DEMO_EMERGENCY_STORAGE_KEY,
  );

  window.dispatchEvent(
    new CustomEvent(
      DEMO_EMERGENCY_STORAGE_KEY,
      {
        detail: null,
      },
    ),
  );
}

export function subscribeToDemoEmergency(
  callback: (
    event:
      | DemoEmergencyEvent
      | null,
  ) => void,
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (
    event: StorageEvent,
  ) => {
    if (
      event.key !==
      DEMO_EMERGENCY_STORAGE_KEY
    ) {
      return;
    }

    callback(
      getDemoEmergency(),
    );
  };

  const handleCustomEvent = (
    event: Event,
  ) => {
    const customEvent =
      event as CustomEvent<
        DemoEmergencyEvent | null
      >;

    callback(
      customEvent.detail ??
        getDemoEmergency(),
    );
  };

  window.addEventListener(
    'storage',
    handleStorage,
  );

  window.addEventListener(
    DEMO_EMERGENCY_STORAGE_KEY,
    handleCustomEvent,
  );

  return () => {
    window.removeEventListener(
      'storage',
      handleStorage,
    );

    window.removeEventListener(
      DEMO_EMERGENCY_STORAGE_KEY,
      handleCustomEvent,
    );
  };
}