import { useAuthStore } from "./store/authStore";
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
const AccessReview = React.lazy(() => import("./pages/AccessReview"));
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
import { apiFetch, getStoredToken } from "./lib/api";
import { hydrateAlertRecords } from "./lib/anomalyDetector";

const DemoEmergencyManager = () => {
  const signedInUser = useAuthStore(s => s.user);
  const demoMode = useAppStore((s) => s.demoMode);

  React.useEffect(() => {
    if (!signedInUser || signedInUser.accessStatus !== 'demo' || !demoMode) {
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
        motion_state: 'sitting',
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
  }, [demoMode, signedInUser]);

  return null;
};

const LiveVitalsSimulatorRunner = () => {
 const signedInUser=useAuthStore(s=>s.user);
 React.useEffect(()=>{
  if(!signedInUser)return;let cancelled=false;let active=false;
  const cycle=async()=>{if(active)return;active=true;try{
   const data=await apiFetch<any>('/dashboard-data');
   if(cancelled||useAuthStore.getState().user?.id!==signedInUser.id)return;
   const elders=Array.isArray(data.elders)?data.elders:[];const ids=elders.map((e:any)=>e.id);
   const state=useAppStore.getState();
   useAppStore.setState({demoElders:elders,demoVitals:Object.fromEntries(Object.entries(data.vitals||{}).filter(([id])=>ids.includes(id))),activeElderId:ids.includes(state.activeElderId)?state.activeElderId:(ids[0]||'')});
   hydrateAlertRecords(data.alerts||[]);
   if(signedInUser.accessStatus==='demo'&&state.simulationEnabled)state.updateLiveVitalsTick();
  }catch{}finally{active=false;}};
  void cycle();const timer=setInterval(cycle,3000);return()=>{cancelled=true;clearInterval(timer);};
 },[signedInUser?.id]);
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
            <Route path="/access-review" element={<ProtectedRoute allowedRoles={["doctor"]}><AccessReview /></ProtectedRoute>} />
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
