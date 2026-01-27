import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AdminLayout from "./components/layout/AdminLayout";
import Tenants from "./pages/admin/Tenants";
import Modules from "./pages/admin/Modules";
import AuditLogs from "./pages/admin/AuditLogs";
import Volunteers from "./pages/modules/Volunteers";
import Locations from "./pages/modules/Locations";
import CallForPapers from "./pages/modules/CallForPapers";
import Conferences from "./pages/Conferences";
import ConferenceDetail from "./pages/ConferenceDetail";
import Settings from "./pages/admin/Settings";
import ComingSoon from "./pages/modules/ComingSoon";

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

function TenantAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== "super_admin" && user?.role !== "tenant_admin") {
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

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout />
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

        {/* Tenant admin routes */}
        <Route
          path="admin/settings"
          element={
            <TenantAdminRoute>
              <Settings />
            </TenantAdminRoute>
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
              <CallForPapers />
            </ModuleRoute>
          }
        />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
