# Change 019 — Portal login "Forgot password" link

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

The portal login page at `/{companySlug}/portal/user/login` has email +
password fields but NO "Forgot password?" link. If a portal user forgets
their password, they have no self-service way to reset it.

The backend endpoint `POST /portal/{tenant_slug}/unified/forgot-password`
already exists and issues a 1-hour reset token (handled by `portal_auth.py`).
What's missing is the frontend link and the reset-password page wiring.

Discovered during 012 QA. The full feature (set-password) works, but the
"forgot password" path is a dead end.

## Proposed Change

1. Add a "Forgot password?" link below the password field on the portal
   login page, routing to `/{companySlug}/portal/forgot-password`.
2. Build the forgot-password page: simple email input that POSTs to
   `/portal/{tenant_slug}/unified/forgot-password` and shows a "Check
   your email" confirmation.
3. Build the reset-password page at
   `/{companySlug}/portal/reset-password?token=<token>`: password +
   confirm fields that POST to `/portal/{tenant_slug}/unified/reset-password`.
4. Wire the email template so the reset link points at the portal page,
   not the admin page.

## Out of Scope

- 2FA on portal accounts.
- Email rate limiting (already handled at backend).
- Changing the existing set-password (first-time setup) flow.

## Spec

See `openspec/specs/` once implementation lands.
