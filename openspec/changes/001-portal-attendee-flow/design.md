# Design — Portal Attendee Auth Flow

## Token Strategy

**Option A — Extend `PortalRefreshToken`** (chosen)

Reuse the existing `PortalRefreshToken` model with `expires_at` set to now + 7 days.
The `reset-password` endpoint already validates this token. We add a new
`setup-password` endpoint that does the same but with first-time-setup semantics
(doesn't require an old password, marks the `PortalUser` as active).

- Pros: no new model, no migration, leverages existing validation logic.
- Cons: setup and reset tokens are stored in the same table — distinguish them with
  a `purpose` column or by convention (caller decides which endpoint to send the
  user to).

**Option B — New `PortalSetupToken` model**

Separate table for first-time setup tokens.

- Pros: clear separation.
- Cons: new model + migration + duplicate validation logic.

Decision: **Option A**. Add a `purpose` column (`'setup' | 'reset'`) to
`PortalRefreshToken` via Alembic migration so the two flows are distinguishable
without a new table.

---

## Backend Changes

### `app/core/user_auto_creation.py`

Add `create_portal_user_for_registration(db, tenant_id, registration)`:
- Look up or create `PortalUser` by `email_hash`
- If new user: create `PortalRefreshToken` with `purpose='setup'`, `expires_at=now+7d`
- If existing user (already has password): skip token creation, return `(user, None)`
- Both writes use `db.flush()` — caller commits

Keep the existing `create_user_for_registration()` function intact (used by admin
registration flow — `registrations/core.py`).

### `app/api/v1/portal/registration.py`

Replace `create_user_for_registration()` call with `create_portal_user_for_registration()`.
Call it **before** `await db.commit()` (this is also where the existing commit-order
bug is fixed).

### `app/api/v1/portal_auth.py`

Add `POST /portal/{tenant_slug}/unified/setup-password`:
- Accepts `{ token: str, password: str }`
- Validates `PortalRefreshToken` with `purpose='setup'`, not expired, not used
- Sets `PortalUser.hashed_password`, marks token `used_at=now`
- Returns `{ message: "Password set successfully" }`

### `app/models/portal_refresh_token.py`

Add `purpose: str` column (default `'reset'` for backwards compat).

### Alembic migration

`migrations/versions/XXX_add_purpose_to_portal_refresh_token.py`

---

## Frontend Changes

### New route + page

`frontend/src/App.tsx` — add:
```
/:tenantSlug/portal/set-password  →  PortalSetPasswordPage
```

`frontend/src/pages/Portal/SetPasswordPage.tsx` — new component:
- Reads `?token=` from URL
- `POST /portal/{slug}/unified/setup-password`
- Success state: "Password set! Go to login" → `/:tenantSlug/portal/user/login`
- Error state: "Link expired — request a new one" → forgot-password flow
- No admin navigation, portal branding

### Welcome email URL

`app/core/email/templates/` — change setup link from:
```
/reset-password?token={token}
```
to:
```
/{tenant_slug}/portal/set-password?token={token}
```

---

## Test Impact

| File | Change |
|------|--------|
| `tests/registrations/test_portal_user_token_commit.py` | Query `portal_users` instead of `users`; assert `PortalRefreshToken` instead of `UserPasswordReset` |
| `tests/invoices/test_registration_invoice_flow.py` | 4+ tests assert `User` model — update to `PortalUser` assertions |
| New: `tests/registrations/test_portal_setup_password.py` | Happy-path + expiry tests for the new endpoint |

---

## Rollout / Risk

- Existing `User` rows created by old registrations are **not** migrated. Those
  users will still get an "Invalid or expired" error if they try to use their old
  setup link. Acceptable: those links are already broken (commit-order bug).
- The `purpose` column defaults to `'reset'` so existing `PortalRefreshToken` rows
  keep working as password-reset tokens without any data migration.
