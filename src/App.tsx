import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewProject from "./pages/NewProject";
import ProjectView from "./pages/ProjectView";

import Signup from "./pages/Signup";
import MfaEnroll from "./pages/MfaEnroll";
import MfaVerify from "./pages/MfaVerify";
import AdminTemplates from "./pages/AdminTemplates";
import AdminTeam from "./pages/AdminTeam";
import AdminExport from "./pages/AdminExport";
import Settings from "./pages/Settings";
import ExpenseReporting from "./pages/ExpenseReporting";
import Invoices from "./pages/Invoices";
import ExpenseSettings from "./pages/ExpenseSettings";
import InvestmentManagement from "./pages/InvestmentManagement";
import InternalDocuments from "./pages/InternalDocuments";
import Vendors from "./pages/Vendors";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import AccessPolicy from "./pages/AccessPolicy";
import SecurityPolicy from "./pages/SecurityPolicy";
import DataRetentionPolicy from "./pages/DataRetentionPolicy";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Eula from "./pages/Eula";
import PlaidOAuthCallback from "./pages/PlaidOAuthCallback";
import QuickBooksCallback from "./pages/QuickBooksCallback";
import { toast } from "sonner";
import { useEffect } from "react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, mfaRequired } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (mfaRequired) return <Navigate to="/mfa-verify" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function InvestmentRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, mfaRequired, investmentAccess } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (mfaRequired) return <Navigate to="/mfa-verify" replace />;
  if (!investmentAccess) {
    return <InvestmentAccessDenied />;
  }
  return <AppLayout>{children}</AppLayout>;
}

function InvestmentAccessDenied() {
  useEffect(() => {
    toast.error("Access Denied: You do not have permission to view Investment Management.");
  }, []);
  return <Navigate to="/dashboard" replace />;
}

function MfaRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/mfa-enroll" element={<MfaRoute><MfaEnroll /></MfaRoute>} />
            <Route path="/mfa-verify" element={<MfaRoute><MfaVerify /></MfaRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/new-project" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
            <Route path="/project/:id" element={<ProtectedRoute><ProjectView /></ProtectedRoute>} />
            
            <Route path="/investments" element={<InvestmentRoute><InvestmentManagement /></InvestmentRoute>} />
            <Route path="/internal-documents" element={<ProtectedRoute><InternalDocuments /></ProtectedRoute>} />
            <Route path="/vendors" element={<ProtectedRoute><Vendors /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><ExpenseReporting /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="/expenses/settings" element={<ProtectedRoute><ExpenseSettings /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin/templates" element={<Navigate to="/settings?tab=templates" replace />} />
            <Route path="/admin/team" element={<Navigate to="/settings?tab=team" replace />} />
            <Route path="/admin-export" element={<MfaRoute><AdminExport /></MfaRoute>} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/access-policy" element={<AccessPolicy />} />
            <Route path="/security-policy" element={<SecurityPolicy />} />
            <Route path="/data-retention-policy" element={<DataRetentionPolicy />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/eula" element={<Eula />} />
            <Route path="/oauth-callback" element={<MfaRoute><PlaidOAuthCallback /></MfaRoute>} />
            <Route path="/quickbooks-callback" element={<MfaRoute><QuickBooksCallback /></MfaRoute>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
