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
- **Last completed** (2026-04-18, pushed): **GDPR Art. 15 / 17 Phase 1 plumbing**. Three migrations (200 hashes across 9 tables, 201 `privacy_requests` table + RLS + GIN, 202 `audit_logs.subject_email_hash`). `@validates` hooks auto-hash on assignment. `PrivacyRequest` model + `BaseService.create_audit_log(subject_email_hash=...)`. `scripts/export_subject_data.build_export()` returns `(zip_bytes, manifest_dict)` via a 15-entry LOOKUPS list. Handbooks (conferences + trainings) document controller/processor, HGB §257 retention, per-right UI paths.
- **In progress — pending commit approval**: **GDPR Phase 2 — admin-side Privacy Requests UI** + portal stopgap. Backend: new `app/api/v1/privacy_requests.py` router with 7 endpoints (list/create/detail/approve/reject/generate-export/download), all `TenantAdminDep`-gated, rate-limited `@tenant_limiter.limit("10/hour")` on generate-export, 7-day download expiry → 410 Gone. Raised `subject_emails` cap 10→25. New audit constants `PRIVACY_REQUEST_VIEW` + `PRIVACY_REQUEST_EXPORT_DOWNLOAD`. New schemas `PrivacyRequestListItem` / `PrivacyRequestReject` / `GenerateExportResponse`. Wired into `router.py` under `/privacy-requests`. 14 new endpoint tests in `test_gdpr_phase2.py`. Frontend admin: new third tab **Privacy Requests** under MyCompany — `PrivacyRequestsTab`, `PrivacyRequestDetailPanel` (amber 21-day deadline warning, Approve/Generate/Reject/Download via `api.get(..., { responseType: 'arraybuffer' })` Blob), `NewPrivacyRequestModal` (tag-chip, max 25), `RejectPrivacyRequestModal`. 5 new vitest cases in `__tests__/PrivacyRequestsTab.test.tsx`. Handbook `dsgvoCompliance.tsx` + `trainingDsgvoCompliance.tsx` flipped — "Phase 2 planned" → "live today"; added new **"Handling a subject request"** procedural section (channels, identity verification, one-month window, standard workflow, when to say no). Portal stopgap: new dedicated **Privacy** route at `/portal/:conferenceId/privacy` (sidebar → Account → Privacy, ShieldIcon). `pages/portal/PrivacyPage.tsx` wraps `components/portal/DataRightsPanel.tsx` — always-expanded page listing the six GDPR rights in plain language, pointing subjects at the event's Privacy Policy for organizer contact (Phase 4 still owns actual portal self-service buttons). Own route chosen over a Profile-page panel to avoid growing the already-warn-threshold ProfilePage.tsx. 4 vitest cases in `__tests__/DataRightsPanel.test.tsx`. All checks green: mypy, ruff, pytest 2888 passed + 56 skipped, frontend tsc + eslint (only pre-existing max-lines warnings on App.tsx + PortalLayout.tsx), vitest 1826 passed.
- **Next up after commit**: (1) Deploy Phase 2 to staging — no migration needed (Phase 1's 200-202 already ship every field used). (2) **Phase 3** — erasure *execution* step: preview the rows to be deleted/anonymised, per-category choice, auto-skip in-retention invoices, then commit. (3) **Phase 4** — portal self-service (My Data → Export / Request deletion / Consent log). (4) Production PII wiring + backfill (staging-template fix for the docker-compose `PII_ENCRYPTION_KEY` gap) once prod env is cut. (5) Rotate staging `PII_ENCRYPTION_KEY` — it leaked into a terminal `tail/sed` earlier.
- **Status**: Local main ahead of origin/main by 1 commit pending (this GDPR Phase 2 bundle).
