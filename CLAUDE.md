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
- **Last completed** (2026-04-19, pushed): **GDPR Phase 2 — admin-side Privacy Requests UI + portal stopgap**. New `privacy_requests.py` router (list/create/detail/approve/reject/generate-export/download), tenant-admin gated, rate-limited 10/hour on generate-export, 7-day download → 410 Gone. `subject_emails` cap 25. MyCompany tab + `PrivacyRequestsTab` / `PrivacyRequestDetailPanel` / `NewPrivacyRequestModal` / `RejectPrivacyRequestModal`. Handbook "Phase 2 planned" → "live today" on conferences + trainings; new "Handling a subject request" procedural section. Portal `/portal/:conferenceId/privacy` page.
- **In progress — pending commit approval**: **GDPR Phase 3 — erasure execution**. New shared catalogue `backend/app/core/gdpr/lookups.py` lifts the 15-entry `LOOKUPS` out of `scripts/export_subject_data.py` and adds per-table `erasure_default` + `allowed_actions: frozenset` policy; invoices locked at skip (HGB §257), billing-profiles promoted to locked-skip at preview time if any invoice is retained, users/portal_users/trainers/customers default anonymize, everything else deletes. New service `backend/app/core/gdpr/erasure.py` exposes `build_preview` + `execute_erasure` — anonymise-first then delete-in-dependency-order (`_DELETE_ORDER`: applicant_activity_logs → email_logs → offer_attendees → training_registration_attendees → training_registrations → training_attendees → registrations → alumni → cfp_applicants → billing_profiles → customers → trainers → portal_users → users → invoices). Caller owns the transaction. Two new endpoints on `privacy_requests.py`: `POST /{id}/preview-erasure` (read-only) + `POST /{id}/execute-erasure` rate-limited `@tenant_limiter.limit("5/hour")` — writes the `PRIVACY_REQUEST_EXECUTE_ERASURE` audit row *before* executing so a rollback scrubs the audit entry too, then flips status to COMPLETED and stores `execution_manifest = {erasure: manifest, executed_at: iso}`. New schemas: `ErasureTableEntrySchema`, `ErasurePreviewResponse`, `ErasureExecuteRequest`, `ErasureManifestEntrySchema`, `ErasureExecuteResponse`. 9 new tests in `tests/test_gdpr_phase3.py` (preview shape, locked-invoice preview, happy path execute, unknown-action 422, approved-status gate, cross-tenant isolation). Frontend: `frontend/src/pages/MyCompany/ExecuteErasureModal.tsx` — per-table preview table (Table / Rows / Action radios / Note), defaults from `default_action`, radios disabled when `isLocked = allowed_actions.length <= 1`, small "locked" badge, summary strip, red type-to-confirm `ERASE` input gates execute. Wired into `PrivacyRequestDetailPanel.tsx` as an "Execute erasure" red button visible when status=approved + type=erasure. New types in `types.ts` (`ErasureAction`, `ErasureTableEntry`, `ErasurePreviewResponse`, `ErasureManifestEntry`, `ErasureExecuteResponse`) + `queryKeys.privacyRequests.preview(id)` factory. 5 new vitest cases (`__tests__/ExecuteErasureModal.test.tsx`). Handbook `dsgvoCompliance.tsx` + `trainingDsgvoCompliance.tsx` flipped — "Phase 3 (planned)" → "live today"; Art. 17 bullets now document per-category chooser, invoice skip rule, type-to-confirm barrier, and 5/hour rate limit. All checks green: backend full suite 2897 passed + 56 skipped (17:40), frontend tsc + eslint (0 errors, only pre-existing max-lines warnings), vitest 1835 passed. No migration needed.
- **Next up after commit**: (1) Deploy Phase 3 to staging and manually dry-run an erasure against a disposable subject (seed 1 user + 1 registration + 1 paid invoice, verify registration row gone, invoice row intact, user row anonymised with `first_name='Erased'` + `email_hash IS NULL`, audit log has the table→action map). (2) **Phase 4** — portal self-service (My Data → Export / Request deletion / Consent log) — the portal `/privacy` page currently just describes rights; Phase 4 adds actual self-serve buttons that round-trip to the admin Privacy Requests queue. (3) Production PII wiring + backfill (fix staging-template docker-compose `PII_ENCRYPTION_KEY` gap) once prod env is cut. (4) Rotate staging `PII_ENCRYPTION_KEY` — it leaked into a terminal `tail/sed` earlier.
- **Status**: Local main ahead of origin/main by 1 commit pending (this GDPR Phase 3 bundle).
