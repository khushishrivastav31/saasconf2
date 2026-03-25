import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useSearchParams, useParams } from 'react-router';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const SetupPassword = lazy(() => import('./pages/SetupPassword'));
import AdminLayout from './components/layout/AdminLayout';
import ErrorBoundary from './components/common/ErrorBoundary';

// Lazy-loaded admin pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tenants = lazy(() => import('./pages/admin/Tenants'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Locations = lazy(() => import('./pages/modules/Locations'));
const CallForPapers = lazy(() => import('./pages/modules/CallForPapers'));
const Conferences = lazy(() => import('./pages/Conferences'));
const ConferenceDetail = lazy(() => import('./pages/ConferenceDetail'));
const ComingSoon = lazy(() => import('./pages/modules/ComingSoon'));
const Trainings = lazy(() => import('./pages/Trainings'));
const Team = lazy(() => import('./pages/Team'));
const MyCompany = lazy(() => import('./pages/MyCompany'));
const ApplicantActivityLog = lazy(() => import('./pages/ApplicantActivityLog'));
const TenantPronounOptions = lazy(() => import('./pages/TenantPronounOptions'));
const Handbook = lazy(() => import('./pages/Handbook'));

// Lazy-loaded CFP module pages
const CFPLayout = lazy(() => import('./pages/modules/cfp').then((m) => ({ default: m.CFPLayout })));
const CFPTopics = lazy(() => import('./pages/modules/cfp').then((m) => ({ default: m.CFPTopics })));
const CFPProgramCommittee = lazy(() =>
  import('./pages/modules/cfp').then((m) => ({ default: m.CFPProgramCommittee }))
);
const CFPApplicants = lazy(() =>
  import('./pages/modules/cfp').then((m) => ({ default: m.CFPApplicants }))
);
const CFPPapers = lazy(() => import('./pages/modules/cfp').then((m) => ({ default: m.CFPPapers })));
const CFPEvaluatedPapers = lazy(() =>
  import('./pages/modules/cfp').then((m) => ({ default: m.CFPEvaluatedPapers }))
);
const CFPSelectedPapers = lazy(() =>
  import('./pages/modules/cfp').then((m) => ({ default: m.CFPSelectedPapers }))
);
const CFPAssignments = lazy(() =>
  import('./pages/modules/cfp').then((m) => ({ default: m.CFPAssignments }))
);

// Lazy-loaded portal pages
import { ApplicantAuthProvider } from './contexts/ApplicantAuthContext';
const LoginPage = lazy(() => import('./pages/portal/LoginPage'));
const RegisterPage = lazy(() => import('./pages/portal/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/portal/VerifyEmailPage'));
const PortalLayout = lazy(() => import('./pages/portal/PortalLayout'));
const DashboardPage = lazy(() => import('./pages/portal/DashboardPage'));
const SubmitPaperPage = lazy(() => import('./pages/portal/SubmitPaperPage'));
const PaperDetailPage = lazy(() => import('./pages/portal/PaperDetailPage'));
const ProfilePage = lazy(() => import('./pages/portal/ProfilePage'));
const InvitationsPage = lazy(() => import('./pages/portal/InvitationsPage'));
const AssignedPapersTab = lazy(() => import('./pages/portal/AssignedPapersTab'));
const EvaluatedPapersTab = lazy(() => import('./pages/portal/EvaluatedPapersTab'));
const InfoPage = lazy(() => import('./pages/portal/InfoPage'));
const MessagesPage = lazy(() => import('./pages/portal/MessagesPage'));
const NewsPage = lazy(() => import('./pages/portal/NewsPage'));
const LandingPage = lazy(() => import('./pages/portal/LandingPage'));
const AuthenticatedRegistrationPage = lazy(
  () => import('./pages/portal/AuthenticatedRegistrationPage')
);
const MyRegistrationsPage = lazy(() => import('./pages/portal/MyRegistrationsPage'));
const PortalInvoicesPage = lazy(() => import('./pages/portal/PortalInvoicesTab'));
const MyExpensesPage = lazy(() => import('./pages/portal/PortalExpensesTab'));

// Lazy-loaded public registration portal
const PublicRegistrationPage = lazy(() => import('./pages/PublicRegistration'));

function LazyFallback() {
  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  );
}

function LegacyVerifyEmailRedirect() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const slug = tenantSlug || '';
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

  if (user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function ModuleRoute({ children, moduleCode }: { children: React.ReactNode; moduleCode: string }) {
  const { user } = useAuth();

  // Super admin has access to all modules
  if (user?.role === 'super_admin') {
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

  if (user?.role !== 'tenant_admin' && user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function TenantOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Only tenant_admin, not super_admin (super admins use /admin/tenants)
  if (user?.role !== 'tenant_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/setup-password" element={<SetupPassword />} />

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

            {/* Pronoun Options (tenant admin) */}
            <Route
              path="pronoun-options"
              element={
                <TenantOnlyRoute>
                  <TenantPronounOptions />
                </TenantOnlyRoute>
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

            {/* Redirect old email-templates route to my-company */}
            <Route path="email-templates" element={<Navigate to="/my-company" replace />} />

            {/* Handbook (all authenticated users) */}
            <Route path="handbook" element={<Handbook />} />

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
              path="modules/trainings"
              element={
                <ModuleRoute moduleCode="trainings">
                  <Trainings />
                </ModuleRoute>
              }
            />
            <Route
              path="modules/volunteers"
              element={
                <ModuleRoute moduleCode="volunteers">
                  <Conferences />
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
          <Route path=":companySlug/portal/user/verify-email" element={<VerifyEmailPage />} />

          {/* CFP Landing Page — public route */}
          <Route path=":tenantSlug/portal/:abbreviation" element={<LandingPage />} />

          {/* Public Registration Portal — public route */}
          <Route
            path=":tenantSlug/register/:conferenceSlug/*"
            element={
              <ErrorBoundary>
                <PublicRegistrationPage />
              </ErrorBoundary>
            }
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
            <Route path="register/:conferenceId" element={<AuthenticatedRegistrationPage />} />
            <Route path="my-registrations" element={<MyRegistrationsPage />} />
            <Route path="my-expenses/:conferenceId" element={<MyExpensesPage />} />
            <Route path="invoices" element={<PortalInvoicesPage />} />
          </Route>

          {/* Legacy redirects for old URLs / emailed links */}
          <Route path="cfp/:tenantSlug/:abbreviation/login" element={<LegacyLoginRedirect />} />
          <Route
            path="cfp/:tenantSlug/:abbreviation/register"
            element={<LegacyRegisterRedirect />}
          />
          <Route path="cfp/:tenantSlug/verify-email" element={<LegacyVerifyEmailRedirect />} />
          <Route path="cfp/:tenantSlug/portal/*" element={<LegacyCFPPortalRedirect />} />
          <Route path="cfp/:tenantSlug/:abbreviation" element={<LegacyLoginRedirect />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
