# SaaSConf Project Notes

## What This Is

SaaSConf is a **multi-tenant SaaS platform** for conference and training management. Each tenant manages conferences (CFPs, registrations, sponsors, programs) and trainings (program years, placements, offers, invoices, attendees, parking lot, registration portal) — isolated via PostgreSQL Row-Level Security (RLS). **Performance is essential**.

## Development Workflow

**ALWAYS follow this process in order — no skipping:**

1. **Plan First** — Use plan mode for non-trivial features. Get user approval before implementing.
2. **Develop + Write Tests** — Backend: pytest in `backend/tests/`. Frontend: vitest in `__tests__/` dirs.
3. **Run Feature Tests** — `cd backend && venv/bin/python -m pytest tests/test_<feature>.py -v`. Fix failures before proceeding.
4. **Run mypy** — `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`. **MANDATORY — CI rejects type errors.**
5. **Run Ruff** — `cd backend && ruff check app/ && ruff format --check app/`. **MANDATORY — CI rejects unformatted code.**
6. **Run Frontend checks** — `cd frontend && npx tsc --noEmit && npx eslint src/`. **MANDATORY.**
7. **Run Complete Test Suite** — `cd backend && venv/bin/python -m pytest tests/ -v` + `cd frontend && npm run test`. Fix ALL failures.
8. **Update In-App Handbook** — Update `frontend/src/pages/Handbook/handbookSections.tsx` for any UI/behaviour changes visible to users.
9. **Ask Before Commit** — Do NOT automatically commit. User approval required.
10. **Commit + Push** — Conventional commits (`feat:`, `fix:`, `refactor:`). Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>. Push to main triggers staging deploy.

## Architecture
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (port 8000)
- **Frontend**: React + TypeScript + TanStack Query + Tailwind CSS (port 3000)
- **Migrations**: Alembic (sequential: `001_`, `002_`, etc.) — commit migration files alongside code changes
- **Multi-tenancy**: Shared DB, shared schema, RLS isolation (`tenant_id` on every table)
- **Async throughout**: `AsyncSession`, `asyncio.to_thread()` for blocking I/O, async generators for streaming

## Performance Rules

### Backend
- **No N+1 queries** — use `joinedload()`, `selectinload()`, or `batch_get_attachment_urls()`
- **Paginate list endpoints** — `skip`/`limit` with defaults (100) and max (500)
- **Async I/O** — never block the event loop; wrap with `asyncio.to_thread()` if needed
- **Stream large exports** — `StreamingResponse` in 1,000-row batches; cap at 50k rows
- **Index new columns** in WHERE/JOIN/ORDER BY — especially `tenant_id`, `conference_id`, `status`, FKs

### Frontend
- **`React.memo`** on list-rendered components
- **`useMemo`/`useCallback`** for expensive computations and stable references
- **Appropriate `staleTime`** — `0` for fresh data, longer for stable data
- **Lazy load routes** — `React.lazy()` with code splitting
- **Avoid re-renders** — don't create objects/arrays inline in render

## Dark Mode Rules
- **Class-based** — `.dark` class on `<html>`, managed by ThemeContext
- **Color mapping**: `bg-white`→`dark:bg-gray-800`, `bg-gray-50`→`dark:bg-gray-900`, `bg-gray-100`→`dark:bg-gray-800`, `text-gray-900`→`dark:text-gray-100`, `text-gray-700`→`dark:text-gray-300`, `text-gray-600`→`dark:text-gray-300` (NOT gray-400), `text-gray-500`→`dark:text-gray-400`, `border-gray-200`→`dark:border-gray-700`, `border-gray-300`→`dark:border-gray-600`, `hover:bg-gray-50`→`dark:hover:bg-gray-700`
- **Form inputs**: `dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100`
- **Semantic colors**: `/30` opacity in dark: `bg-red-50`→`dark:bg-red-900/30`
- **New components must include `dark:` variants**

## Responsive Design (Portal)
- Portal = mobile-friendly. Admin = desktop-first.
- Breakpoints: `sm:` (640px) for stacking, `lg:` (1024px) for sidebar. Skip `md:` unless needed.
- Touch targets: `min-h-[44px]`. Always `flex-wrap` on button groups. Avoid fixed widths in portal.

## Key Conventions
- **Pydantic v2** — `model_config = ConfigDict(from_attributes=True)`. No legacy `class Config:`.
- **Security essentials** — See `.claude/docs/security.md` for full OWASP guidelines. Key rules:
  - SQLAlchemy ORM or parameterized queries only (no f-strings in SQL)
  - Sanitize HTML: backend `sanitize_html()` (nh3) + frontend `sanitizeHtml()` (DOMPurify)
  - Protect endpoints: `CurrentUserDep`, `TenantAdminDep`, `SuperAdminDep`, or `require_module()`
  - New tables: `tenant_id` FK + RLS policy
  - File uploads: `validate_upload()` from `app/core/file_validation.py`
- **Validation** — Use `validators.ts` / `validators.py` functions. Never write ad-hoc regex.
- **Country fields** — Always `<select>` dropdown with `COUNTRY_OPTIONS`. Store ISO codes.
- **VAT fields** — Always use `<VatNumberInput>` component.

## Extended Documentation

Detailed docs are in `.claude/docs/` — read on-demand when working on specific areas:
- **`modules.md`** — Registration, Screen Overlays, Booking, Volunteers, Alumni, Deadlines, Sponsor Contracts
- **`invoices.md`** — Invoice PDF generation, number generation, settings, frontend
- **`security.md`** — Full OWASP guidelines, field validation patterns, auth/authz rules
- **`devops.md`** — CI/CD, Docker, Nginx, testing config, email, rate limiting, CSV exports
- **`auth-flows.md`** — User invite flow, admin password reset
- **`refactoring.md`** — Refactoring guidelines, improvement progress, hook extraction patterns
- **`trainings.md`** — Training module architecture, file structure, invoice/offer/attendee flows

## Session Continuity

**After every response**, keep this section updated with current work state.

### Current Work State
- **In progress — pending commit approval**: Unified user-view redesign (conferences + trainings) for structural + visual parity.
  - **Scope**: both the CFP Applicant form (Conferences → Users) and the training attendee detail (Trainings → Users) now share a common layout — header with avatar + status chip, then a tab bar with Profile / Activity / (Papers or Registrations), then a sectioned form inside Profile.
  - **New shared primitives** (`frontend/src/components/userDetail/`):
    - `UserDetailHeader.tsx` — avatar (img or initials), name, email, status chip (active/inactive/parked/neutral), optional primary action (e.g. Reactivate).
    - `TabBar.tsx` — generic tab bar with labels + optional counts, typed via `TabDescriptor<T>`.
    - `FormSection.tsx` — card wrapper with optional heading + description, used for each form section.
    - `BackLink.tsx` — shared "Back to users" link.
  - **Training side** (`frontend/src/pages/Trainings/tabs/UsersTab/UserDetailPanel/`):
    - Deleted `DetailTabs.tsx`, `UserDetailHeader.tsx`, `ActivityHistory.tsx`, `ProfileFormFields.tsx`.
    - New sub-folder `profile/` with `IdentitySection.tsx`, `AddressSection.tsx`, `BioSection.tsx`.
    - `index.tsx` rewired to three tabs — **Profile** (Media → Identity → Address → Bio + Save), **Activity** (PortalAccountSection + CustomerTimelineCard — unified timeline replaces training-only event list), **Registrations** (RegistrationsList + OfferLinksTable).
    - `types.ts`: dropped the old `DetailTab` union (now local to `index.tsx`).
  - **CFP side** (`frontend/src/pages/modules/cfp/CFPApplicants/ApplicantForm/index.tsx`):
    - Added UserDetailHeader + TabBar around the form; three tabs — **Profile** (Media → Identity → Address → Account → Bio → Roles → Social → Preferences → FormActions), **Activity** (PortalAccountCard + CustomerTimelineCard, moved from inline position), **Papers** (ApplicantPapers, moved from parent).
    - Parent `CFPApplicants/index.tsx` no longer renders `ApplicantPapers` as a sibling — it's now inside the form under the Papers tab.
  - **Handbook** (`frontend/src/pages/Handbook/sections/people.tsx`): new "User View (unified layout)" block documents the shared header + Profile/Activity/(Papers|Registrations) tabs so admins know the layout is consistent across modules.
  - **Verification**: `tsc --noEmit` clean; `eslint` clean on touched folders (one pre-existing `max-lines` warning on the CFP list file, unchanged by this refactor); `vitest` = 1864/1864; backend untouched (no `.py` file changed).
  - **Status**: uncommitted — `git status` shows 8 M/D files + new `frontend/src/components/userDetail/` + new `frontend/.../UserDetailPanel/profile/`. **Ask user before committing**.

- **Committed** (`55e72ec`): Conference-side customer events (CFP paper lifecycle + conference registrations + merge company meta).
  - Builds on Phases 2–6 of the unified customer architecture (already on `origin/main`: Phase 5 = `7dda83c`, Phase 6 = `7636315`) and the CFP Applicant Portal Account panel (previous uncommitted step).
  - **No DB migration needed** — `customer_events.event_type` is `String(60)` (accepts new enum string values) and `meta` is `JSONB` (accepts new keys). Just new enum values + writers + UI formatting.
  - **Backend writers**:
    - CFP papers (`backend/app/api/v1/cfp/shared.py`): new `_record_paper_customer_event(paper, event_type, ...)` helper. Dedupes `main_speaker` + `cospeaker_associations` by `applicant.id`, skips applicants with missing `email_hash`, emits one `customer_events` row per speaker with `domain="cfp"`, `related_entity_type="cfp_paper"`, `meta={paper_id, paper_title, conference_name}`.
    - Paper submit (`cfp/papers.py` applicant submit path) → `CustomerEventType.CFP_SUBMITTED`.
    - Paper unsubmit → `CFP_WITHDRAWN`.
    - Admin paper status transitions (via `_CFP_EVENT_BY_STATUS` dispatch): `ACCEPTED` → `CFP_ACCEPTED`; `REJECTED` → `CFP_REJECTED`; `DRAFT` (from submitted) → `CFP_WITHDRAWN`. Intermediate review states emit nothing.
    - Registrations (`backend/app/api/v1/registrations/core.py`):
      - `create_registration`: per-attendee, after `db.flush()`, emits `REGISTRATION_REGISTERED` with `portal_user_id=None`, `subject_email_hash=reg.email_hash` (auto-populated by `@validates("email")`), meta `{registration_id, conference_name, booking_option_name, company_name}`.
      - `update_registration`: captures `old_status` before setattr loop; emits `REGISTRATION_CANCELLED` only on actual status transition to `CANCELLED`.
    - Merge (`backend/app/api/v1/portal_users/access.py`): captures `source.company` + `target.company` before merge, adds `source_company`, `target_company`, `company_changed: bool` to the existing `portal.merged_into` meta.
  - **Frontend**:
    - `UsersTab/constants.ts`: `EVENT_LABELS` relabeled to "Paper submitted/accepted/rejected/withdrawn" + "Registered (conference)" + "Registration cancelled"; added `cfp.withdrawn`; renamed `registration.created` → `registration.registered`. Colors mirrored in `EVENT_COLORS`.
    - `UsersTab/HistoryPanel.tsx`: new `buildMetaLines(entry)` helper with typed `str(meta, key)` lookup. Renders CFP meta (`Paper: …` / `Conference: …`), Registration meta (`Conference` / `Booking` / `Company`), and merge company transition (`Company: {src} → {tgt}`) when `portal.merged_into` meta has `company_changed === true`. Rendered as `<ul>` below `entry.notes`.
    - New reusable component `frontend/src/components/CustomerTimelineCard.tsx` — wraps `HistoryPanel` with a card header ("Activity"); rendered below `PortalAccountCard` in `pages/modules/cfp/CFPApplicants/ApplicantForm/index.tsx` so admins see the full unified timeline inline on the CFP Applicant form (same data as My Company → Users → History).
    - Handbook (`frontend/src/pages/Handbook/sections/people.tsx`) — CFP Portal Users section describes the unified customer timeline across Portal / Training / CFP / Registration domains, notes the company transition line on merges, and the inline **Activity** card on the applicant form.
  - **New tests**:
    - Backend: `backend/tests/test_customer_events_conference.py` — 8 tests across 3 classes. `TestCFPPaperEvents`: submit with main + 2 cospeakers (3 rows); accept with 1 cospeaker (2 rows); reject single row; unsubmit emits `cfp.withdrawn`. `TestRegistrationEvents`: create via POST + cancel via PUT, both with booking + company meta. `TestMergeCompanyMeta`: differing companies sets `company_changed=true` + source/target names; same companies sets `company_changed=false`.
    - Frontend: `frontend/src/pages/MyCompany/__tests__/UsersTab.test.tsx` — 3 new history-rendering tests for CFP paper submission meta, registration booking/company meta, and merge company-change transition.
  - **Backfill for existing data**:
    - New `backend/scripts/backfill_conference_customer_events.py` — emits `cfp.submitted` + terminal (`cfp.accepted` / `cfp.rejected`) rows for every existing CFPPaper (main + cospeakers deduped, skipping missing `email_hash`), and `registration.registered` + optional `registration.cancelled` rows for every existing Registration. Idempotent: loads existing `(subject_email_hash, event_type, related_entity_id)` keys per tenant+domain and skips them, so re-runs are no-ops. Uses `SELECT set_config('app.is_super_admin', 'true', true)` (SET LOCAL does not support bound parameters).
    - Run once per deploy: `cd backend && venv/bin/python -m scripts.backfill_conference_customer_events`. Confirmed on dev DB: **first run** inserted `cfp=124 + reg=6`, **second run** `cfp=0/skipped=124, reg=0/skipped=6`. Coverage jumped from 2 of 44 portal users with events → **41 of 44**.
    - New test: `backend/tests/test_backfill_conference_customer_events.py` — 6 tests (accepted/rejected/pure-draft/idempotent for CFP; registered+cancelled/paid-only for registrations).
- **Verification (all green)**: `mypy app/` clean (675 files); `ruff check` / `ruff format --check` clean on all touched files + scripts; `tsc --noEmit` clean; `eslint` clean on touched frontend files; backend `pytest tests/test_backfill_conference_customer_events.py tests/test_customer_events_conference.py tests/test_customer_events.py tests/test_customer_event_service.py tests/test_portal_users_admin.py tests/test_cfp_admin_deep.py tests/test_registration.py` = 151/151; frontend `vitest` on `PortalAccountCard.test.tsx` = 3/3 (historical UsersTab + MergeDialog tests untouched by this step).
- **Status**: uncommitted — see `git status` — **ask user before committing**. Backfill script must be run on staging after deploy: `cd backend && venv/bin/python -m scripts.backfill_conference_customer_events`.
- **Follow-ups on the plan**: migration 206 dropping `portal_user_history` (one release later); messaging writer wire-up (deferred).
