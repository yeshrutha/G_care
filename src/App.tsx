import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import React, { Suspense } from "react";

const Landing = React.lazy(() => import("./pages/Landing"));
const Login = React.lazy(() => import("./pages/Login"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const ElderDetail = React.lazy(() => import("./pages/ElderDetail"));
const DoctorPortal = React.lazy(() => import("./pages/DoctorPortal"));
const Settings = React.lazy(() => import("./pages/Settings"));
const GuardianLogin = React.lazy(() => import("./pages/GuardianLogin"));
const GuardianDashboard = React.lazy(() => import("./pages/GuardianDashboard"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const Loader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
  </div>
);

import { useAppStore } from "./store";
import { getDemoEmergency, createDemoEmergencyEvent, saveDemoEmergency, clearDemoEmergency } from "./pages/demoEmergency";
import { apiFetch } from "./lib/api";

const DemoEmergencyManager = () => {
  const demoMode = useAppStore((s) => s.demoMode);

  React.useEffect(() => {
    if (!demoMode) {
      const current = getDemoEmergency();
      if (current) {
        clearDemoEmergency();
      }

      // Cleanup demo alerts from store
      const currentAlerts = useAppStore.getState().activeAlerts;
      if (currentAlerts.some(a => a.id === 'demo-sos-usha')) {
        useAppStore.getState().setActiveAlerts(
          currentAlerts.filter(a => a.id !== 'demo-sos-usha')
        );
      }

      // Reset Usha's vitals
      useAppStore.getState().setDemoVitals('elder-1', {
        heart_rate: 71,
        systolic_bp: 128,
        diastolic_bp: 82,
        spo2: 97.4,
        stress: 34,
        hydration: 72,
        breathing_rate: 16,
        skin_temp: 36.5,
        shiver_detected: false,
        panic_detected: false,
        fall_detected: false,
      });

      useAppStore.getState().setDemoStep(0);
      return;
    }

    const current = getDemoEmergency();
    if (!current) {
      const timer = setTimeout(() => {
        if (!getDemoEmergency()) {
          const detectedAt = new Date().toISOString();
          const emergency = {
            id: 'demo-sos-usha',
            elderName: 'Usha',
            eventType: 'fall_sos' as const,
            severity: 'critical' as const,
            status: 'appointment_requested' as const,
            message: '🚨 EMERGENCY — Fall detected and SOS activated for Usha.',
            location: 'Sadashivanagar, Bangalore',
            heartRate: 118,
            spo2: 91,
            detectedAt,
            doctorName: 'Dr. Ramesh Kumar',
            hospitalName: 'Apollo Hospitals',
            appointmentStatus: 'requested' as const,
          };
          saveDemoEmergency(emergency);

          // Add emergency alert to AppStore
          useAppStore.getState().addAlert({
            id: emergency.id,
            elder_name: emergency.elderName,
            type: 'sos',
            severity: 'critical',
            message: emergency.message,
            location: emergency.location,
            time: emergency.detectedAt,
            resolved: false,
          });

          // Set Usha's vitals to critical
          useAppStore.getState().setDemoVitals('elder-1', {
            heart_rate: emergency.heartRate,
            systolic_bp: 145,
            diastolic_bp: 92,
            spo2: emergency.spo2,
            stress: 90,
            hydration: 55,
            breathing_rate: 24,
            skin_temp: 36.8,
            shiver_detected: false,
            panic_detected: true,
            fall_detected: true,
          });

          useAppStore.getState().setDemoStep(5);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [demoMode]);

  return null;
};

const LiveVitalsSimulatorRunner = () => {
  const simulationEnabled = useAppStore((s) => s.simulationEnabled);
  const updateLiveVitalsTick = useAppStore((s) => s.updateLiveVitalsTick);
  const setDemoVitals = useAppStore((s) => s.setDemoVitals);

  React.useEffect(() => {
    if (!simulationEnabled) return;

    let lastDeviceTimestamp: string | null = null;

    const runCycle = async () => {
      // 1. Check for incoming hardware telemetry from Render
      try {
        const result = await apiFetch<{ ok: boolean; latest?: any }>('/device/vitals?elderId=elder-1');
        if (result?.latest && result.latest.timestamp && result.latest.timestamp !== lastDeviceTimestamp) {
          const recordedAt = new Date(result.latest.timestamp).getTime();
          // If recorded recently from physical device
          if (Date.now() - recordedAt < 60000 && result.latest.source === 'device') {
            lastDeviceTimestamp = result.latest.timestamp;
            const l = result.latest;
            setDemoVitals(l.elderId || 'elder-1', {
              heart_rate: Number(l.heart_rate),
              systolic_bp: Number(l.systolic_bp || 120),
              diastolic_bp: Number(l.diastolic_bp || 80),
              spo2: Number(l.spo2),
              stress: Number(l.stress || 20),
              hydration: Number(l.hydration || 80),
              breathing_rate: Number(l.breathing_rate || 16),
              skin_temp: Number(l.skin_temp || 36.6),
              shiver_detected: Boolean(l.shiver_detected),
              panic_detected: Boolean(l.panic_detected),
              fall_detected: Boolean(l.fall_detected),
            });
            return;
          }
        }
      } catch {
        // Backend offline or sleeping; fallback seamlessly
      }

      // 2. Synchronized cross-tab tick
      updateLiveVitalsTick();
    };

    runCycle();

    const interval = setInterval(() => {
      runCycle();
    }, 4000);

    return () => clearInterval(interval);
  }, [simulationEnabled, updateLiveVitalsTick, setDemoVitals]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <DemoEmergencyManager />
        <LiveVitalsSimulatorRunner />
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["caretaker"]}><Dashboard /></ProtectedRoute>} />
            <Route path="/elder/:id" element={<ProtectedRoute allowedRoles={["caretaker", "doctor"]}><ElderDetail /></ProtectedRoute>} />
            <Route path="/doctor" element={<ProtectedRoute allowedRoles={["doctor"]}><DoctorPortal /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute allowedRoles={["caretaker", "guardian", "doctor"]}><Settings /></ProtectedRoute>} />
            <Route path="/guardian" element={<GuardianLogin />} />
            <Route path="/guardian/dashboard" element={<ProtectedRoute allowedRoles={["guardian"]}><GuardianDashboard /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
