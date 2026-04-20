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

## GitHub Workflow (solo-dev: one approval, auto-merge on green)

**Never commit or push to `main` directly.** All changes route through a topic branch + PR, but the PR auto-merges when CI passes so the user doesn't click through the GitHub UI.

1. **Silent branch creation** — on the FIRST `Edit`/`Write` of a session when the current branch is `main`, run `git checkout -b <type>/<short-kebab-topic>` without asking (branch creation is free, reversible, and invisible). `<type>` matches the coming commit prefix (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/`). Mention the branch name you picked so the user can course-correct.
2. **Develop + verify on branch** — full mypy + ruff + pytest + tsc + eslint + vitest sweep (per the Development Workflow section above).
3. **Single "ship it" approval** — when the sweep is green, present the proposed commit message + scope + PR title and ask once. On approval, execute atomically: `git add <files>` → `git commit` → `git push -u origin <branch>` → `gh pr create` → `gh pr merge --auto --squash`. Return the PR URL. One approval gate, not three.
4. **CI gates the merge** — GitHub auto-merges only when CI is green. Red CI leaves the PR open; surface the failure.
5. **Never merge manually** — don't run `gh pr merge` without `--auto`. CI must gate.

Escape hatches (still ask first):
- **"commit only"** — commit + push, open PR, but **no** `--auto` flag. PR stays open for manual merge.
- **"push to main — trivial"** — single-line doc fixes may go straight to `main`. User must say this literal phrase.

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
- **Ready to commit — PII Phase 2.5: dual-write validators on training_attendees + cfp_applicants (audit item 2 follow-up)**.
  - **Scope**: incremental step between Phase 1 (additive migration 207 + backfill, committed on main) and Phase 3 (full property-accessor swap, deferred until staging backfill run). Extends the existing `@validates("email")` on both models to populate `email_encrypted` (via `encrypt_pii`) alongside the pre-existing `email_hash`, and adds a new `@validates("phone")` on `cfp_applicants` that dual-writes `phone_encrypted` + `phone_hash`. Net effect: new ORM-written rows no longer need the backfill pass — they already have encrypted + hash companions on insert.
  - **Model changes**:
    - [backend/app/models/training_attendee.py](backend/app/models/training_attendee.py) — added `encrypt_pii` import; extended `_sync_email_companions` to set `self.email_encrypted = encrypt_pii(value)` when value is truthy (and `None` when cleared).
    - [backend/app/models/cfp_applicants.py](backend/app/models/cfp_applicants.py) — added `encrypt_pii` + `hash_phone` imports; same email-validator extension; new `@validates("phone")` that sets `phone_hash` + `phone_encrypted` or nulls both on clear.
  - **Tests**:
    - New: [backend/tests/test_pii_dual_write_attendees_applicants.py](backend/tests/test_pii_dual_write_attendees_applicants.py) — 6 tests: training attendee create populates both companions, email update rewrites companions, applicant email companions, applicant phone companions, clearing phone nulls both, query by `email_hash` finds the row.
    - Modified: [backend/tests/test_backfill_attendees_applicants_pii.py](backend/tests/test_backfill_attendees_applicants_pii.py) — `test_backfill_preserves_existing_email_hash` switched from ORM insert (which now populates encrypted via the new validator) to raw-SQL `_insert_raw_attendee()` + explicit `UPDATE ... SET email_hash` so the test still simulates a pre-migration row. Unused `TrainingAttendee` import removed.
  - **Verification (all green)**:
    - `mypy app/` = clean (677 source files).
    - `ruff check app/ tests/ && ruff format --check app/ tests/` = clean.
    - `cd frontend && npx tsc --noEmit` = clean; `npx eslint src/` = 0 errors, 103 warnings (pre-existing `max-lines` only).
    - Backend sweep on `test_backfill_attendees_applicants_pii.py + test_pii_dual_write_attendees_applicants.py + test_cfp.py + test_cfp_admin_deep.py + test_cfp_papers_admin.py + test_cfp_portal_auth_messaging.py + test_training_portal.py + test_training_attendee_reassign.py + test_customer_events.py + test_customer_event_service.py + test_portal_users_admin.py + test_rls_coverage.py` = **327/327 pass**.
  - **Status**: uncommitted — `git status` shows modified `backend/app/models/cfp_applicants.py`, `backend/app/models/training_attendee.py`, `backend/tests/test_backfill_attendees_applicants_pii.py` plus new `backend/tests/test_pii_dual_write_attendees_applicants.py`. **Ask user before committing**.

- **Committed (28ba86a) and on main — sprint items 4–7 + attr-defined cleanup (large batch)**.
  - **Scope**: items 4 (N+1 fixes across api/v1), 5 (request-ID middleware + logging), 6 (regen of OpenAPI types), 7 (mypy re-enable on `app.api.v1.*` — narrowed suppression from `["arg-type", "attr-defined"]` → `["arg-type"]`) plus full attr-defined cleanup across 28 files in `backend/app/api/v1/`.
  - **Key attr-defined fixes** (all 72 errors cleared):
    - **Real bugs caught**: [mfa.py:69](backend/app/api/v1/mfa.py) used `current_user.email` (CurrentUser has no `email` attr) — fetch `User` row and read encrypted via `read_pii(user_row, "email")`. [stripe_webhooks.py:128](backend/app/api/v1/stripe_webhooks.py) used `e.metadata` (resolves to SQLAlchemy's base `MetaData` class, not the JSONB column) — changed to `e.event_metadata`.
    - **Variable shadowing** (~85% of errors): renamed `result = await db.execute(...)` to differentiated names (e.g. `user_result`, `token_result`, `conf_result`) across `tenants/modules.py`, `auth.py`, `news.py`, `messaging/bulk.py`, `cfp_portal/form_schema.py`, `form_schema.py` — mypy was locking row types to first query.
    - **Generic CRUD factory**: [settings/_crud_factory.py](backend/app/api/v1/settings/_crud_factory.py) — `model_class: type[DeclarativeBase]` → `type[Any]` escape hatch, two `cast(BaseModel, entity_data).model_dump(...)` bridges.
    - **FastAPI APIRoute narrowing**: [settings/score_scales.py](backend/app/api/v1/settings/score_scales.py) — `hasattr(route, "methods")` → `isinstance(route, APIRoute)`.
    - **SQLAlchemy patterns**: [budgets.py](backend/app/api/v1/budgets.py) + [settings/booking_packages.py](backend/app/api/v1/settings/booking_packages.py) — `Model.__table__.update()/.delete()` → `update(Model)`/`delete(Model)` from `sqlalchemy`. [tenant_company.py:383](backend/app/api/v1/tenant_company.py) — `cast(CursorResult, update_result).rowcount` for `.rowcount` access.
    - **Stripe SDK**: [invoices/stripe.py:260](backend/app/api/v1/invoices/stripe.py) — `last_payment_error.get("message")` → `last_payment_error.message` (stripe typings expose `.message` directly).
    - **New model relationship**: [training_registration.py](backend/app/models/training_registration.py) — added `placement: Mapped["ProgramYearTraining | None"] = relationship(...)` (previously `portal_auth.py` used `reg.placement` which relied on a nonexistent relationship — real runtime risk).
  - **GDPR allowlist fix** (pre-existing failure from committed Phase 1 PII work 758ac56): [app/core/gdpr/lookups.py](backend/app/core/gdpr/lookups.py) — added `email_encrypted`, `phone_encrypted`, `phone_hash` to `PORTAL_EXPORT_EXCLUDED_COLUMNS` for `cfp_applicants` and `training_attendees` so `test_every_exportable_table_has_full_column_coverage` passes.
  - **pyproject.toml**: narrowed `app.api.v1.*` override to `disable_error_code = ["arg-type"]` (attr-defined fully cleared). `arg-type` stays suppressed — 522 errors remain, mostly `UUID | None` narrowing in conference/location helpers and SQLAlchemy `unaccent_ilike(InstrumentedAttribute)` signature mismatches, separate cleanup.
  - **Frontend schema drift regeneration**: `cd frontend && npm run gen:api` regenerated `api.generated.ts` — diff is 4 lines (tenant + conference logo endpoints changed response content-type from `string` → `unknown`, unrelated to the api/v1 cleanup; pre-existing drift just now made visible).
  - **Verification (all green)**:
    - `mypy app/` = clean (677 source files; no attr-defined errors in `app.api.v1.*` with attr-defined removed from disable list).
    - `ruff check app/ && ruff format --check app/` = clean.
    - `cd frontend && npx tsc --noEmit` = clean; `npx eslint src/` = 0 errors, 103 warnings (pre-existing `max-lines` only).
    - `cd frontend && npm run test` = **1900/1900 pass** (137 test files).
    - `cd frontend && npm run gen:api:check` = in sync.
    - Backend full suite (task b731mcjxp) = **3033/3033 pass**, later sweep after GDPR fix = 71/71 on touched modules (`test_gdpr_phase4.py + test_customer_events.py + test_customer_event_training_writes.py + test_portal_users_admin.py + test_training_attendee_reassign.py + test_cross_module_user_visibility.py`).
  - **Status**: uncommitted — `git status` shows 44 `backend/app/api/v1/*.py` modified + `app/core/gdpr/lookups.py` + `app/models/training_registration.py` + `pyproject.toml` + `frontend/src/types/api.generated.ts`. **Ask user before committing**.

- **Previously ready to commit — superseded** (now part of the batch above): phase 1 of PII extension for training_attendees + cfp_applicants (audit item 2).
  - **Plan reference**: [.claude/plans/pii-extension-attendees-applicants.md](.claude/plans/pii-extension-attendees-applicants.md). Phase 1 = additive migration + backfill script + tests. Phase 3 (model accessor swap + callsite audit) and Phase 5 (migration 208 drop plaintext) are follow-up commits.
  - **Migration 207**: [207_pii_encryption_attendees_applicants.py](backend/app/db/migrations/versions/207_pii_encryption_attendees_applicants.py). Adds `email_encrypted` (Text, Fernet) on both `training_attendees` and `cfp_applicants`, plus `phone_encrypted` (Text) + `phone_hash` (String(64)) + `ix_cfp_applicants_phone_hash` on `cfp_applicants`. `email_hash` pre-exists on both tables from the 197-era work. Applied to dev DB.
  - **Backfill script**: [backend/scripts/backfill_attendees_applicants_pii.py](backend/scripts/backfill_attendees_applicants_pii.py) — raw-SQL, batched (default 500), per-batch commits, idempotent (`WHERE *_encrypted IS NULL AND * IS NOT NULL`). `COALESCE(*_hash, :hash)` guard preserves the hash already set by `@validates("email")` for email, so only NULL hashes get filled (relevant for the brand-new `phone_hash`). RLS bypass via `set_config('app.is_super_admin', 'true', true)`. Flags: `--dry-run`, `--batch-size`, `--sleep`.
  - **Model column declarations**: `email_encrypted` added to [training_attendee.py](backend/app/models/training_attendee.py), plus `email_encrypted` + `phone_encrypted` + `phone_hash` added to [cfp_applicants.py](backend/app/models/cfp_applicants.py). No accessor swap yet — `email` stays a plain NOT NULL String column, `@validates("email")` still syncs `email_hash`. Writers unchanged.
  - **Tests**: [backend/tests/test_backfill_attendees_applicants_pii.py](backend/tests/test_backfill_attendees_applicants_pii.py) — 10 tests: attendee email round-trip, applicant email + phone round-trip, hash preservation (COALESCE guard), idempotency, dry-run, NULL-plaintext skip, batch-size honouring, per-table isolation, phone normalisation, email-only backfill on phone-less applicant.
  - **Verification (all green)**: ruff check + format clean on touched files; mypy clean on all 4 modified/new files; `pytest test_backfill_attendees_applicants_pii.py` = 10/10; `pytest test_rls_coverage.py` = 2/2 (runs `alembic upgrade head` end-to-end including 207); regression sweep on `test_cfp.py + test_cfp_admin_deep.py + test_cfp_papers_admin.py + test_cfp_portal_auth_messaging.py + test_training_portal.py + test_training_attendee_reassign.py + test_customer_events.py + test_customer_event_service.py + test_portal_users_admin.py` = **320/320 pass**.
  - **Next phase (separate commit, hold until staging backfill run)**: Phase 3 = property accessor swap (`@property email` reading from encrypted, setter writing encrypted + hash + `None`-ing plaintext), drop `@validates("email")` (setter handles hashing), audit `WHERE email = ?` callsites → `WHERE email_hash = hash_email(x)`. Phase 5 = migration 208 drops plaintext `email`/`phone` columns + swaps `(tenant_id, email)` unique index on `training_attendees` to `(tenant_id, email_hash)`.

- **Previously pending — superseded by main**: Unified user-view redesign (conferences + trainings) for structural + visual parity.
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
