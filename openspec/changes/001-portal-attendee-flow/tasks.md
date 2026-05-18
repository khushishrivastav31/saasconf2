# Tasks — Portal Attendee Auth Flow

## Methodology: TDD (Red → Green → Refactor)

Each implementation step is preceded by its test. Write the test first, confirm
it fails for the right reason, then write the minimum code to make it green.
Only then refactor. No implementation task is started without a failing test.

## Status Legend
- `[ ]` not started
- `[~]` in progress  
- `[x]` done

---

## Phase 0 — Existing QA fixes (carry-over)

These were written test-first in the previous session. All green before Phase 1 begins.

- [~] RED → test_db_session.py: `get_db` / `get_db_with_rls` do not call `session.close()`
- [~] GREEN → `app/db/session.py`: remove double-close in finally block
- [~] RED → test_email.py: SMTP branch does not shadow Resend-absent assertions
- [~] GREEN → `app/core/email/__init__.py`: kwargs fix + mock SMTP_HOST in tests
- [~] RED → test_registration_questions.py: legacy list format handled
- [~] GREEN → `app/api/v1/settings/registration_questions.py`: isinstance guard
- [~] RED → test_portal_user_token_commit.py: `UserPasswordReset` committed before session close
- [~] GREEN → `app/api/v1/portal/registration.py`: move user creation before `db.commit()`

---

## Phase 1 — `PortalRefreshToken.purpose` column

### RED
- [ ] Write `tests/portal/test_portal_refresh_token_purpose.py`
  - Assert `PortalRefreshToken` can be created with `purpose='setup'`
  - Assert `PortalRefreshToken` can be created with `purpose='reset'`
  - Assert existing rows (no purpose set) default to `'reset'`
  - Run → **expect failure**: column does not exist yet

### GREEN
- [ ] Add `purpose: Mapped[str]` column to `app/models/portal_refresh_token.py`
  (server default `'reset'`, nullable=False)
- [ ] Write Alembic migration: `add_purpose_to_portal_refresh_token`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm no existing queries need updating (purpose is additive)

---

## Phase 2 — `create_portal_user_for_registration()` helper

### RED
- [ ] Write `tests/registrations/test_create_portal_user_for_registration.py`
  - New attendee email → `PortalUser` row created (not `User`)
  - New attendee email → `PortalRefreshToken` with `purpose='setup'`, `expires_at ≈ now+7d`
  - Existing `PortalUser` with password already set → no new token, returns `(user, None)`
  - Duplicate call with same email (no password yet) → no second `PortalUser` row
  - Run → **expect failure**: function does not exist yet

### GREEN
- [ ] Add `create_portal_user_for_registration(db, tenant_id, registration)` to
  `app/core/user_auto_creation.py`
  - Look up `PortalUser` by `email_hash`
  - If new: `db.flush()` user, create `PortalRefreshToken(purpose='setup', expires_at=now+7d)`, `db.flush()`
  - If existing with `hashed_password` set: return `(user, None)`
  - Returns `(PortalUser, raw_token | None)`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Keep existing `create_user_for_registration()` untouched (admin flow still uses it)

---

## Phase 3 — Registration endpoint wired to new helper

### RED
- [ ] Update `tests/registrations/test_portal_user_token_commit.py`
  - Change assertion: query `PortalUser` (not `User`) by `email_hash`
  - Change assertion: query `PortalRefreshToken` with `purpose='setup'` (not `UserPasswordReset`)
  - Run → **expect failure**: endpoint still calls old helper

### GREEN
- [ ] In `app/api/v1/portal/registration.py`:
  - Replace `create_user_for_registration()` with `create_portal_user_for_registration()`
  - Keep call **before** `await db.commit()`
  - Update `password_setup_tokens` dict to use the raw token from the new helper
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Remove any leftover imports of `create_user_for_registration` in registration.py
  if no longer needed there

---

## Phase 4 — `setup-password` backend endpoint

### RED
- [ ] Write `tests/registrations/test_portal_setup_password.py`
  - Happy path: valid setup token → 200, `PortalUser.hashed_password` set, token `used_at` set
  - Expired token (expires_at in past) → 400
  - Already-used token (used_at not null) → 400
  - Token with `purpose='reset'` submitted to setup endpoint → 400
  - Wrong tenant → 404
  - Run → **expect failure**: endpoint does not exist yet

### GREEN
- [ ] Add `POST /portal/{tenant_slug}/unified/setup-password` to
  `app/api/v1/portal_auth.py`
  - Request body: `{ token: str, password: str }`
  - Validate `PortalRefreshToken`: `purpose='setup'`, `used_at IS NULL`, `expires_at > now`
  - Hash password, set `PortalUser.hashed_password`
  - Set `token.used_at = now`, commit
  - Response: `{ message: "Password set successfully" }`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Extract token-validation logic shared with `reset-password` if duplication is clear

---

## Phase 5 — Welcome email URL

### RED
- [ ] Write / update `tests/core/test_email_templates.py` (or unit test in existing email tests)
  - Assert the registration welcome email body contains `portal/set-password?token=`
  - Assert it does NOT contain `/reset-password`
  - Run → **expect failure**: template still uses old URL

### GREEN
- [ ] Update `app/core/email/` template(s) — change setup link from
  `/reset-password?token={token}` to `/{tenant_slug}/portal/set-password?token={token}`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm URL is built from a single helper / constant, not scattered strings

---

## Phase 6 — Frontend: SetPasswordPage + route

### RED
- [ ] Write `frontend/src/__tests__/Portal/SetPasswordPage.test.tsx`
  - Renders "Set your password" heading (not "Reset")
  - On submit with valid token → calls `POST /portal/{slug}/unified/setup-password`
  - On success → shows confirmation + "Go to login" link pointing to `/:tenantSlug/portal/user/login`
  - On 400 (expired) → shows "Link expired" message
  - Run (`pnpm test`) → **expect failure**: component does not exist

### GREEN
- [ ] Create `frontend/src/pages/Portal/SetPasswordPage.tsx`
  - Read `?token=` + `:tenantSlug` from URL
  - POST to `/portal/{slug}/unified/setup-password`
  - Success state: confirmation + "Go to login" → `/:tenantSlug/portal/user/login`
  - Error state: "Link expired" + link to forgot-password
  - Dark-mode variants, portal branding, no admin nav, min-h-[44px] touch targets
- [ ] Register route in `frontend/src/App.tsx`:
  `/:tenantSlug/portal/set-password` → `<SetPasswordPage />`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm component structure matches Training portal's `SetPasswordPage.tsx` conventions

---

## Phase 7 — Fix pre-existing tests that locked on old behaviour

### RED (already failing after Phase 2–3 GREEN steps)
- [ ] `tests/invoices/test_registration_invoice_flow.py`
  - 4+ tests assert `User` model attributes from `create_user_for_registration`
  - These will fail once the registration endpoint calls the new helper
  - Identify each assertion, document expected new assertion

### GREEN
- [ ] Update each assertion to target `PortalUser` model equivalents
- [ ] Run full suite → **expect green**

---

## Phase 8 — Full sweep (all must be green before PR)

- [ ] `venv/bin/python -m pytest tests/ -v`
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm gen:api` — regenerate `api.generated.ts` (new endpoint added)
- [ ] `pnpm gen:api:check` — must print no output
- [ ] Manual end-to-end: register → receive email → click link → set password → portal login ✓
