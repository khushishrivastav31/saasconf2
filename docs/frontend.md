# SaaSConf Frontend Developer Documentation

React 18 + TypeScript single-page application built with Vite 5. Manages two
independent user flows: an **admin panel** (tenant admins, team members,
super admins) and a **public applicant portal** (CFP speakers, reviewers).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Directory Structure](#directory-structure)
3. [Application Bootstrap](#application-bootstrap)
4. [Routing](#routing)
5. [Authentication](#authentication)
6. [API Clients](#api-clients)
7. [State Management](#state-management)
8. [Hooks Reference](#hooks-reference)
9. [Component Library](#component-library)
10. [Conference Detail Page](#conference-detail-page)
11. [Type System](#type-system)
12. [Utility Functions](#utility-functions)
13. [Styling Conventions](#styling-conventions)
14. [Testing](#testing)
15. [Environment Variables](#environment-variables)
16. [Key Dependencies](#key-dependencies)

---

## Quick Start

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (port 3000)
npm run dev

# Start portal dev server (port 3002, for parallel development)
npm run dev:portal

# Type-check and build for production
npm run build

# Run unit tests
npm test

# Run E2E tests (requires a running app or uses the dev server automatically)
npm run test:e2e
```

---

## Directory Structure

```
frontend/src/
├── App.tsx                  # All route definitions
├── main.tsx                 # Entry point — providers, Sentry init, QueryClient
├── index.css                # Tailwind imports and global styles
│
├── pages/                   # ~118 files — page-level components
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Conferences.tsx
│   ├── Team.tsx
│   ├── MyCompany.tsx
│   ├── ApplicantActivityLog.tsx
│   ├── PronounOptionsTab.tsx
│   ├── admin/               # Super-admin-only pages
│   │   ├── Tenants/         # Tenant CRUD (index + sub-components)
│   │   ├── Modules.tsx
│   │   ├── AuditLogs.tsx
│   │   └── Settings.tsx
│   ├── modules/             # Module-gated pages
│   │   ├── Volunteers.tsx
│   │   ├── Locations.tsx
│   │   ├── CallForPapers.tsx
│   │   ├── ComingSoon.tsx   # Placeholder for unbuilt modules
│   │   └── cfp/             # CFP sub-pages (topics, papers, assignments, etc.)
│   ├── ConferenceDetail/    # Conference detail — sidebar + tab content
│   │   ├── index.tsx        # Main layout with sidebar navigation
│   │   ├── conferenceSections.ts  # Tab/section definitions
│   │   ├── icons.tsx        # SVG icon components for sections
│   │   └── tabs/            # One component per tab
│   │       ├── DetailsTab.tsx
│   │       ├── TeamTab.tsx
│   │       ├── BookingTab/  # Pricing matrix, discount codes, packages, bulk generation
│   │       ├── ProgramDesignTab/
│   │       ├── settings/    # Sub-tabs: CommitteeRoles, EmailTemplates, etc.
│   │       └── ...
│   └── portal/              # Public applicant portal pages
│       ├── LoginPage.tsx
│       ├── RegisterPage.tsx
│       ├── VerifyEmailPage.tsx
│       ├── LandingPage.tsx       # Public CFP landing page
│       ├── PortalLayout.tsx      # Authenticated portal shell
│       ├── DashboardPage.tsx
│       ├── SubmitPaperPage.tsx
│       ├── PaperDetailPage.tsx
│       ├── ProfilePage.tsx
│       ├── InvitationsPage.tsx
│       ├── AssignedPapersTab.tsx
│       ├── EvaluatedPapersTab.tsx
│       ├── MessagesPage.tsx
│       └── InfoPage.tsx
│
├── components/              # ~52 files — reusable UI components
│   ├── Modal.tsx            # Generic modal dialog
│   ├── Toast.tsx            # Toast notification system (provider + hook)
│   ├── ConfirmDialog.tsx    # Confirmation dialog (danger/warning variants)
│   ├── SponsorDetailPanel.tsx
│   ├── SponsorContractTab.tsx       # Contract editor/send/versions tab
│   ├── LocationDetailPanel.tsx
│   ├── SponsorLogoUpload.tsx
│   ├── common/              # Generic shared components
│   │   ├── ErrorBoundary.tsx     # Sentry-integrated error boundary
│   │   ├── StatusBadge.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── RichTextEditor.tsx    # TipTap editor wrapper
│   │   ├── RichTextDisplay.tsx   # Read-only HTML renderer
│   │   └── ...
│   ├── layout/
│   │   └── AdminLayout.tsx  # Sidebar + header shell for admin routes
│   ├── auth/                # Auth-related components
│   └── portal/              # Portal-specific components
│
├── hooks/                   # ~16 files — custom React hooks
│   ├── useAuth.ts
│   ├── useApplicantAuth.ts
│   ├── useConferenceAdmin.ts
│   ├── useIsAdmin.ts
│   ├── useSettingsCrud.ts
│   ├── useAuthMedia.ts
│   ├── usePortalAuthMedia.ts
│   └── usePortalBasePath.ts
│
├── types/                   # ~17 files — TypeScript interfaces
│   ├── index.ts             # Barrel re-export
│   ├── auth.ts              # User, LoginRequest, TokenResponse
│   ├── common.ts            # Shared types (PaginatedResponse, etc.)
│   ├── conference.ts
│   ├── cfp.ts
│   ├── booking.ts
│   ├── portal.ts            # All applicant-facing types
│   ├── review.ts
│   ├── messaging.ts
│   ├── program.ts
│   ├── form.ts
│   ├── email.ts
│   ├── tenant.ts
│   ├── audit.ts
│   ├── volunteer.ts
│   ├── location.ts
│   └── attachment.ts
│
├── utils/                   # ~11 files — pure utility functions
│   ├── apiError.ts          # parseApiError()
│   ├── formatDate.ts        # formatDate(), formatDateTime(), formatTime()
│   ├── formatCurrency.ts    # formatCurrency(), formatNumber(), parseFormattedCurrency()
│   ├── validators.ts        # validatePhone(), validateEmail(), normalizeUrl()
│   ├── mediaValidation.ts   # validateImage(), validateVideo()
│   └── richText.ts          # isHtml(), stripHtml()
│
├── config/                  # API clients and constants
│   ├── api.ts               # Admin Axios instance + token management
│   ├── portalApi.ts         # Portal Axios instance + token management
│   ├── statusColors.ts      # Status badge color maps
│   └── socialPlatforms.ts   # Social platform definitions
│
└── contexts/                # React contexts
    ├── AuthContext.tsx       # Admin auth state
    └── ApplicantAuthContext.tsx  # Applicant auth state
```

---

## Application Bootstrap

The entry point is `main.tsx`. It sets up the provider tree and initializes
Sentry for error monitoring:

```tsx
// main.tsx — simplified view of the provider hierarchy
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

**Provider order matters:**
1. `QueryClientProvider` — React Query cache (shared by both auth contexts)
2. `BrowserRouter` — React Router
3. `AuthProvider` — admin auth (reads token from `localStorage` on mount)
4. `ToastProvider` — global toast notifications

**React Query defaults** (configured on the `QueryClient`):
- `staleTime`: 5 minutes
- `retry`: 1

**Sentry** initializes only when `VITE_SENTRY_DSN` is set. It captures:
- Browser tracing (10% sample rate)
- Session replays on error (50% sample rate, all text masked)

---

## Routing

All routes are defined in `App.tsx`. The application has three major route
groups: admin, portal (authenticated), and portal (public).

### Admin Routes (Protected)

All admin routes live inside a `ProtectedRoute` > `AdminLayout` wrapper.
`AdminLayout` renders the sidebar navigation and header.

| Path | Component | Guard | Description |
|------|-----------|-------|-------------|
| `/dashboard` | `Dashboard` | `ProtectedRoute` | Home dashboard |
| `/admin/tenants` | `Tenants` | `AdminRoute` | Tenant CRUD (super admin) |
| `/admin/modules` | `Modules` | `AdminRoute` | Module management |
| `/admin/audit-logs` | `AuditLogs` | `AdminRoute` | Platform audit logs |
| `/admin/settings` | `Settings` | `AdminRoute` | Platform settings |
| `/my-company` | `MyCompany` | `TenantOnlyRoute` | Tenant company profile |
| `/team` | `Team` | `TenantAdminRoute` | Team member management |
| `/applicant-activity` | `ApplicantActivityLog` | `TenantOnlyRoute` | Applicant activity |
| `/modules/conferences` | `Conferences` | `ModuleRoute("conferences")` | Conference list |
| `/modules/conferences/:conferenceId` | `ConferenceDetail` | `ModuleRoute("conferences")` | Conference detail + tabs |
| `/modules/volunteers` | `Volunteers` | `ModuleRoute("volunteers")` | Volunteer management |
| `/modules/locations` | `Locations` | `ModuleRoute("locations")` | Location management |
| `/modules/cfp` | `CFPLayout` | `ModuleRoute("cfp")` | CFP management (nested) |
| `/modules/cfp/topics` | `CFPTopics` | (nested) | CFP topics |
| `/modules/cfp/program-committee` | `CFPProgramCommittee` | (nested) | Committee members |
| `/modules/cfp/applicants` | `CFPApplicants` | (nested) | Applicant list |
| `/modules/cfp/papers` | `CFPPapers` | (nested) | All papers |
| `/modules/cfp/evaluated-papers` | `CFPEvaluatedPapers` | (nested) | Evaluated papers |
| `/modules/cfp/accepted-papers` | `CFPSelectedPapers` | (nested) | Accepted papers |
| `/modules/cfp/rejected-papers` | `CFPSelectedPapers` | (nested) | Rejected papers |
| `/modules/cfp/assignments` | `CFPAssignments` | (nested) | Review assignments |
| `/modules/sessions` | `ComingSoon` | `ModuleRoute("sessions")` | Placeholder |
| `/modules/speakers` | `ComingSoon` | `ModuleRoute("speakers")` | Placeholder |
| `/modules/attendees` | `ComingSoon` | `ModuleRoute("attendees")` | Placeholder |
| `/modules/sponsors` | `ComingSoon` | `ModuleRoute("sponsors")` | Placeholder |
| `/modules/analytics` | `ComingSoon` | `ModuleRoute("analytics")` | Placeholder |
| `/modules/service-providers` | `ComingSoon` | `ModuleRoute("service_providers")` | Placeholder |

### Portal Routes (Applicant)

Public and authenticated routes for CFP applicants and reviewers. Each is
scoped to a tenant via `:companySlug`.

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/:companySlug/portal/user/login` | `LoginPage` | Public | Applicant login |
| `/:companySlug/portal/user/register` | `RegisterPage` | Public | Registration |
| `/:companySlug/portal/user/verify-email` | `VerifyEmailPage` | Public | Email verification |
| `/:tenantSlug/portal/:abbreviation` | `LandingPage` | Public | CFP landing page |
| `/:companySlug/portal/dashboard` | `DashboardPage` | Authenticated | Paper list + CFP overview |
| `/:companySlug/portal/papers/new` | `SubmitPaperPage` | Authenticated | Submit a paper |
| `/:companySlug/portal/papers/:paperId` | `PaperDetailPage` | Authenticated | Paper detail / edit |
| `/:companySlug/portal/profile` | `ProfilePage` | Authenticated | Speaker profile |
| `/:companySlug/portal/invitations` | `InvitationsPage` | Authenticated | Co-speaker invitations |
| `/:companySlug/portal/assigned-papers` | `AssignedPapersTab` | Authenticated | Papers to review |
| `/:companySlug/portal/evaluated-papers` | `EvaluatedPapersTab` | Authenticated | Reviewed papers |
| `/:companySlug/portal/messages` | `MessagesPage` | Authenticated | Messaging threads |
| `/:companySlug/portal/info/:conferenceId` | `InfoPage` | Authenticated | Conference info |

Authenticated portal routes share `PortalLayout` which renders navigation and
wraps content in `ApplicantAuthProvider` and `ErrorBoundary`.

### Legacy Redirects

Old URLs (prefixed with `/cfp/`) are redirected to the new portal URL
structure via `Navigate` components:

```
/cfp/:tenantSlug/:abbreviation/login   → /:tenantSlug/portal/user/login
/cfp/:tenantSlug/:abbreviation/register → /:tenantSlug/portal/user/register
/cfp/:tenantSlug/verify-email           → /:tenantSlug/portal/user/verify-email
/cfp/:tenantSlug/portal/*               → /:tenantSlug/portal/dashboard
```

### Route Guards

Route guards are simple wrapper components defined in `App.tsx`. Each reads the
user object from `useAuth()` and either renders children or redirects.

```tsx
// ProtectedRoute — requires any authenticated admin user
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// AdminRoute — super_admin only
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// TenantAdminRoute — tenant_admin OR super_admin
function TenantAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "tenant_admin" && user?.role !== "super_admin")
    return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// TenantOnlyRoute — tenant_admin only (super_admin excluded)
function TenantOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "tenant_admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ModuleRoute — requires user to have a specific module assigned
//               (super_admin bypasses module checks)
function ModuleRoute({ children, moduleCode }: { children: React.ReactNode; moduleCode: string }) {
  const { user } = useAuth();
  if (user?.role === "super_admin") return <>{children}</>;
  if (!user?.modules?.includes(moduleCode)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
```

---

## Authentication

The app maintains **two independent auth systems** — admin and applicant — with
separate tokens, separate API endpoints, and separate React contexts.

### Admin Auth (`contexts/AuthContext.tsx`)

Provides: `user`, `isLoading`, `login()`, `logout()`, `refreshUser()`.

- Tokens stored in `localStorage` as `access_token` and `refresh_token`.
- On mount, if a token exists, calls `GET /auth/me` to hydrate the user.
- `login()` calls `POST /auth/login`, stores tokens, fetches user profile.
- `logout()` calls `POST /auth/logout`, clears tokens, clears React Query cache.
- `refreshUser()` re-fetches `GET /auth/me` (used after profile updates).

```tsx
// Usage in any admin component
import { useAuth } from "../hooks/useAuth";

function MyComponent() {
  const { user, login, logout, isLoading } = useAuth();

  if (isLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;

  return <p>Hello, {user.first_name} ({user.role})</p>;
}
```

User roles: `"super_admin"` | `"tenant_admin"` | `"team_member"`.
The user object also carries `modules: string[]` for module-gated access.

### Applicant Auth (`contexts/ApplicantAuthContext.tsx`)

Provides: `applicant`, `isLoading`, `tenantSlug`, `login()`, `register()`,
`logout()`, `refreshApplicant()`.

- Tokens stored as `applicant_access_token` and `applicant_refresh_token`.
- All API calls scoped to the tenant slug from the URL (`:companySlug`).
- Login: `POST /portal/{slug}/login`
- Register: `POST /portal/{slug}/register`
- Profile: `GET /portal/me`

```tsx
import { useApplicantAuth } from "../hooks/useApplicantAuth";

function PortalComponent() {
  const { applicant, tenantSlug, logout } = useApplicantAuth();
  return <p>Welcome, {applicant?.first_name}</p>;
}
```

---

## API Clients

### Admin API (`config/api.ts`)

```tsx
import api from "../config/api";

// All requests go to: VITE_API_URL + "/api/v1" + path
const response = await api.get("/conferences");
const data = await api.post("/conferences", { name: "My Conf" });
```

**Request interceptor:** attaches `Authorization: Bearer {token}` from
`localStorage`.

**Response interceptor:** on 401 (non-auth endpoints):
1. Queues concurrent requests while refreshing.
2. Calls `POST /auth/refresh` with the refresh token.
3. On success: stores new tokens, retries all queued requests.
4. On failure: clears tokens, redirects to `/login`.

Token helpers exported from `config/api.ts`:
- `getAccessToken()` / `getRefreshToken()`
- `setTokens(access, refresh)`
- `clearTokens()`

### Portal API (`config/portalApi.ts`)

Identical architecture to the admin API but uses separate token keys
(`applicant_access_token`, `applicant_refresh_token`) and refreshes via
`POST /portal/{slug}/refresh`.

```tsx
import portalApi from "../config/portalApi";

const papers = await portalApi.get("/portal/papers");
```

The `getCompanySlugFromUrl()` helper extracts the tenant slug from
`window.location.pathname` for use in the refresh interceptor.

---

## State Management

### Server State: React Query

All server data is fetched and cached with `@tanstack/react-query`.
There is no Redux, Zustand, or other client-side store.

**Standard query pattern:**

```tsx
import { useQuery } from "@tanstack/react-query";
import api from "../config/api";

function ConferenceList() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["conferences"],
    queryFn: () => api.get("/conferences").then((r) => r.data),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <p>Failed to load conferences.</p>;

  return (
    <ul>
      {data.items.map((c) => (
        <li key={c.id}>{c.name}</li>
      ))}
    </ul>
  );
}
```

**Standard mutation pattern:**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

function CreateConference() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newConf) => api.post("/conferences", newConf).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conferences"] });
      showToast("Conference created", "success");
    },
    onError: (err) => {
      showToast(parseApiError(err), "error");
    },
  });

  // ...
}
```

**Query key conventions:**
- Collection: `["conferences"]`, `["volunteers"]`
- Single item: `["conferences", conferenceId]`
- Scoped: `["committee-roles", conferenceId]`
- Access checks: `["conference-access", conferenceId, userId]`

### Client State: React Context

Only authentication state uses React Context. All other client state is
component-local (`useState`) or derived from query results.

---

## Hooks Reference

### `useAuth()`
Returns the admin auth context: `{ user, isLoading, login, logout, refreshUser }`.
Must be used inside `AuthProvider`.

### `useApplicantAuth()`
Returns the applicant auth context: `{ applicant, isLoading, tenantSlug, login, register, logout, refreshApplicant }`.
Must be used inside `ApplicantAuthProvider`.

### `useConferenceAdmin(conferenceId)`
Checks if the current user can **modify** a specific conference. Returns
`{ isAdmin: boolean, isLoading: boolean, accessLevel: string | null }`.

Access rules:
- `super_admin` -> `isAdmin: false`, `accessLevel: "read_only"` (view only)
- `tenant_admin` -> `isAdmin: true`, `accessLevel: "admin"` (always)
- Other roles -> queries `GET /user-conference-access/my-access/{id}`

```tsx
const { isAdmin, isLoading } = useConferenceAdmin(conferenceId);
if (!isAdmin) return <p>Read-only access.</p>;
```

### `useIsAdmin()`, `useIsTenantAdmin()`, `useIsSuperAdmin()`
Simple boolean checks against the current user's role.

```tsx
const isAdmin = useIsAdmin();         // super_admin OR tenant_admin
const isTenant = useIsTenantAdmin();  // tenant_admin only
const isSuper = useIsSuperAdmin();    // super_admin only
```

### `useSettingsCrud<TEntity, TCreate, TUpdate>(options)`
Generic CRUD hook for conference settings pages. Eliminates boilerplate for
list/create/update/delete flows.

```tsx
const {
  data,           // { items: TEntity[], total: number }
  isLoading,
  createMutation,
  updateMutation,
  deleteMutation,
  error,          // User-friendly error string
  setError,
} = useSettingsCrud<CommitteeRole, CreateRole, UpdateRole>({
  conferenceId: "abc-123",
  endpoint: "committee-roles",     // -> /conferences/{id}/settings/committee-roles
  queryKey: "committee-roles",
  onCreateSuccess: () => setModalOpen(false),
  onDeleteSuccess: () => showToast("Deleted", "success"),
});

// Create
createMutation.mutate({ name: "Reviewer", description: "..." });

// Update
updateMutation.mutate({ id: roleId, data: { name: "Senior Reviewer" } });

// Delete
deleteMutation.mutate(roleId);
```

### `useAuthMedia(url)`
Loads images or files that require admin authentication. Fetches the URL as a
blob with the bearer token and returns an object URL.

```tsx
const logoSrc = useAuthMedia(conference.logo_url);
return logoSrc ? <img src={logoSrc} alt="Logo" /> : null;
```

### `usePortalAuthMedia(url)`
Same as `useAuthMedia` but uses the portal API client and applicant tokens.

### `usePortalBasePath()`
Returns `/${companySlug}/portal` extracted from URL params. Useful for
building portal navigation links.

```tsx
const basePath = usePortalBasePath(); // e.g., "/acme/portal"
<Link to={`${basePath}/papers/new`}>Submit Paper</Link>
```

---

## Component Library

### Modal

Generic modal dialog with backdrop overlay, close button, and configurable
width.

```tsx
import Modal from "../components/Modal";

<Modal
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="Edit Conference"
  size="max-w-lg"       // default: "max-w-2xl"
  zIndex="z-50"         // default: "z-50"
>
  <div className="px-6 py-4">
    {/* Form content */}
  </div>
  <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
    <button onClick={() => setIsOpen(false)} className="...">Cancel</button>
    <button onClick={handleSave} className="...">Save</button>
  </div>
</Modal>
```

The modal renders at the component's position in the tree (not a portal).
Content scrolls vertically with `max-h-[90vh]`.

### Toast Notifications

Context-based toast system. The `ToastProvider` wraps the app in `main.tsx`.

```tsx
import { useToast } from "../components/Toast";

function MyComponent() {
  const { showToast } = useToast();

  const handleSave = async () => {
    try {
      await api.post("/something", data);
      showToast("Saved successfully", "success");
    } catch (err) {
      showToast(parseApiError(err), "error");
    }
  };
}
```

Toast types: `"error"` (default), `"success"`, `"info"`, `"warning"`.
Toasts auto-dismiss after 5 seconds and stack in the top-right corner
(`z-[200]`).

### ConfirmDialog

Accessible confirmation dialog with danger/warning variants:

```tsx
import ConfirmDialog from "../components/ConfirmDialog";

<ConfirmDialog
  open={showConfirm}
  title="Delete Conference"
  message="This action cannot be undone. All data will be permanently removed."
  confirmLabel="Delete"       // default: "Delete"
  cancelLabel="Cancel"        // default: "Cancel"
  variant="danger"            // "danger" (red) or "warning" (yellow)
  onConfirm={handleDelete}
  onCancel={() => setShowConfirm(false)}
/>
```

Features: Escape key dismissal, backdrop click dismissal, auto-focus on the
cancel button for safety.

### ErrorBoundary

Class component that catches render errors, reports to Sentry, and shows a
fallback UI:

```tsx
import ErrorBoundary from "../components/common/ErrorBoundary";

<ErrorBoundary>
  <ConferenceDetail />
</ErrorBoundary>

// With custom fallback
<ErrorBoundary fallback={<p>Custom error view</p>}>
  <RiskyComponent />
</ErrorBoundary>
```

Used in `App.tsx` to wrap both `AdminLayout` and `PortalLayout`.

### Rich Text Editor

TipTap-based rich text editor with a full toolbar:

```tsx
import RichTextEditor from "../components/common/RichTextEditor";
import RichTextDisplay from "../components/common/RichTextDisplay";

// Editing
<RichTextEditor
  value={htmlContent}
  onChange={(html) => setHtmlContent(html)}
/>

// Read-only display
<RichTextDisplay content={htmlContent} />
```

Supported extensions: StarterKit, links, images, tables, task lists,
text alignment, colors, font family, highlights, subscript, superscript,
underline, YouTube embeds.

### Drag & Drop

Uses `@dnd-kit` for sortable lists (e.g., program slots, track ordering):

```tsx
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
```

---

## Conference Detail Page

The conference detail page (`/modules/conferences/:conferenceId`) is the most
complex UI in the app. It uses a sidebar + content panel layout.

### Section Definitions (`conferenceSections.ts`)

Sections are defined as data, not routes. The `ConferenceDetail` component
renders the active section's component based on local state.

```tsx
// conferenceSections.ts — section types
interface SectionDef {
  id: SectionId;
  name: string;
  icon: () => JSX.Element;
  moduleCode?: string;     // Only shown if user has this module
  children?: SectionChild[];  // Expandable sub-sections
}
```

**Core sections** (always visible):
- Details, Team, Social Media, Booking Options, Messages, Settings

**Module sections** (visible when the user has the module assigned):
- Call for Papers (with children: Topics, Program Committee, Users, Papers,
  Assignments, Evaluated Papers, Accepted Papers, Rejected Papers)
- Sessions
- Program (with children: Design, Build)
- Speakers, Attendees, Volunteers, Sponsors, Locations, Service Providers,
  Invoices, Analytics

**Settings sub-tabs:**
Committee Roles, Email Templates, Location Types, Score Scales, Session Types,
Sponsor Packages, Volunteer Roles, Paper Form Builder.

**Notable tab components:**
- `BookingTab/` — contains `DiscountCodesSection.tsx` (list + search), `DiscountModal.tsx` (create/edit), and `BulkDiscountModal.tsx` (two-step bulk generation from sponsors/speakers/committee/recipient lists)
- `SponsorsTab.tsx` — sponsor list with `SponsorDetailPanel` slide-over; each sponsor has a **Contracts** tab (`SponsorContractTab.tsx`) for rich-text contract editing, DOCX upload, PDF/DOCX download, email sending, and version history

### Adding a New Conference Tab

1. Create a component in `frontend/src/pages/ConferenceDetail/tabs/`:
   ```tsx
   // tabs/NewFeatureTab.tsx
   export default function NewFeatureTab({ conferenceId }: { conferenceId: string }) {
     // ...
   }
   ```

2. Add a `SectionId` to the union type in `conferenceSections.ts`.

3. Add the section definition to `coreSections` or `moduleSections`.

4. Add the corresponding icon to `icons.tsx`.

5. Add a case in `ConferenceDetail/index.tsx` to render the component.

---

## Type System

Types are organized by domain in `frontend/src/types/`. The barrel file
`index.ts` re-exports everything for convenient imports:

```tsx
import type { Conference, User, CFP } from "../types";
```

### Key Type Files

| File | Contains |
|------|----------|
| `auth.ts` | `User`, `LoginRequest`, `TokenResponse` |
| `conference.ts` | `Conference`, `ConferenceCreate`, `ConferenceUpdate` |
| `cfp.ts` | `CFP`, `Paper`, `Topic`, `ProgramCommitteeMember` |
| `booking.ts` | `PricingTier`, `DiscountCode`, booking matrix types |
| `portal.ts` | All applicant-facing types (`PortalPaper`, `ApplicantProfile`, etc.) |
| `review.ts` | `ReviewCriterion`, `ReviewQuestion`, `ReviewScale` |
| `messaging.ts` | `Thread`, `Message`, `Participant` |
| `program.ts` | Program design/build types |
| `form.ts` | Custom form field definitions |
| `common.ts` | `PaginatedResponse<T>`, shared utility types |

### Portal Types Convention

All portal (applicant-facing) types are prefixed with `Portal`:
`PortalPaper`, `PortalCFP`, `PortalConferenceSummary`, etc. This avoids
collisions with admin types that may share the same concept but different
shapes.

---

## Utility Functions

### `parseApiError(error, fallback?)`
Extracts a user-friendly message from Axios error responses. Handles FastAPI's
`detail` field (string or validation error array).

```tsx
import { parseApiError } from "../utils/apiError";

try {
  await api.post("/things", data);
} catch (err) {
  const message = parseApiError(err);
  // "Email already exists" or "Validation error: field is required"
  showToast(message, "error");
}
```

### `formatDate(date, locale?)` / `formatDateTime(date, locale?)` / `formatTime(date, locale?)`
Locale-aware date formatting using `Intl.DateTimeFormat`:

```tsx
import { formatDate, formatDateTime } from "../utils/formatDate";

formatDate("2026-02-13");          // "Feb 13, 2026"
formatDate("2026-02-13", "de");    // "13. Feb. 2026"
formatDateTime("2026-02-13T15:30"); // "Feb 13, 2026, 3:30 PM"
```

### `formatCurrency(value, currencyCode)` / `formatNumber(value, options?)`
Auto-formats amounts based on currency conventions:

```tsx
import { formatCurrency } from "../utils/formatCurrency";

formatCurrency(1234.56, "EUR");  // "1.234,56 EUR" (European format)
formatCurrency(1234.56, "USD");  // "USD 1,234.56" (US format)
formatCurrency(1234.56, "JPY");  // "JPY 1,235" (no decimals)
```

Also exports `parseFormattedCurrency()` for parsing user input back to numbers.

### `validatePhone(value)` / `isValidPhone(value)`
Phone validation using `libphonenumber-js`:

```tsx
import { validatePhone } from "../utils/validators";

const error = validatePhone("+49123456789"); // null (valid)
const error2 = validatePhone("123");         // "Invalid phone number..."
```

### `validateEmail(value)`
Email validation using regex (matches backend `EMAIL_RE`). Returns error string or `null`. Used on blur across all email fields in admin forms.

```tsx
import { validateEmail } from "../utils/validators";

const error = validateEmail("user@example.com"); // null (valid)
const error2 = validateEmail("bad-email");       // "Invalid email address format"
```

### `normalizeUrl(value)`
Auto-prepends `https://` to URLs missing a protocol. Used on blur for all website URL fields (`type="text"`, not `type="url"`). Returns empty string for null/empty input.

```tsx
import { normalizeUrl } from "../utils/validators";

normalizeUrl("example.com");        // "https://example.com"
normalizeUrl("https://example.com"); // "https://example.com" (unchanged)
normalizeUrl("");                    // ""
```

### `validateImage(file)` / `validateVideo(file, maxSizeMB)`
Client-side media validation. Images must be at least 600x600 px:

```tsx
import { validateImage } from "../utils/mediaValidation";

const error = await validateImage(file);
if (error) showToast(error, "error");
```

### `isHtml(str)` / `stripHtml(html)`
Detect and strip HTML tags. Used to handle legacy plain-text data alongside
new rich-text data:

```tsx
import { isHtml, stripHtml } from "../utils/richText";

isHtml("<p>Hello</p>");     // true
isHtml("Plain text");       // false
stripHtml("<p>Hello</p>");  // "Hello"
```

---

## Styling Conventions

The project uses **Tailwind CSS 3.4** with a custom `primary` color scale.

### Color Palette

| Token | Usage |
|-------|-------|
| `primary-600` | Primary buttons, active states, links |
| `primary-700` | Primary button hover |
| `gray-900` | Headings, important text |
| `gray-700` | Body text |
| `gray-500` | Muted text, descriptions |
| `gray-300` | Borders |
| `gray-200` | Card borders, dividers |
| `gray-50` | Subtle backgrounds |

### Common Patterns

**Primary button:**
```html
<button class="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors">
  Save
</button>
```

**Secondary button:**
```html
<button class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
  Cancel
</button>
```

**Danger button:**
```html
<button class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors">
  Delete
</button>
```

**Card:**
```html
<div class="bg-white border border-gray-200 rounded-lg shadow-sm">
  <div class="px-6 py-4">Content</div>
</div>
```

**Form input:**
```html
<input class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
```

**Page heading:**
```html
<h1 class="text-2xl font-bold text-gray-900">Page Title</h1>
```

**Status badges** use the maps from `config/statusColors.ts`:
```tsx
import { PAPER_STATUS_COLORS, PAPER_STATUS_LABELS } from "../config/statusColors";

<span className={`px-2 py-1 text-xs font-medium rounded-full ${PAPER_STATUS_COLORS[status]}`}>
  {PAPER_STATUS_LABELS[status]}
</span>
```

Status color maps are defined for: paper statuses, CFP statuses, invitation
statuses, and experience levels.

---

## Testing

### Unit Tests (Vitest + React Testing Library)

Tests live in `__tests__/` directories next to the code they test, with
`.test.ts` or `.test.tsx` extensions.

```bash
# Run all tests in watch mode
npm test

# Single run
npm run test:run

# With coverage report
npm run test:coverage
```

**Vitest configuration** (in `vite.config.ts`):
- Environment: `jsdom`
- Globals: enabled (no need to import `describe`, `it`, `expect`)
- Setup file: `src/test/setup.ts`
- Coverage provider: `v8`
- Coverage thresholds: 50% statements, 40% branches, 50% functions, 50% lines
- Coverage scope: `components/`, `contexts/`, `hooks/`, `utils/`, `config/`

**Example test:**
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("Modal", () => {
  it("renders title and children when open", () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("returns null when closed", () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} title="Test">
        <p>Content</p>
      </Modal>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

### E2E Tests (Playwright)

End-to-end tests in `frontend/e2e/` run against the full application.

```bash
# Run all E2E tests (auto-starts dev server locally)
npm run test:e2e

# Run with browser visible
npm run test:e2e:headed

# Run with Playwright UI
npm run test:e2e:ui
```

**Playwright configuration** (`playwright.config.ts`):
- Base URL: `E2E_BASE_URL` env var or `http://localhost:3000`
- Timeout: 60 seconds per test, 10 seconds for assertions
- Auto-starts `npm run dev` locally (not in CI)
- Retries: 2 in CI, 0 locally

**Test projects** (run in dependency order):
1. `admin-setup` — authenticates as admin, saves storage state
2. `portal-setup` — authenticates as applicant, saves storage state
3. `unauth-tests` — login/registration tests (no saved state)
4. `admin-tests` — admin panel tests (uses admin storage state)
5. `portal-tests` — portal tests (uses portal storage state)

**E2E directory structure:**
```
e2e/
├── fixtures/auth.ts              # Auth fixture helpers
├── helpers/                      # Navigation and selector helpers
│   ├── navigation.ts
│   └── selectors.ts
├── pages/                        # Page object models
│   ├── login.page.ts
│   ├── dashboard.page.ts
│   ├── conferences.page.ts
│   ├── conference-detail.page.ts
│   ├── portal-login.page.ts
│   └── portal-dashboard.page.ts
├── admin.setup.ts                # Admin auth setup project
├── portal.setup.ts               # Portal auth setup project
├── auth.spec.ts                  # Login/logout tests
├── dashboard.spec.ts
├── conferences.spec.ts
├── conference-detail.spec.ts
├── conference-settings.spec.ts
├── conference-cfp.spec.ts
├── conference-modules.spec.ts
├── navigation.spec.ts
├── super-admin.spec.ts
├── cross-modules.spec.ts
├── portal-auth.spec.ts
├── portal-dashboard.spec.ts
├── cfp-portal.spec.ts
└── accent-search.spec.ts
```

---

## Environment Variables

All prefixed with `VITE_` for Vite exposure to client code.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes | `http://localhost:8000` | Backend API base URL |
| `VITE_SENTRY_DSN` | No | (empty) | Sentry error tracking DSN |
| `VITE_SENTRY_ENVIRONMENT` | No | `development` | Sentry environment tag |
| `VITE_APP_VERSION` | No | `0.1.0` | Release version for Sentry |

E2E-only variables:

| Variable | Description |
|----------|-------------|
| `E2E_BASE_URL` | Frontend URL for Playwright (default: `http://localhost:3000`) |
| `E2E_API_URL` | Backend URL for E2E test API calls |

---

## Key Dependencies

### Runtime

| Package | Version | Purpose |
|---------|---------|---------|
| `react` / `react-dom` | ^18.2 | UI framework |
| `react-router-dom` | ^6.21 | Client-side routing |
| `@tanstack/react-query` | ^5.17 | Server state management |
| `axios` | ^1.6 | HTTP client |
| `@tiptap/*` | ^3.17+ | Rich text editor (14 extension packages) |
| `@dnd-kit/*` | ^6-10 | Drag and drop (core, sortable, modifiers, utilities) |
| `libphonenumber-js` | ^1.12 | Phone number validation |
| `dompurify` | ^3.3 | HTML sanitization |
| `@sentry/react` | ^8.55 | Error monitoring and session replay |
| `tailwindcss` | ^3.4 | Utility-first CSS |
| `@tailwindcss/typography` | ^0.5 | Prose styling for rich text content |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^5.0 | Build tool and dev server |
| `typescript` | ^5.3 | Type checking |
| `vitest` | ^4.0 | Unit test runner |
| `@testing-library/react` | ^16.3 | Component testing utilities |
| `@testing-library/user-event` | ^14.6 | User interaction simulation |
| `@playwright/test` | ^1.58 | E2E testing framework |
| `eslint` | ^8.56 | Linting |
| `prettier` | ^3.8 | Code formatting |
| `husky` | ^9.1 | Git hooks |
| `lint-staged` | ^16.2 | Pre-commit lint/format |

### Pre-commit Hooks

Husky runs `lint-staged` on commit, which applies to `src/**/*.{ts,tsx}`:
1. `eslint --fix --max-warnings 0`
2. `prettier --write`

CSS files (`src/**/*.css`) get `prettier --write` only.

---

## Common Development Tasks

### Adding a New Admin Page

1. Create the page component in `frontend/src/pages/`.
2. Add the route in `App.tsx` with the appropriate guard.
3. Add a navigation entry in `AdminLayout` if needed.

### Adding a New Portal Page

1. Create the page in `frontend/src/pages/portal/`.
2. Add a nested route under the `:companySlug/portal` layout in `App.tsx`.
3. Add navigation in `PortalLayout`.

### Adding a New Settings Tab

Use `useSettingsCrud` to eliminate boilerplate:

```tsx
import { useSettingsCrud } from "../../hooks/useSettingsCrud";

interface MyEntity { id: string; name: string; }
interface MyCreate { name: string; }
interface MyUpdate { name: string; }

function MySettingsTab({ conferenceId }: { conferenceId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading, createMutation, updateMutation, deleteMutation, error } =
    useSettingsCrud<MyEntity, MyCreate, MyUpdate>({
      conferenceId,
      endpoint: "my-entities",
      queryKey: "my-entities",
      onCreateSuccess: () => setIsModalOpen(false),
    });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {data?.items.map((item) => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

### Working with Authenticated Media

Images stored behind the API (logos, profile pictures) require authenticated
requests. Never use the URL directly in an `<img src>` tag.

```tsx
// Admin images
const logoSrc = useAuthMedia(conference.logo_url);

// Portal images
const pictureSrc = usePortalAuthMedia(applicant.picture_url);

return logoSrc ? <img src={logoSrc} alt="Logo" /> : <Placeholder />;
```

The hooks handle blob fetching, object URL creation, and cleanup on unmount.

### Error Handling Pattern

All API errors should be parsed with `parseApiError()` before display:

```tsx
import { parseApiError } from "../utils/apiError";

const mutation = useMutation({
  mutationFn: (data) => api.post("/endpoint", data).then((r) => r.data),
  onError: (err) => {
    // Extracts message from err.response.data.detail
    // Handles string detail, validation error arrays, or generic Error
    showToast(parseApiError(err), "error");
  },
});
```
