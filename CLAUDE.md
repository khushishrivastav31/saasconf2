# SaaSConf Project Notes

## What This Is

SaaSConf is a **multi-tenant SaaS platform** for conference management. Each tenant (organization) manages their own conferences, CFPs, registrations, sponsors, and programs — fully isolated via PostgreSQL Row-Level Security (RLS). **Performance is essential** — the platform must handle multiple tenants with concurrent users without degradation.

## Architecture
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (port 8000)
- **Frontend**: React + TypeScript + TanStack Query + Tailwind CSS (port 3000)
- **Migrations**: Alembic (sequential numbered: `001_`, `002_`, etc.)
- **Multi-tenancy**: Shared database, shared schema, RLS-based isolation (`tenant_id` on every table, PostgreSQL policies filter per request)
- **Async throughout**: All DB queries use `AsyncSession`, email sending via `asyncio.to_thread()`, streaming exports via `async generators`

## Performance Requirements

**Every code change must consider performance impact.** This is a multi-tenant system where slow queries or memory issues affect all tenants.

### Backend Performance Rules
- **Never introduce N+1 queries** — use `joinedload()`, `selectinload()`, or batch lookups (see `_batch_get_attachment_urls` pattern in `app/api/v1/cfp/shared.py`)
- **Always paginate list endpoints** — use `skip`/`limit` params with reasonable defaults (100) and max caps (500)
- **Use async for I/O** — never block the event loop with synchronous calls; wrap with `asyncio.to_thread()` if needed (e.g., email sending, document generation)
- **Stream large exports** — use `StreamingResponse` with async generators in batches of 1,000 rows; cap at 50k rows for safety
- **Index new columns** used in WHERE/JOIN/ORDER BY — especially `tenant_id` (always), `conference_id`, `status`, and any FK columns
- **Connection pool**: 10 connections + 20 overflow — avoid long-running transactions that hold connections
- **Avoid `select *`** in queries with many columns — select only what the response schema needs when practical

### Frontend Performance Rules
- **Use `React.memo`** on components rendered in lists (already applied to SessionCard, MemberListRow, ApplicantListRow, LocationItem)
- **Use `useMemo`/`useCallback`** for expensive computations and stable callback references in dependency arrays
- **Set appropriate `staleTime`** on queries — `0` for data that must be fresh (registration sessions), longer for stable data (modules, currencies)
- **Lazy load routes** — all page components use `React.lazy()` with code splitting (already configured in App.tsx)
- **Avoid re-renders** — don't create new objects/arrays in render (e.g., `options={[]}` → memoize or define outside component)

### Responsive Design Rules (Portal)
- **Portal must be mobile-friendly** — conference attendees use phones to submit papers, check messages, and view program
- **Admin is desktop-first** — admin users typically work on desktop; mobile is nice-to-have
- **Sidebar pattern**: Both layouts use off-screen sidebar on mobile (`-translate-x-full` / `translate-x-0`) with backdrop overlay and hamburger toggle in header
- **Breakpoint strategy**: `sm:` (640px) for form field stacking, `lg:` (1024px) for sidebar visibility — skip `md:` unless specifically needed
- **Touch targets**: Minimum `min-h-[44px]` on interactive elements in portal (buttons, links, form inputs)
- **Flex wrapping**: Always use `flex-wrap` on button groups and action bars — never assume horizontal space
- **Fixed widths**: Avoid fixed `w-*` in portal pages — use `w-full sm:w-48` pattern instead
- **Close sidebar on navigate**: All sidebar `<Link>` clicks must call `setSidebarOpen(false)` for mobile UX
- **Reference implementation**: MessagesPage.tsx has the best responsive pattern (list/detail toggle with `hidden lg:block`)

### Dark Mode Rules
- **Class-based dark mode** — Tailwind v4 `@custom-variant dark` with `.dark` class on `<html>`
- **ThemeContext** manages preference state, localStorage persistence, and `<html>` class toggling
- **FOUC prevention** — `public/theme-init.js` runs before React to apply `.dark` class from localStorage
- **DB persistence** — `theme_preference` column (nullable varchar(5)) on both `users` and `cfp_applicants`: `'light'`, `'dark'`, or `NULL` (system)
- **Color mapping** — always add `dark:` counterparts when using gray/white backgrounds and text: `bg-white` → + `dark:bg-gray-800`, `bg-gray-50` → + `dark:bg-gray-900`, `bg-gray-100` → + `dark:bg-gray-800`, `text-gray-900` → + `dark:text-gray-100`, `text-gray-700` → + `dark:text-gray-300`, `text-gray-600` → + `dark:text-gray-300` (NOT gray-400 — insufficient contrast), `text-gray-500` → + `dark:text-gray-400`, `border-gray-200` → + `dark:border-gray-700`, `border-gray-300` → + `dark:border-gray-600`, `hover:bg-gray-50` → + `dark:hover:bg-gray-700`
- **Form inputs in dark mode** — all inputs/selects need: `dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100`
- **Semantic colors** — status colors (red, green, blue, amber) use `/30` opacity in dark: `bg-red-50` → + `dark:bg-red-900/30`
- **Sidebar stays dark** — both layout sidebars use `bg-gray-900` + light text, unchanged in dark mode
- **Primary colors unchanged** — `bg-primary-600` buttons, focus rings, links work in both themes
- **Login pages** — ThemeToggle without API persistence (no user logged in yet)
- **New components must include dark: variants** — every new `.tsx` file must use dark mode classes from the start

## Registration Module

### Session Selection
When registering, if a booking option is linked to a program day that has sessions marked as `separately_bookable`, the registrant sees dropdown menus to choose sessions. Sessions are grouped by **session type** (e.g., Tutorial, Hackathon, Bonus Session) within each day.

- Parallel sessions in the same time slot: choose **one** via dropdown
- Non-parallel sessions (different slots): choose from **each** independently
- Sessions without papers assigned show: *"You can choose your sessions later. We will come back to you."*
- Session time labels account for multi-slot spans (e.g., full-day tutorials show 09:00-17:00, not just the first slot)
- Data is always fresh (`staleTime: 0`) so program changes are reflected immediately

### Registration Modes
- **Single Registration**: One attendee with billing info (uses `/registrations/individual` endpoint)
- **Group Registration**: Multiple attendees sharing one billing profile (uses `/registrations/bulk` endpoint)

### VAT Number Validation

**Single source of truth** — all VAT validation across the entire application goes through one path:

- **Backend**: `validate_vat_number()` in `app/core/vat_validation.py` — the only validation function. Every endpoint that validates VAT calls this one function.
- **Frontend**: `useVatValidation` hook (`hooks/useVatValidation.ts`) → `VatNumberInput` component (`components/common/VatNumberInput.tsx`). Every VAT field in the app uses this component.
- **Endpoint**: `POST /my-company/validate-vat?vat_number=...&country=...` — standalone, no module dependency. All VAT fields use this single endpoint.

**Any new VAT field must use `<VatNumberInput>`** — never create inline VAT validation or call the API directly. This ensures consistent behavior (visual feedback, validation logic, error handling) everywhere.

VAT validation is triggered **on blur** of the VAT number field. The country is resolved from: explicit `country` prop > VAT prefix extraction (first 2 chars) > fallback. Accepts both ISO codes (`DE`) and full country names (`Germany`).

Three-stage validation cascade:
1. **python-stdnum** (offline, fast) — validates format + checksum
2. **Regex fallback** — basic format check per country if stdnum fails
3. **VIES API** (`ec.europa.eu`) — online verification against EU registry if regex passes but stdnum failed

Validation results:
- **Valid** (green border + checkmark): stdnum or VIES confirmed the VAT number
- **Invalid** (red border + X icon): validation failed — registration still proceeds but VAT is flagged
- **Uncertain** (yellow border + warning): format OK but VIES unavailable for online verification

The result is persisted on the `billing_profiles.vat_validated` column (`true`/`false`/`null`).

**Current locations using VatNumberInput**: Registration billing fields, Fiscal Rep section (2 fields), Sponsor detail panel, Sponsor create form, My Company page.

**Dependencies**: `python-stdnum` (added to `requirements.txt`)

### Country Field Rules
- **Always use a `<select>` dropdown** with `COUNTRY_OPTIONS` from `frontend/src/config/countries.ts` — never a free-text `<input>`
- **Store ISO codes** (`"DE"`, `"RO"`, `"SE"`) — not full names (`"Germany"`)
- **Pattern**: `<select value={...}><option value="">Select a country</option>{COUNTRY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select>`
- Backend `normalize_country()` in `vat_validation.py` accepts both ISO codes and full names for backward compatibility
- **Any new form with a country field** must use this dropdown pattern — consistency is required across the entire app

## Screen Overlays (Settings > Communication)

### Overview
Full-screen overlays shown to portal users on login events. Support text content (title + body), animations, and optional image uploads. Admin UI is in **Settings → Communication → Screen Overlays** (moved from top-level sidebar).

### Image Upload
- **One image per overlay** with replace semantics (uploading new deletes old)
- Follows the **conference logo pattern**: dedicated upload/serve/delete endpoints with `image_url` column on the model
- Stored via polymorphic `Attachment` model (`entity_type="screen_overlay_image"`, `entity_id=overlay.id`) — files as `bytea` in PostgreSQL
- **Allowed types**: JPEG, PNG, WebP, GIF (no SVG — XSS risk in portal)
- EXIF metadata stripped for JPEG/PNG/WebP via `strip_image_metadata()`
- **Public serve endpoint** (no auth) — portal users load image directly; `Cache-Control: public, max-age=86400`
- Cache-bust URL: `/conferences/{id}/screen-overlays/{overlay_id}/image?v={timestamp}`
- Image upload only in **edit mode** (overlay must exist to have an ID)
- Attachment cleaned up automatically on overlay delete

### Endpoints
- `POST /conferences/{id}/screen-overlays/{overlay_id}/image` — upload/replace (admin)
- `GET /conferences/{id}/screen-overlays/{overlay_id}/image` — serve (public)
- `DELETE /conferences/{id}/screen-overlays/{overlay_id}/image` — remove (admin)

### Trigger Types & Linking
- `first_registration` — shown once per user (localStorage key: `overlay_seen_{id}`)
- `scheduled` — shown on/after `schedule_date`
- `always` — shown every login
- Overlays can be linked to content entities (news articles, email/message templates) via FK columns; linked overlays always show regardless of trigger type

## Booking Module

### Discount Codes
Each conference can have discount codes for attendee bookings. Stored in `discount_codes` table with junction tables for many-to-many relationships.

- **Fields**: `description` (String 200), `code` (unique per conference), `discount_type` (percentage/fixed), `discount_value`, `currency`, `start_date`/`end_date`, `max_uses` (0=unlimited), `usage_count`, `is_active`, `is_combinable`
- **Applicability**: Discounts can be scoped to specific booking **options** (`discount_code_options` junction) and/or booking **periods** (`discount_code_periods` junction). Empty = applies to all.
- **Combinable flag**: `is_combinable` controls whether a discount can be stacked with others

### Bulk Discount Generation
Generate multiple discount codes at once from people sources using template variables.

- **People Sources**: Sponsors, Speakers (CFP Applicants), Program Committee, Recipient Lists
- **Template Variables**: `[ConferenceSlug]`, `[FirstName]`, `[LastName]`, `[FullName]`, `[CompanyName]`, `[Email]`, `[Counter]` (zero-padded sequential)
- **Endpoint**: `POST /conferences/{id}/settings/discount-codes/bulk` — receives pre-resolved `BulkDiscountEntry` list (frontend maps source data to entries)
- **Validation**: All generated codes checked for uniqueness (fail entire batch on conflict); duplicate detection shown client-side in preview
- **Two-step UI**: Step 1 (configure source, template, settings) → Step 2 (preview resolved codes with duplicate highlighting)
- **Code template**: Variables are case-sensitive (`[LastName]` not `[LASTNAME]`); resolved codes are uppercased only in the final output

## Field Validation (`frontend/src/utils/validators.ts`)

Shared validation utilities used across all admin forms. Validation runs **on blur** with inline error display (red border + message below field).

- **`validatePhone(value)`** — libphonenumber-js validation, requires international format (`+49...`). Returns error string or `null`.
- **`validateEmail(value)`** — regex validation matching backend `EMAIL_RE`. Returns error string or `null`.
- **`isValidPhone(value)`** — boolean wrapper around `validatePhone`.
- **`normalizeUrl(value)`** — auto-prepends `https://` on blur if no protocol present. Used on all website URL fields (`type="text"`, not `type="url"`).

All functions accept `string | null | undefined` and treat empty/null as valid (fields are optional).

**Applied to**: SponsorDetailPanel, ServiceProviderDetailPanel, ContactPersonList, LocationDetailPanel, VolunteersTab, DetailsTab, LocationsTab, Team, MyCompany, CompanyInfoTab, UsersTab.

## Sponsor Contract Management

### Overview
Full contract lifecycle for sponsor agreements: create from templates or DOCX upload, edit rich-text content, version history, PDF/DOCX export, and email delivery.

### Data Model
- **`sponsor_contracts`** — one active contract per sponsor. Fields: `html_content`, `filename`, `status` (draft/sent/signed), `version_number`, `sent_at`, `sent_to_email`, `sent_by_user_id`
- **`sponsor_contract_versions`** — immutable snapshots created on each content save. Fields: `version_number`, `html_content`, `filename`, `created_by_user_id`
- Migration: `098_sponsor_contracts.py`

### Contract Statuses (`app/constants.py: ContractStatus`)
- `draft` — initial state, content editable
- `sent` — emailed to sponsor contact, still editable (creates new version)
- `signed` — final state

### Document Processing
- **DOCX upload → HTML**: `mammoth` converts DOCX to HTML for rich-text editing
- **RTF upload → HTML**: `striprtf` extracts text, wrapped in HTML
- **HTML → PDF export**: `fpdf2` generates PDF with Latin-1 character normalization
- **HTML → DOCX export**: `html2docx` generates downloadable DOCX
- **Dependencies**: `mammoth==1.11.0`, `fpdf2==2.8.3`, `striprtf==0.0.26`, `python-docx==1.1.2`, `html2docx==1.6.0`

### API Endpoints (12 routes)
All nested under `/conferences/{id}/sponsors/{sponsor_id}/contract`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get current contract |
| POST | `/generate` | Create from template or DOCX/RTF upload |
| PUT | `/content` | Update HTML content (creates version) |
| PUT | `/status` | Change status (draft→sent→signed) |
| GET | `/download` | Download as DOCX |
| GET | `/pdf` | Download as PDF |
| GET | `/send-preview` | Preview email before sending |
| POST | `/send` | Send contract via email |
| DELETE | `/` | Delete contract and all versions |
| GET | `/versions` | List all versions |
| GET | `/versions/{n}` | Get specific version |
| GET | `/versions/{n}/download` | Download version as DOCX |

### Email Integration
- Template type: `sponsor_contract_send` (configurable in Settings → Email Templates)
- Placeholders: `[Recipient Name]`, `[Package Name]`, `[Custom Message]`, `[Contract Content]`
- Contract attached as DOCX; HTML content inlined via `[Contract Content]` placeholder
- Uses `build_sponsor_contract_context()` in `app/core/email_templates.py`

### Frontend
- **`SponsorContractTab.tsx`** — tab in SponsorDetailPanel; rich-text editor for contract content, upload, download, send, version history
- **`SponsorPackagesTab.tsx`** — package-level contract template (default content for new contracts)

## Alumni

### Overview
Conference-scoped alumni tracking for past attendees. **Core feature** — no module gate required (always visible, like Details/Team/Deadlines). Alumni records can be created manually, imported via CSV, or auto-created from paid registrations.

### Data Model
- **`alumni`** table — `id`, `tenant_id`, `conference_id`, `email` (String 320, case-insensitive unique per conference), `first_name` (String 255), `last_name` (String 255), `company` (String 255, nullable), `source` (enum: `manual`/`import`/`registration`), `notes` (Text, nullable), `created_at`, `updated_at`
- **Indexes**: `tenant_id`, `conference_id`, `tenant_id + email` (cross-conference lookup), unique on `lower(email)` per conference
- **RLS**: tenant isolation policy
- **Migration**: `104_alumni.py` (revises `103_tenant_email_domain`)
- **Constants**: `ResourceType.ALUMNI`, `AuditAction.ALUMNI_CREATE/UPDATE/IMPORT/DELETE`

### API Endpoints (`/conferences/{id}/alumni/`)
No module gate. All write operations require conference admin.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List alumni (paginated: `page`, `page_size`, `search`) |
| POST | `/` | Create single alumni (201) |
| PUT | `/{id}` | Update alumni (partial) |
| DELETE | `/{id}` | Delete alumni |
| POST | `/import` | Bulk CSV import (multipart, up to 50k rows) |
| GET | `/export` | Export to CSV (UTF-8 BOM) |
| GET | `/check?email=...` | Cross-conference alumni lookup (tenant-wide) |

### Data Propagation
When email or name is updated on an alumni record, the change **cascades** to linked `Registration` and `CFPApplicant` records matching the old email. This keeps attendee data consistent across modules.

### CSV Import
- Flexible header mapping: accepts `email`/`e-mail`, `first_name`/`firstname`/`vorname`, etc.
- Supports UTF-8 BOM, UTF-8, and latin-1 encodings
- Skips duplicates (case-insensitive email match), returns `{imported, skipped, errors[]}`
- Missing first/last name defaults to email prefix / `"-"`

### Frontend
- **Sidebar**: `AlumniIcon` in `coreSections` between Booking Options and Deadlines
- **AlumniTab** (`tabs/AlumniTab.tsx`) — paginated list (50/page) with debounced search, add/edit/delete modals, CSV import with results display, CSV export, source badges (gray=manual, blue=import, green=registration)
- Admin-only: add, edit, delete, import, export buttons hidden for non-admin

## Deadlines

### Overview
Conference-scoped deadline tracking for contracts, venue bookings, and other time-sensitive tasks. **Core feature** — no module gate required (always visible, like Details/Team/Alumni).

### Data Model
- **`deadlines`** table — `id`, `tenant_id`, `conference_id`, `title` (String 500), `description` (Text, nullable), `due_date` (DateTime TZ-aware), `is_active` (Boolean, default true), `reminder_7d_sent`, `reminder_1d_sent`, `reminder_due_sent` (Boolean flags), `created_by` (FK users), `created_at`, `updated_at`
- **Indexes**: `conference_id`, `due_date`, partial `idx_deadlines_active_due WHERE is_active = true`
- **RLS**: `tenant_isolation_deadlines` policy
- **Migration**: `105_deadlines.py` (revises `104_alumni`)
- **Constants**: `ResourceType.DEADLINE`, `AuditAction.DEADLINE_CREATE/UPDATE/DELETE`

### API Endpoints (`/conferences/{id}/deadlines/`)
No module gate. All write operations require conference admin.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List deadlines (returns `{items, total}`) |
| POST | `/` | Create deadline (201) |
| PUT | `/{id}` | Update deadline (partial update) |
| PATCH | `/{id}/toggle` | Toggle `is_active` |
| DELETE | `/{id}` | Delete deadline |

**Due date change logic**: When `due_date` is updated, reminder flags are selectively reset — only flags whose reminder window hasn't passed yet for the new date are reset to `false`.

### Reminder System
- **Ops endpoint**: `POST /ops/send-deadline-reminders` — queries active deadlines with unsent reminders, sends email to conference contact address, marks flags after send. Respects `email_sending_enabled` setting. Auth via `Authorization: Bearer <SUPER_ADMIN_PASSWORD>`.
- **Email**: `send_deadline_reminder()` in `app/core/email.py` — HTML template with color-coded badges (red=due today, amber=due tomorrow, blue=due in 7 days).
- **Cron**: `deadline-cron` container in docker-compose — runs hourly (`sleep 3600`), calls the ops endpoint.
- **Due dates** formatted in conference timezone using `zoneinfo.ZoneInfo`.

### Frontend
- **Sidebar**: `DeadlinesIcon` (calendar SVG) in `coreSections` between Alumni and Settings
- **DeadlinesTab** (`tabs/DeadlinesTab.tsx`) — color-coded cards: overdue (red border + badge), due-soon (amber), active (blue), resolved (gray + strikethrough + opacity). Sorted: overdue → due-soon → active → resolved. CRUD modal, toggle resolve/reactivate, confirm dialog for delete.
- **Toast warnings** — on ConferenceDetail load, active deadlines due within 7 days trigger toast notifications (once per mount via `useRef` guard). 1-2 approaching: individual toasts; 3+: summary toast.

## Volunteer Task System

### Data Model
- **`volunteer_roles`** (Settings) — Task definitions (name, description, is_active). UI labels say "Volunteer Tasks" but table name is `volunteer_roles` for backwards compatibility.
- **`session_volunteer_tasks`** — Links program sessions to volunteer tasks. Each record has `session_id`, `volunteer_task_id`, and `required_count` (how many volunteers needed). Unique constraint: `(session_id, volunteer_task_id)`.
- **`volunteer_assignments`** — Links volunteers to specific session-tasks. Each record has `session_volunteer_task_id` and `volunteer_id`. Unique constraint: `(session_volunteer_task_id, volunteer_id)`.
- **`conference_volunteers.color`** — Per-conference hex color (`#RRGGBB`) for visual identification in assignment views.
- Both new tables have RLS policies (`tenant_isolation_*`) and are indexed on `conference_id`.

### Migration
- **`100_volunteer_task_system`** (revises `099_theme_preference`) — Creates `session_volunteer_tasks`, `volunteer_assignments`, adds `color` column to `conference_volunteers`, enables RLS on new tables.
- **Run locally**: `cd backend && venv/bin/python -m alembic upgrade head` (or `make db-migrate`)
- **Staging/prod**: Migration runs automatically during deploy via `alembic upgrade head` in the backend container entrypoint.

### API Endpoints (`/conferences/{id}/volunteer-tasks/`)
Module-gated by `volunteers`. All require tenant admin auth.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/session-tasks` | List all session-task assignments grouped by session |
| POST | `/session-tasks` | Assign a task to a session |
| PUT | `/session-tasks/{id}` | Update required_count |
| DELETE | `/session-tasks/{id}` | Remove task from session (cascades assignments) |
| GET | `/volunteer-assignments` | Task overview with sessions + assigned volunteers |
| POST | `/volunteer-assignments` | Assign volunteer to session-task |
| DELETE | `/volunteer-assignments/{id}` | Remove volunteer assignment |
| PATCH | `/volunteers/{id}/color` | Set volunteer's color for this conference |
| GET | `/volunteer-schedule` | All volunteers' schedules |
| GET | `/volunteer-schedule/{id}` | Single volunteer schedule |
| GET | `/volunteer-schedule/unassigned` | Sessions needing more volunteers |
| GET | `/volunteer-schedule/{id}/pdf` | Single volunteer PDF schedule |
| GET | `/volunteer-schedules-pdf` | Bulk ZIP of all volunteer PDFs |

### Frontend Sections
Sidebar tree: **Volunteers** (list) → **Task Assignment** | **Volunteer Assignment** | **Volunteer Schedule**

- **Task Assignment** (`TaskAssignmentTab.tsx`) — Program grid (day tabs, CSS grid with time slots × tracks) with drag-and-drop. Drag tasks from sidebar → drop on session cells. Session detail modal for editing assigned tasks and required counts. Uses `useGridPositions` hook for visual segment positioning.
- **Volunteer Assignment** (`VolunteerAssignmentTab.tsx`) — Program grid with drag-and-drop. Drag volunteers from sidebar → drop on session cells. Single-task sessions auto-assign; multi-task sessions show task picker modal. Session detail modal shows assigned volunteers per task with add/remove. Volunteer names with color dots shown on grid cells. Uses same grid infrastructure as TaskAssignmentTab.
- **Volunteer Schedule** (`VolunteerScheduleTab.tsx`) — Expandable volunteer list with schedule grouped by day. Unassigned sessions shown at bottom. PDF export per volunteer or bulk ZIP.
- **Shared grid infrastructure** — `useGridPositions` hook (extracted from ProgramGrid.tsx) computes `SessionVisualSegment[]` for CSS grid positioning. Handles multi-slot sessions, track spans, and break splitting. Used by TaskAssignmentTab and VolunteerAssignmentTab.

## Dev Environment & Tooling

### Code Quality
- **Linting**: Ruff (backend), ESLint (frontend) — enforced in CI + pre-commit
- **Type checking**: mypy (backend), TypeScript `--noEmit` (frontend)
- **Formatting**: Ruff format (backend), Prettier (frontend)
- **Pre-commit hooks**: ruff, ruff-format, mypy, eslint, prettier, trailing-whitespace, end-of-file-fixer, hadolint (Dockerfiles), conventional-pre-commit (commit messages), detect-secrets

### Mypy Config (`pyproject.toml`)
- `ignore_missing_imports = false` with per-module overrides for stub-less packages (nh3, phonenumbers, slowapi, etc.)
- Core settings: `check_untyped_defs`, `no_implicit_optional`, `warn_redundant_casts`, `warn_unused_configs`
- Migrations excluded (`ignore_errors = true` on `app.db.migrations.*`)
- API route modules (`app.api.v1.*`) have relaxed error codes (`arg-type`, `attr-defined`, `union-attr`, `assignment`, `return-value`, `var-annotated`) due to heavy SQLAlchemy query usage

### Pydantic
- All schemas use Pydantic v2 `model_config = ConfigDict(from_attributes=True)` — no legacy `class Config:` patterns

### Docker
- Base images pinned to specific SHAs in all Dockerfiles (backend, frontend)
- CI uses concurrency controls to cancel redundant runs

### Dev Files
- `.nvmrc` (Node 20), `.python-version` (3.12), `.editorconfig`, `.env.example` (backend + frontend)
- `.vscode/settings.json` + `extensions.json` for consistent editor setup
- `Makefile` with targets: `init`, `dev`, `test`, `quality`, `dev-clean`, `db-reset`

### Domain Constants (`app/constants.py`)
- `ModuleCode` — all module identifiers (cfp, registration, program, etc.)
- `ResourceType` — audit log resource types (conference, paper, volunteer, etc.)
- `EntityType` — polymorphic attachment types (conference_logo, sponsor, message, etc.)
- `InvoiceStatus` — invoice lifecycle states (draft, sent, paid, overdue, cancelled)
- `ContractStatus` — sponsor contract lifecycle (draft, sent, signed)

### Health Probes & Ops
- `GET /health` — liveness probe (process running)
- `GET /health/ready` — readiness probe (checks DB + Redis connectivity, returns 503 if unhealthy)
- `POST /ops/data-retention-cleanup` — runs DB cleanup functions (expired tokens, old audit logs); auth via `Authorization: Bearer <SUPER_ADMIN_PASSWORD>`
- `POST /ops/send-deadline-reminders` — sends email reminders for approaching deadlines (7d, 1d, due today); auth via `Authorization: Bearer <SUPER_ADMIN_PASSWORD>`
- Staging: `cleanup-cron` container calls cleanup endpoint nightly; `deadline-cron` container calls reminder endpoint hourly

### Deployment
- CI tags images as `:previous` before rebuilding for rollback capability
- Migrations run without `|| true` — deploy fails properly on migration errors
- Health checks retry 5 times with 10s intervals
- Deploy ensures infra services (db, redis) are healthy before rebuilding app containers (`docker compose up -d --wait db redis`)
- App services restart with `--no-deps` to prevent cascading recreates of db/redis
- **Staging DB is PostgreSQL 16** (`postgres:16.6-alpine`) — matches local dev and CI. Upgraded from PG15 via `deploy/staging/upgrade-pg16.sh` (dump/restore)

### Nginx (staging)
- Config is a template (`nginx.conf.template`) processed by `envsubst` at container start
- **envsubst escaping**: `"\$$DOMAIN \$$API_DOMAIN"` in docker-compose.yml — `$$` → `$` (Compose), `\$` → literal `$` (shell), so envsubst receives `$DOMAIN $API_DOMAIN` as variable names. Using `"$$DOMAIN"` alone causes the shell to expand variables before envsubst sees them.
- Full CSP header: `default-src`, `script-src`, `style-src`, `img-src`, `font-src`, `connect-src`, `frame-ancestors`
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy
- Deploy includes a "Verify containers" step that logs container status, backend/nginx logs, and local health check for diagnostics

### Email Sending (`app/core/email.py`)
- Uses `resend` library via `asyncio.to_thread()` to avoid blocking the event loop
- Falls back to console logging when `RESEND_API_KEY` is not set
- Per-conference email toggle via `conference.settings.email_sending_enabled`
- **Per-tenant sender**: `send_email()` accepts optional `from_email` override; `_get_tenant_from_email(db, tenant_id)` resolves to `noreply@{email_domain}` when tenant has `email_domain` configured, otherwise falls back to global `RESEND_FROM_EMAIL`

### User Invite Flow
Invite-based onboarding for new admin and team users. When a user is created without a password, they receive an email with a link to set their own password.

- **Tenant creation** (`POST /tenants`): Super admin provides `admin_email` (required) and optionally `admin_password`. If no password: user created with unusable random hash + 7-day invite token + welcome email sent.
- **Team member creation** (`POST /users`): Tenant admin provides email, name, role — no password field. User created with unusable hash + invite token + welcome email. If password is provided via API, user is created directly (backward compatible).
- **Invite token**: Generated via `generate_email_verification_token()` (256-bit entropy), stored as SHA256 hash in `user_password_resets` table with 7-day expiry (vs 1 hour for forgot-password).
- **Resend invite**: `POST /users/{user_id}/resend-invite` — generates new token, sends fresh email. Only works for users who have never logged in (`last_login is None`). Tenant admin only.
- **Setup password page**: `/setup-password?token=...` — frontend page where invited users set their password. Reuses `POST /auth/reset-password` endpoint for token validation and password setting.
- **Email template**: `TENANT_USER_WELCOME` in `DEFAULT_TEMPLATES` — subject "Welcome to [Company Name] — Set up your password", body with "Set up my password" button linking to `[Verify Link]` (resolves to `/setup-password?token=...`).
- **Per-tenant sender**: When tenant has `email_domain` set, invite emails come from `noreply@{domain}`; otherwise global sender.
- **Audit action**: `USER_INVITE_SENT` (`user.invite_sent`) logged on invite creation and resend.
- **Frontend**: Password fields removed from Team.tsx `AddMemberModal`, Tenants/index.tsx create form, and UsersTab.tsx `AddUserModal`. "Resend Invite" button shown for users with `last_login === null && is_active`.
- **Migration**: `100_tenant_email_domain.py` adds `email_domain` column to `tenants` table.

### Admin Password Reset Flow
Token-based password reset for admin users (`super_admin`, `tenant_admin`, `user`). OWASP-compliant.

- **Forgot password**: `POST /auth/forgot-password` — rate limited 3/min, always returns success regardless of email existence (anti-enumeration). Generates token via `generate_email_verification_token()` (`secrets.token_urlsafe(32)`, 256-bit entropy), stores SHA256 hash in `user_password_resets` table (1h expiry), sends reset email via Resend. Invalidates all previous unused tokens for the same user before creating a new one.
- **Reset password**: `POST /auth/reset-password` — rate limited 5/min. Validates token hash against DB, enforces password complexity (min 8 chars, uppercase, lowercase, digit — same rules as `UserCreate`), updates `password_hash` (Argon2id), marks token as used. On successful reset: invalidates all other pending reset tokens for the user and revokes all active refresh tokens (forces re-login on all devices).
- **Model**: `UserPasswordReset` in `app/models/user_password_reset.py` (mirrors `ApplicantPasswordReset`). Columns: `user_id` FK, `token_hash` (SHA256, indexed), `expires_at`, `created_at`, `used_at`. Property `is_valid` checks `used_at is None and utcnow() < expires_at`. Migration: `102_user_password_resets`.
- **Frontend**: `/forgot-password` (email form → success message) and `/reset-password?token=...` (new password + confirm, client-side complexity validation). Login page has "Forgot password?" link. Both pages include dark mode support and ThemeToggle.
- **Audit actions**: `USER_PASSWORD_RESET_REQUESTED` (on forgot-password, includes email + IP), `USER_PASSWORD_RESET_COMPLETED` (on reset-password, includes IP)
- **Email**: Uses existing `send_password_reset_email()` with `reset_url` override parameter (admin URL differs from portal URL). Falls back to console logging when `RESEND_API_KEY` is not set.
- **OWASP compliance**: Anti-enumeration, rate limiting, high-entropy tokens, hashed token storage, one-time use, token expiry, previous token invalidation, password complexity, session revocation on reset, Argon2id hashing, audit logging, HTTPS transport, generic error messages

### Rate Limiting
- `slowapi` with `get_remote_address` key function
- Auth endpoints: `5/minute` (login, register, reset-password), `3/minute` (forgot-password), `10/minute` (refresh, verify-email)
- Registration endpoints: `10/minute` (individual, company), `5/minute` (bulk, VAT validation)

### CSV Exports
- **Utility**: `app/core/csv_export.py` provides `csv_response()` and `stream_csv_export()`
- Audit + applicant activity exports stream in **1000-row batches** (async generator → `StreamingResponse`)
- Conference-scoped exports (invoices, papers) capped at **50k rows**
- All CSVs include UTF-8 BOM for Excel compatibility
- Used by: alumni.py, audit.py, applicant_activity.py, conferences/exports.py

### Attachment URL Lookups
- **Utility**: `app/core/attachment_urls.py` provides batch and single attachment URL resolution
- `get_latest_attachment_url()` — single entity lookup
- `batch_get_attachment_urls()` — batch lookup using `ROW_NUMBER() OVER (PARTITION BY entity_id)` window function
- Use batch version in list endpoints to avoid N+1 queries
- Used by: cfp/shared.py, cfp_portal/shared.py, program/publish.py

### Pagination
- Committee members: `GET /cfp/committee-members?skip=0&limit=100&conference_id=...` (max 500)
- Response includes `total` count for client-side pagination controls

### CI Coverage
- Backend + frontend HTML coverage reports uploaded as artifacts (14-day retention)
- Backend coverage threshold: 50% (`--cov-fail-under=50` in CI, `fail_under = 50` in pyproject.toml)
- Frontend coverage threshold: 55%

### Testing (`backend/tests/`)
- Uses real PostgreSQL test database (`saasconf_test`) with per-test table truncation for isolation
- `conftest.py` sets env overrides **before** importing app code (`DATABASE_URL`, `JWT_SECRET_KEY`, `RATELIMIT_ENABLED=false`)
- `NullPool` engine avoids asyncpg "attached to a different loop" errors
- RLS bypass: `set_config('app.is_super_admin', 'true', true)` in test sessions
- Redis explicitly initialized/closed in `client` fixture (ASGITransport doesn't trigger FastAPI lifespan)
- Shared fixtures: `tenant`, `conference`, `conferences_module`, `tenant_with_modules`, `super_admin_user`, `tenant_admin_user`, `regular_user`
- Auth helper: `_make_token(user, modules)` creates JWT tokens; `auth_headers(token)` wraps in Bearer header
- Rate limiting disabled globally in tests via `RATELIMIT_ENABLED=false` env var
- 930+ backend tests, all passing

## Development Process

### Steps Documentation
- **Every feature must be planned before implementation** — use plan mode to document the approach, affected files, and execution order
- **Document each step** — when implementing multi-file changes, track progress with todo lists and mark tasks complete as they are done
- **Migration documentation** — every new migration must include a docstring explaining what it does, the `down_revision`, and the `Create Date`

### Testing Requirements
- **Every new feature must include tests** — both backend (pytest) and frontend (vitest) tests are required
- **Backend tests**: Add test cases for new API endpoints, schema validation, and business logic in `backend/tests/`
- **Frontend tests**: Add tests for new hooks, contexts, and components in co-located `__tests__/` directories
- **Modify existing tests** when behavior changes — if a schema adds a new field, update any test asserting on field counts or response shapes
- **Run all tests before committing** — `cd backend && pytest` and `cd frontend && npx vitest run`
- **Never commit with failing tests** — fix the tests first, then commit

### Validation Standards

**Principle**: All validated fields must have matching validation on **both** backend and frontend. Backend is the source of truth; frontend provides immediate UX feedback.

**Backend validators** (`app/core/validators.py`):
- `validate_email(value)` — regex-based email format check, returns lowercase trimmed
- `validate_phone(value)` — `phonenumbers` library, requires international format (+49...), returns E.164
- `validate_website(value)` — URL validation, auto-prepends `https://` if missing, validates hostname has valid TLD
- `validate_vat(value)` — in `app/schemas/location.py`, regex `^[A-Z]{2}[A-Z0-9]{2,12}$`, cleans input (uppercase, strips spaces/hyphens/dots)

**Frontend validators** (`frontend/src/utils/validators.ts`):
- `validateEmail(value)` — same regex as backend, returns error string or null
- `validatePhone(value)` — `libphonenumber-js` library, same rules as backend
- `validateWebsite(value)` — same hostname validation as backend, returns error string or null
- `validateVat(value)` — same regex as backend, returns error string or null
- `normalizeUrl(value)` — prepends `https://` if no scheme, used before saving

**When adding a new validated field**:
1. Add a validator function in `app/core/validators.py` (or reuse existing)
2. Wire it into the Pydantic schema via `@field_validator`
3. Add a matching validator in `frontend/src/utils/validators.ts`
4. In the form component: validate `onBlur`, show inline error below the field, show red border on error, clear error on change, validate all fields before submit
5. Backend tests: test both valid and invalid inputs in the schema/endpoint tests

**Inline field error pattern** (frontend):
- `FieldErrors` interface with nullable string per field name
- `validateField(field, value)` dispatcher mapping field names to validators
- `handleFieldBlur(field, value)` updates `fieldErrors` state on blur
- `validateAllFields()` checks all fields before submit, returns `false` if any errors
- Red border: `border-red-500 dark:border-red-500` when error present
- Error text: `<p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{error}</p>`
- Clear error on change: `if (fieldErrors.field) setFieldErrors(prev => ({ ...prev, field: null }))`

**General rules**:
- Backend validation is authoritative — never trust client input
- Frontend validation is for UX only — always validate at the API boundary
- Use existing validators from `validators.ts` / `validators.py` — don't write ad-hoc regex in components
- Database constraints (nullable, max_length, check) are the last line of defence

## Improvement Progress

### Completed
- [x] HIGH #1: Linting + mypy in CI pipeline
- [x] HIGH #2: Coverage thresholds enforced in CI (backend 50%, frontend 55%)
- [x] HIGH #3: Pinned Docker base image versions (SHA digests)
- [x] HIGH #4: CI concurrency controls
- [x] HIGH #5: Dev environment files (.nvmrc, .python-version, .editorconfig, .env.example)
- [x] MED #6: Pydantic v2 migration complete (all schemas use ConfigDict)
- [x] MED #7: Strengthened mypy config (strict mode, per-module overrides)
- [x] MED #8: VS Code workspace settings + extensions.json
- [x] MED #9: Makefile improved (init, quality, dev-clean, db-reset)
- [x] MED #10: Nginx CSP header strengthened

- [x] LOW #11: Pre-commit hooks (commitlint, hadolint, detect-secrets)
- [x] LOW #12: Centralized domain constants (`app/constants.py`)
- [x] LOW #13: Readiness/liveness probes (`/health` + `/health/ready`)
- [x] LOW #14: Coverage artifacts in CI (HTML reports, 14-day retention)

- [x] CRIT #15: Fixed migration failure masking (removed `|| true` from deploy)
- [x] CRIT #16: Deployment rollback (tag `:previous` images before rebuild)
- [x] CRIT #17: Data retention cleanup scheduled (`POST /ops/data-retention-cleanup` + cron container)
- [x] HIGH #22: CI health check retries (5 attempts, 10s intervals)
- [x] MED #27: Error logging in readiness probe

- [x] HIGH #18: Fixed silent `.catch()` handlers (5 files: ProfilePage, ProgramDesignTab, MessagingTab, useAuthMedia, usePortalAuthMedia)
- [x] HIGH #19: Fixed blocking `resend.Emails.send()` → `asyncio.to_thread()` in `app/core/email.py`
- [x] HIGH #20: Added rate limiting to registration endpoints (10/min individual/company, 5/min bulk/VAT) + verify-email (10/min)
- [x] HIGH #21: Streamed large exports in batches of 1000 rows (audit, applicant activity); added 50k safety limits (invoices, papers)
- [x] HIGH #23: ErrorBoundary already existed wrapping AdminLayout + PortalLayout in App.tsx

- [x] MED #24: Fixed N+1 queries in committee member + applicant list endpoints (`_batch_get_attachment_urls` in shared.py)
- [x] MED #25: Added pagination to committee members endpoint (`skip`/`limit` params, default 100, max 500)
- [x] MED #26: Fixed alt text fallback in ResizableImage (rich text editor images now default to "Embedded image")
- [x] MED #28: Added React.memo to list-rendered components (SessionCard, MemberListRow, ApplicantListRow, LocationItem)

### Round 2 — Complete

## Refactoring Guidelines

When modifying existing files, apply the "boy scout rule" — improve patterns incrementally rather than doing big refactors. The codebase is functional and shipping; duplication is maintenance cost, not a blocker.

### Backend: Completed Refactoring (March 2026)

**Status**: Major DRY refactoring completed. Net reduction: -1,185 lines through pattern extraction and module splitting.

**New Core Utilities**:
- `app/core/attachment_urls.py` — Batch attachment URL lookups to fix N+1 queries
  - `get_latest_attachment_url()` — single entity lookup
  - `batch_get_attachment_urls()` — batch lookup using window functions
  - Used in: cfp/shared.py, cfp_portal/shared.py, program/publish.py
- `app/core/csv_export.py` — Streaming CSV exports with UTF-8 BOM
  - `csv_response()` — in-memory CSV for small exports
  - `stream_csv_export()` — streaming for large exports (1000-row batches)
  - Used in: alumni.py, audit.py, applicant_activity.py, conferences/exports.py

**Refactored Modules**:
- **Registrations** — Split monolithic file (1,189 lines) into focused modules:
  - `registrations/core.py` (676 lines) — Main CRUD operations
  - `registrations/billing.py` (90 lines) — Billing profile endpoints
  - `registrations/items.py` (109 lines) — Add-on item management
  - `registrations/_helpers.py` (211 lines) — Shared utilities
  - `registrations/__init__.py` — Router assembly (uses `router.routes.extend()` pattern to avoid FastAPI empty-prefix conflicts)
- **CFP** — Split papers.py into domain-focused modules:
  - `cfp/cfp_crud.py` — CFP CRUD operations
  - `cfp/paper_assignments.py` — Assignment logic
  - `cfp/paper_cospeakers.py` — Co-speaker management
  - `cfp/paper_reviews.py` — Review operations
  - `cfp/submissions.py` — Submission handling
  - `cfp/__init__.py` — Router assembly with careful ordering (literal paths before catch-all `/{cfp_id}`)

**Remaining Large Files** (working correctly, refactor only when modifying):
- `cfp_portal/papers.py` (1,142 lines)
- `volunteer_tasks.py` (1,004 lines)
- `messaging/threads.py` (962 lines)
- `cfp_portal/messaging.py` (838 lines)

**When touching these files**: Consider extracting shared patterns to utilities or splitting into focused modules following the registrations/CFP pattern above.

### Frontend: Hook Extraction

**Current state**: Only 12 custom hooks; 515 inline `useQuery`/`useMutation` calls across 95 files. Patterns repeated hundreds of times.

**When touching a component with these patterns, extract to hooks**:

1. **Error state** (200+ occurrences) — extract to `useErrorState()`:
   ```tsx
   // Before (repeated everywhere):
   const [error, setError] = useState<string | null>(null);
   // After:
   const { error, setError, clearError } = useErrorState();
   ```

2. **Modal/dialog management** (90+ occurrences) — extract to `useModalState()`:
   ```tsx
   // Before (repeated everywhere):
   const [isAdding, setIsAdding] = useState(false);
   const [editingId, setEditingId] = useState<string | null>(null);
   const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
   // After:
   const { isAdding, editingId, deleteTarget, openAdd, openEdit, openDelete, close } = useModalState<Item>();
   ```

3. **Inline mutations** — when modifying a page, extract to `hooks/api/`:
   ```tsx
   // Before (inline in component):
   const mutation = useMutation({ mutationFn: ... });
   // After (in hooks/api/useSponsorMutations.ts):
   export function useCreateSponsor(conferenceId: string) { ... }
   ```

**Largest components to split when modifying** (not proactively):
- RegistrationTab (1,351 lines) → BookingOptionSelect, AttendeeFields, SessionSelector
- ScreenOverlaysTab (1,204 lines) → OverlayEditor, OverlayPreview, OverlayList
- ProgramGrid (1,144 lines) → GridCell, GridHeader, GridControls

### What NOT to Refactor

- Don't refactor files you're not already modifying for a feature/fix
- Don't split schema files just for size — they're organized by domain and that's fine
- Don't add abstractions for one-time patterns — three similar lines > premature abstraction
- Don't migrate all inline queries to hooks at once — do it file by file as you touch them
- The 17 `TYPE_CHECKING` imports in models are intentional circular dependency mitigation — leave them

## Security Guidelines (OWASP)

Follow these rules when writing new code. The codebase has defense-in-depth patterns — use them consistently.

### SQL Injection Prevention
- **Always** use SQLAlchemy ORM queries or parameterized `text()` with named params — never string concatenation/f-strings in SQL
- Example: `text("SELECT ... WHERE id = :id"), {"id": value}` — never `f"SELECT ... WHERE id = {value}"`

### XSS Prevention
- **Backend**: Sanitize all user-supplied HTML through `sanitize_html()` from `app/core/html_sanitize.py` (uses `nh3`) before storing
- **Frontend**: Every `dangerouslySetInnerHTML` must use `sanitizeHtml()` from `utils/richText.ts` (uses DOMPurify)
- **Never** render raw user HTML without sanitization on either side — defense-in-depth requires both

### Input Validation
- **Pydantic schemas** are the first line of defense — add field constraints (`min_length`, `max_length`, `pattern`, enums) on all new schemas
- **Password validation**: min 8 chars, must contain uppercase + lowercase + digit (enforced in `schemas/user.py`)
- **Email/phone**: Use `validate_email_format()` from `app/core/validators.py` and `phonenumbers` library — never custom regex
- **File uploads**: Always use `validate_upload()` from `app/core/file_validation.py` — it checks magic bytes, MIME whitelist, strips EXIF metadata, and sanitizes filenames (blocks `.php`, `.js`, `.exe`, `.svg`, etc.)

### Field-Level Validation (MUST use when developing)

The project has established validation utilities on both backend and frontend. **Always apply these when adding or modifying forms/fields** — never skip validation or write ad-hoc checks.

**Backend** (`app/core/validators.py`):
- **Email**: `validate_email_format(value)` — regex-based, returns normalized lowercase email or raises `ValidationError`
- **Phone**: `validate_phone(value)` — uses `phonenumbers` library, requires international format (`+49...`)
- **VAT number**: `validate_vat_number(vat_number, country)` — three-stage cascade: python-stdnum → regex fallback → VIES API. Returns `true`/`false`/`null` (uncertain)

**Frontend** (`src/utils/validators.ts`):
- **`validateEmail(value)`** — regex matching backend `EMAIL_RE`. Returns error message or `null`
- **`validatePhone(value)`** — `libphonenumber-js` validation. Returns error message or `null`
- **`isValidPhone(value)`** — boolean wrapper
- **`normalizeUrl(value)`** — auto-prepends `https://` if no protocol. Use on all website/URL fields

**Rules for new forms**:
1. Every **email field** must call `validateEmail()` on blur and show inline error
2. Every **phone field** must call `validatePhone()` on blur and show inline error
3. Every **URL/website field** must use `normalizeUrl()` on blur (field `type="text"`, not `type="url"`)
4. Every **VAT number field** must trigger backend validation on blur when company name + EU country are present
5. All validators accept `string | null | undefined` and treat empty as valid (fields are optional unless marked required)
6. Validation pattern: red border + error message below field on blur, clears on next valid blur

### Authentication & Authorization
- **Protect every new endpoint** with the appropriate dependency: `CurrentUserDep`, `TenantAdminDep`, `SuperAdminDep`, or `require_module(MODULE_CODE)`
- **Conference-scoped endpoints** must call `_check_conference_admin()` or `_resolve_conference()` — never trust client-provided `tenant_id`
- **RLS context** is set automatically via `get_current_user` dependency — don't bypass it
- **Applicant endpoints** use separate auth: `get_current_applicant` with `applicant_access` token type

### Tenant Isolation
- **Every tenant-scoped query** must filter by `tenant_id` — RLS is defense-in-depth, not a replacement for application-level filtering
- **New tables** must have `tenant_id` FK + RLS policy (see migration 001 for policy pattern)
- **Tests**: Verify cross-tenant isolation — a tenant admin must not access another tenant's data

### Secrets & Sensitive Data
- **Never hardcode** secrets, API keys, or passwords — use environment variables via `app/config.py`
- **Password hashing**: Always use `hash_password()` / `verify_password()` from `app/core/security.py` (Argon2id)
- **Refresh tokens**: Store SHA256 hash in DB, return raw token to client once — see `token_hash` pattern in models
- **Logging**: Never log passwords, tokens, or PII — log resource IDs and actions only

### CSRF & CORS
- **CORS origins** are whitelisted in `CORS_ORIGINS` env var — never use `allow_origins=["*"]` with credentials
- **Origin validation middleware** rejects state-changing requests (POST/PUT/PATCH/DELETE) from unknown origins

### Rate Limiting
- **All new auth/registration endpoints** must have rate limits via `@limiter.limit()` decorator
- Suggested defaults: `5/minute` for auth, `10/minute` for CRUD, `3/minute` for sensitive operations (forgot-password, bulk actions)

### Security Headers
- CSP, HSTS, X-Frame-Options, X-Content-Type-Options are set via `SecurityHeadersMiddleware` (backend) and nginx — don't weaken them
- New API responses inherit headers automatically — no action needed

### Dependency Security
- **Adding a new dependency**: Pin exact version in `requirements.txt` / `package.json` — CI runs `pip-audit` and `npm audit`
- **Dockerfile images**: Pin to SHA digest, not floating tags

### CI Fixes (Round 3)
- [x] Fixed all ruff lint/format violations across 209 backend files
- [x] Fixed all mypy type errors: relaxed strict config, excluded migrations, added per-module API overrides
- [x] Fixed 5 test failures: rate limiting disabled in tests, JWT tampering test (flip middle char), Redis init in client fixture
- [x] Fixed cross-tenant isolation test: enabled conferences module for tenant so JWT includes module claim
- [x] CI fully green: Secrets Scan, Backend Tests (ruff + mypy + 745 tests), Frontend Tests, Security Audit
- [x] Fixed staging deploy: added `--no-deps` + `--wait` to deploy step
- [x] Upgraded staging PostgreSQL 15→16 via automated dump/restore (`upgrade-pg16.sh`)
- [x] Fixed nginx crash-loop: `envsubst` SHELL-FORMAT was shell-expanded before reaching envsubst (`"$$DOMAIN"` → `"$DOMAIN"` → expanded value). Fixed with `"\$$DOMAIN"` escaping.
- [x] Added deploy diagnostics: container status, backend/nginx logs, local health check, verbose HTTP codes
- [x] Full pipeline green: all 6 jobs pass (Backend Tests, Frontend Tests, Security Audit, Secrets Scan, Deploy, E2E Tests)
