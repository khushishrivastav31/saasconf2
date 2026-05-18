# Change 001 — Portal Attendee Auth Flow

## Status
`done` · Branch: `fix/portal-attendee-flow` · PR: #273

## Methodology
TDD — Red → Green → Refactor. Every implementation task is preceded by a failing
test. No code is written without a test that currently fails for the right reason.
See `tasks.md` for the phase-by-phase breakdown.

## Problem

Conference attendees who register through the public registration portal cannot
log in to the portal after registration. The root cause is an architectural
mismatch: registration creates a `User` (admin table) but portal login
authenticates against `portal_users`. The two tables are completely separate.

Additionally:
- The welcome email "set your password" link points to `/reset-password` — the
  admin password reset page. Attendees land on the wrong surface with wrong UX.
- After setting a password, "Go to login" navigates to `/login` (admin), not the
  portal login.
- `create_user_for_registration()` was called **after** `db.commit()`, so the
  `UserPasswordReset` token lived in a fresh uncommitted transaction and was rolled
  back by asyncpg when FastAPI closed the session — making every setup link invalid.

## Proposed Change

Migrate the attendee account-creation path from `users` → `portal_users`:

1. **Backend** — rewrite `create_user_for_registration()` (or add a parallel
   helper) to create a `PortalUser` + a 7-day setup token, and call it **before**
   `db.commit()` in `portal/registration.py`.

2. **Backend** — add `POST /portal/{slug}/unified/setup-password` endpoint that
   validates the 7-day token and sets the `PortalUser` password.

3. **Frontend** — add `/:tenantSlug/portal/set-password` route with a
   SetPasswordPage component (first-time setup UX, not "reset" language).

4. **Email** — change the welcome email setup URL to the new portal route.

5. **Tests** — update `test_portal_user_token_commit.py` to query `portal_users`
   instead of `users`, and update any existing tests that assert `User` model
   attributes from `create_user_for_registration`.

## Out of Scope

- Admin user (`User` table) creation for registrations — admins have a separate
  onboarding flow.
- Training portal (already has its own `set-password` route and flow).
- Retroactive migration of existing `User` rows created by old registrations.

## Spec

See `openspec/specs/portal-attendee-auth/spec.md`
