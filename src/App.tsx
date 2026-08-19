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
        heart_rate: 72,
        systolic_bp: 124,
        diastolic_bp: 80,
        spo2: 97,
        stress: 35,
        hydration: 82,
        breathing_rate: 16,
        skin_temp: 36.6,
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <DemoEmergencyManager />
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
