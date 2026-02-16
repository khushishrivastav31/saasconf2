import { Routes, Route, Navigate, useSearchParams, useParams } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AdminLayout from "./components/layout/AdminLayout";
import Tenants from "./pages/admin/Tenants";
import Modules from "./pages/admin/Modules";
import AuditLogs from "./pages/admin/AuditLogs";
import Settings from "./pages/admin/Settings";
import Volunteers from "./pages/modules/Volunteers";
import Locations from "./pages/modules/Locations";
import CallForPapers from "./pages/modules/CallForPapers";
import {
  CFPLayout,
  CFPTopics,
  CFPProgramCommittee,
  CFPApplicants,
  CFPPapers,
  CFPEvaluatedPapers,
  CFPSelectedPapers,
  CFPAssignments,
} from "./pages/modules/cfp";
import Conferences from "./pages/Conferences";
import ConferenceDetail from "./pages/ConferenceDetail";
import ComingSoon from "./pages/modules/ComingSoon";
import Team from "./pages/Team";
import MyCompany from "./pages/MyCompany";
import ApplicantActivityLog from "./pages/ApplicantActivityLog";

// Portal (public-facing CFP applicant pages)
import { ApplicantAuthProvider } from "./contexts/ApplicantAuthContext";
import LoginPage from "./pages/portal/LoginPage";
import RegisterPage from "./pages/portal/RegisterPage";
import VerifyEmailPage from "./pages/portal/VerifyEmailPage";
import PortalLayout from "./pages/portal/PortalLayout";
import DashboardPage from "./pages/portal/DashboardPage";
import SubmitPaperPage from "./pages/portal/SubmitPaperPage";
import PaperDetailPage from "./pages/portal/PaperDetailPage";
import ProfilePage from "./pages/portal/ProfilePage";
import InvitationsPage from "./pages/portal/InvitationsPage";
import AssignedPapersTab from "./pages/portal/AssignedPapersTab";
import EvaluatedPapersTab from "./pages/portal/EvaluatedPapersTab";
import InfoPage from "./pages/portal/InfoPage";
import MessagesPage from "./pages/portal/MessagesPage";
import NewsPage from "./pages/portal/NewsPage";
import LandingPage from "./pages/portal/LandingPage";
import ErrorBoundary from "./components/common/ErrorBoundary";

function LegacyVerifyEmailRedirect() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const slug = tenantSlug || "";
  const target = token
    ? `/${slug}/portal/user/verify-email?token=${token}`
    : `/${slug}/portal/user/verify-email`;
  return <Navigate to={target} replace />;
}

function LegacyLoginRedirect() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return <Navigate to={`/${tenantSlug}/portal/user/login`} replace />;
}

function LegacyRegisterRedirect() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return <Navigate to={`/${tenantSlug}/portal/user/register`} replace />;
}

function LegacyCFPPortalRedirect() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return <Navigate to={`/${tenantSlug}/portal/news`} replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function ModuleRoute({
  children,
  moduleCode,
}: {
  children: React.ReactNode;
  moduleCode: string;
}) {
  const { user } = useAuth();

  // Super admin has access to all modules
  if (user?.role === "super_admin") {
    return <>{children}</>;
  }

  // Check if user has the module assigned
  if (!user?.modules?.includes(moduleCode)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function TenantAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== "tenant_admin" && user?.role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function TenantOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Only tenant_admin, not super_admin (super admins use /admin/tenants)
  if (user?.role !== "tenant_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <AdminLayout />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />

        {/* Admin routes */}
        <Route
          path="admin/tenants"
          element={
            <AdminRoute>
              <Tenants />
            </AdminRoute>
          }
        />
        <Route
          path="admin/modules"
          element={
            <AdminRoute>
              <Modules />
            </AdminRoute>
          }
        />
        <Route
          path="admin/audit-logs"
          element={
            <AdminRoute>
              <AuditLogs />
            </AdminRoute>
          }
        />
        <Route
          path="admin/settings"
          element={
            <AdminRoute>
              <Settings />
            </AdminRoute>
          }
        />

        {/* My Company (tenant admin only) */}
        <Route
          path="my-company"
          element={
            <TenantOnlyRoute>
              <MyCompany />
            </TenantOnlyRoute>
          }
        />

        {/* Team management (tenant admin) */}
        <Route
          path="team"
          element={
            <TenantAdminRoute>
              <Team />
            </TenantAdminRoute>
          }
        />

        {/* Applicant Activity Log (tenant admin only) */}
        <Route
          path="applicant-activity"
          element={
            <TenantOnlyRoute>
              <ApplicantActivityLog />
            </TenantOnlyRoute>
          }
        />

        {/* Module routes */}
        <Route
          path="modules/conferences"
          element={
            <ModuleRoute moduleCode="conferences">
              <Conferences />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/conferences/:conferenceId"
          element={
            <ModuleRoute moduleCode="conferences">
              <ConferenceDetail />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/volunteers"
          element={
            <ModuleRoute moduleCode="volunteers">
              <Volunteers />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/locations"
          element={
            <ModuleRoute moduleCode="locations">
              <Locations />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/cfp"
          element={
            <ModuleRoute moduleCode="cfp">
              <CFPLayout />
            </ModuleRoute>
          }
        >
          <Route index element={<CallForPapers />} />
          <Route path="topics" element={<CFPTopics />} />
          <Route path="program-committee" element={<CFPProgramCommittee />} />
          <Route path="applicants" element={<CFPApplicants />} />
          <Route path="papers" element={<CFPPapers />} />
          <Route path="evaluated-papers" element={<CFPEvaluatedPapers />} />
          <Route path="accepted-papers" element={<CFPSelectedPapers filter="accepted" />} />
          <Route path="rejected-papers" element={<CFPSelectedPapers filter="rejected" />} />
          <Route path="assignments" element={<CFPAssignments />} />
        </Route>
        <Route
          path="modules/sessions"
          element={
            <ModuleRoute moduleCode="sessions">
              <ComingSoon moduleName="Session Management" />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/speakers"
          element={
            <ModuleRoute moduleCode="speakers">
              <ComingSoon moduleName="Speaker Management" />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/attendees"
          element={
            <ModuleRoute moduleCode="attendees">
              <ComingSoon moduleName="Attendee Management" />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/sponsors"
          element={
            <ModuleRoute moduleCode="sponsors">
              <ComingSoon moduleName="Sponsor Management" />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/analytics"
          element={
            <ModuleRoute moduleCode="analytics">
              <ComingSoon moduleName="Analytics & Reports" />
            </ModuleRoute>
          }
        />
        <Route
          path="modules/service-providers"
          element={
            <ModuleRoute moduleCode="service_providers">
              <ComingSoon moduleName="Service Provider Management" />
            </ModuleRoute>
          }
        />
      </Route>

      {/* CFP Applicant Portal — public routes */}
      <Route
        path=":companySlug/portal/user/login"
        element={
          <ApplicantAuthProvider>
            <LoginPage />
          </ApplicantAuthProvider>
        }
      />
      <Route
        path=":companySlug/portal/user/register"
        element={
          <ApplicantAuthProvider>
            <RegisterPage />
          </ApplicantAuthProvider>
        }
      />
      <Route
        path=":companySlug/portal/user/verify-email"
        element={<VerifyEmailPage />}
      />

      {/* CFP Landing Page — public route */}
      <Route
        path=":tenantSlug/portal/:abbreviation"
        element={<LandingPage />}
      />

      {/* CFP Applicant Portal — authenticated routes */}
      <Route
        path=":companySlug/portal"
        element={
          <ApplicantAuthProvider>
            <ErrorBoundary>
              <PortalLayout />
            </ErrorBoundary>
          </ApplicantAuthProvider>
        }
      >
        <Route index element={<Navigate to="news" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="papers/new" element={<SubmitPaperPage />} />
        <Route path="papers/:paperId" element={<PaperDetailPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="invitations" element={<InvitationsPage />} />
        <Route path="assigned-papers" element={<AssignedPapersTab />} />
        <Route path="evaluated-papers" element={<EvaluatedPapersTab />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="info/:conferenceId" element={<InfoPage />} />
      </Route>

      {/* Legacy redirects for old URLs / emailed links */}
      <Route path="cfp/:tenantSlug/:abbreviation/login" element={<LegacyLoginRedirect />} />
      <Route path="cfp/:tenantSlug/:abbreviation/register" element={<LegacyRegisterRedirect />} />
      <Route path="cfp/:tenantSlug/verify-email" element={<LegacyVerifyEmailRedirect />} />
      <Route path="cfp/:tenantSlug/portal/*" element={<LegacyCFPPortalRedirect />} />
      <Route path="cfp/:tenantSlug/:abbreviation" element={<LegacyLoginRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
