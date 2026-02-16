# Architecture Overview

SaaSConf is a multi-tenant SaaS platform for conference management. This document covers the system architecture, tech stack, and key design decisions.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend framework | FastAPI | 0.109.0 |
| ORM | SQLAlchemy (async) | 2.0.25 |
| Database | PostgreSQL | 15 |
| Cache / Token store | Redis | 7 |
| Migrations | Alembic | 1.13.1 |
| Frontend framework | React | 18.2.0 |
| Language | TypeScript | 5.x |
| Build tool | Vite | 5.x |
| CSS | Tailwind CSS | 3.x |
| Server state | React Query (@tanstack/react-query) | 5.17.0 |
| HTTP client | Axios | 1.6.2 |
| Rich text | TipTap | latest |
| Drag & drop | dnd-kit | latest |
| Password hashing | Argon2id (argon2-cffi) | 23.1.0 |
| JWT | python-jose | 3.3.0 |
| Email | Resend | 2.0.0 |
| Monitoring | Sentry | backend + frontend |
| Rate limiting | SlowAPI | 0.1.9 |

---

## System Diagram

```
                    ┌──────────────┐
                    │   Browser    │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │    Nginx     │  (staging/prod only)
                    │  SSL + proxy │
                    └──┬───────┬───┘
                       │       │
          ┌────────────▼┐  ┌──▼────────────┐
          │  React SPA  │  │  FastAPI       │
          │  (Vite)     │  │  /api/v1/...   │
          │  port 3000  │  │  port 8000     │
          └─────────────┘  └──┬─────────┬───┘
                              │         │
                    ┌─────────▼┐  ┌─────▼─────┐
                    │PostgreSQL│  │   Redis    │
                    │  port    │  │  port 6379 │
                    │  5432    │  │            │
                    └──────────┘  └────────────┘
```

- **Nginx** serves the built frontend static files and proxies `/api/` requests to the FastAPI backend
- **Redis** is used for token blacklisting (JWT revocation) and rate limiting state
- In local development, Vite's dev server replaces Nginx for the frontend

---

## Multi-Tenancy

Every tenant (company) is isolated at the database level using PostgreSQL Row-Level Security (RLS).

### How it works

1. All tenant-scoped tables have a `tenant_id` column
2. RLS policies restrict reads and writes to rows matching the current tenant
3. On every authenticated request, `set_rls_context()` sets two PostgreSQL session variables:
   - `app.current_tenant_id` — the UUID of the current tenant
   - `app.is_super_admin` — `"true"` if the user is a super admin (bypasses RLS)
4. This happens automatically in the `get_current_user` dependency (`app/core/dependencies.py`)

### Key files

- `backend/app/db/session.py` — `set_rls_context()` function
- `backend/app/core/dependencies.py` — sets RLS context on every authenticated request
- `backend/app/models/tenant.py` — `Tenant` model

### Implications

- **No cross-tenant data leaks**: Even if a query forgets a WHERE clause, RLS prevents access
- **Super admins bypass RLS**: They can see all tenants' data (used for the admin panel)
- **Test database**: Tests use `Base.metadata.create_all` instead of Alembic, so RLS policies must be set up separately in `conftest.py`

---

## Module System

Tenants are assigned specific modules (feature sets) by the super admin.

### Models

- `Module` — defines available modules (e.g., `conferences`, `cfp`, `volunteers`, `locations`)
- `TenantModule` — association table linking tenants to their assigned modules

### Access control

Backend endpoints use `require_module(module_code)` as a FastAPI dependency:

```python
@router.get("/conferences", dependencies=[Depends(require_module("conferences"))])
async def list_conferences(...):
    ...
```

Frontend routes use the `ModuleRoute` wrapper component:

```tsx
<Route path="modules/conferences" element={
  <ModuleRoute moduleCode="conferences">
    <Conferences />
  </ModuleRoute>
} />
```

### Available modules

| Code | Description |
|------|-------------|
| `conferences` | Conference management |
| `cfp` | Call for papers |
| `volunteers` | Volunteer management |
| `locations` | Location management |
| `sessions` | Session management (coming soon) |
| `speakers` | Speaker management (coming soon) |
| `attendees` | Attendee management (coming soon) |
| `sponsors` | Sponsor management (coming soon) |
| `analytics` | Analytics & reports (coming soon) |
| `service_providers` | Service provider management (coming soon) |

---

## User Roles (RBAC)

Four hierarchical roles with descending privilege:

| Role | Scope | Access |
|------|-------|--------|
| `super_admin` | Platform-wide | All tenants, all data, all modules, admin panel |
| `tenant_admin` | Single tenant | All conferences, all modules assigned to tenant, team management |
| Conference Admin | Per-conference | Admin access to specific conferences via `UserConferenceAccess` |
| Module User | Per-module | Read/write access to assigned modules only |

### Backend dependencies

```python
CurrentUserDep    = Annotated[CurrentUser, Depends(get_current_user)]      # Any authenticated user
TenantAdminDep    = Annotated[CurrentUser, Depends(require_tenant_admin)]   # Tenant admin or super admin
SuperAdminDep     = Annotated[CurrentUser, Depends(require_super_admin)]    # Super admin only
# Conference admin: Depends(require_conference_admin)  — takes conference_id from path
# Module access:   dependencies=[Depends(require_module("code"))]
```

### Frontend route guards

- `ProtectedRoute` — requires any authenticated user
- `AdminRoute` — requires `super_admin` role
- `TenantAdminRoute` — requires `tenant_admin` or `super_admin`
- `TenantOnlyRoute` — requires `tenant_admin` (excludes super admin)
- `ModuleRoute` — requires the specified module assignment

---

## Dual Portal System

The application has two separate user-facing systems:

### Admin Portal

- URL: `/{protected routes}` (e.g., `/dashboard`, `/modules/conferences`)
- Users: Admins (super admin, tenant admin, conference admin)
- Auth: `AuthContext` + `useAuth` hook
- API client: `config/api.ts` (Bearer token in Authorization header)

### Applicant Portal (CFP)

- URL: `/:companySlug/portal/...` (e.g., `/acme/portal/dashboard`)
- Users: Conference applicants (speakers submitting papers)
- Auth: `ApplicantAuthContext` + `useApplicantAuth` hook
- API client: `config/portalApi.ts` (separate token storage)
- Public pages: Login, Register, Email verification, CFP landing page

The two systems share no auth state. An admin and an applicant can be logged in simultaneously in different browser tabs.

---

## Key Design Decisions

### JSONB for team members

Conference team members are stored as JSONB in the `conferences` table rather than in a separate table. The Pydantic schema `TeamMember` validates each entry. This simplifies the schema for small, embedded lists but means validators run on output too (see gotcha below).

### Pydantic validators run on response objects

Pydantic v2 `@field_validator` runs during both input validation (request body parsing) and output serialization (response building). If a validator rejects data that exists in the database, the API will return a 500 error. This happened with phone number validation — invalid legacy data caused the conferences endpoint to fail.

**Rule**: When adding strict validators, ensure existing database data conforms, or use `model_construct()` to skip validation on response objects.

### Async everywhere

All database operations use async SQLAlchemy with `asyncpg`. All FastAPI endpoints are `async def`. The Redis client is also async. This provides high throughput for I/O-bound operations.

### Offset-based pagination

List endpoints use offset-based pagination via the `paginate()` utility:

```python
result = await paginate(db, query, page=page, page_size=page_size)
return {"items": result.items, "total": result.total}
```

Response includes `items` (list) and `total` (count), allowing the frontend to render page controls.
