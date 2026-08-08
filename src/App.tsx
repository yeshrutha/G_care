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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
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
