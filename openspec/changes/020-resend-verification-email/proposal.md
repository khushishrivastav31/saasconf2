# Change 020 — Resend verification email from Pending Verifications

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 1.4.4.3: Admins have a "Pending Verifications" page that lists users
whose email-verification link hasn't been used yet. There is currently
no way to manually resend that verification email from the admin UI.
Users who lose/delete the original email are stranded.

This was BLOCKED previously because the QA team needed speakers, but the
underlying admin feature itself is missing.

## Proposed Change

1. **Backend** — add `POST /admin/users/{user_id}/resend-verification`
   that issues a fresh verification token and sends a new email. Requires
   tenant admin role.
2. **Frontend** — add a "Resend" button on each row of the Pending
   Verifications list. Confirmation toast on success.

## Out of Scope

- Bulk resend.
- Resending for portal users (separate path).
- Rate limiting beyond the existing per-email cooldown.

## Spec

See `openspec/specs/` once implementation lands.
