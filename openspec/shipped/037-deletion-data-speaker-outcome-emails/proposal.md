# Change 037 — Speaker outcome emails for deletion requests

## Status
`planned` · Branch: TBD

## Ticket
MAIN-13320 — [SaasConf] Deletion Data improvement

## Methodology
TDD — Red → Green → Refactor.

## Problem

When a portal user (speaker) files an Art. 17 deletion request via
`/portal/privacy`, the speaker receives a confirmation email ("We received
your privacy request") and the admin is notified via email + in-app badge
(both shipped in Change 030).

**The speaker loop is never closed.** After the admin acts on the request,
the speaker is left in the dark:

- **Admin executes the erasure** (data actually deleted) → speaker gets no
  email. They don't know their data was removed.
- **Admin rejects the request** → speaker gets no email. They don't know
  it was rejected or why.

This breaks the GDPR Art. 17 expectation that the subject is informed of
the outcome of their request within one month.

### Where the gap is

`backend/app/api/v1/privacy_requests.py` has two terminal actions for
erasure requests:

1. `POST /{id}/execute-erasure` — sets `status = completed` and runs the
   actual deletion. **No email to the subject.**
2. `POST /{id}/reject` — sets `status = rejected` and stores
   `rejection_reason`. **No email to the subject.**

The `PrivacyRequest` row always stores `subject_emails` (decrypted via
`pr.subject_emails` property), so the recipient is already available.

## Proposed Change

### 1. New email: erasure executed (accepted)

After a successful `execute_privacy_erasure`, send a fire-and-forget
email to each address in `pr.subject_emails` confirming their data was
deleted.

Content:
- Subject: `"Your data deletion request has been completed — {tenant_name}"`
- Body: brief confirmation that data associated with their email was
  permanently deleted, date/time of deletion, and a note that no personal
  data is retained under Art. 17.

### 2. New email: request rejected

After `reject_privacy_request`, send a fire-and-forget email to each
address in `pr.subject_emails` with the rejection decision and the
mandatory `rejection_reason`.

Content:
- Subject: `"Your data deletion request was not approved — {tenant_name}"`
- Body: the rejection reason (verbatim from the admin), a note that their
  data remains on file, and a reminder they can contact the tenant if they
  wish to appeal or ask for more information.

### 3. No admin-side change

Change 030 already ships:
- Admin email notification when a new request arrives (via
  `resolve_privacy_notify_recipients`, which includes all active
  ADMIN-level `UserTenantRole` users for the tenant).
- In-app pending count badge on the MyCompany nav entry
  (`AdminLayout.tsx` → `MyCompanyLink`).
- Deep-link `?tab=privacy` in both the badge and the email.

Local verification of the admin email is listed as a recon task but
requires no code change.

## Affected Code

### Backend
- `backend/app/core/email/privacy.py` — add two new async functions:
  - `send_privacy_erasure_completed(db, *, tenant_id, recipient_email,
    executed_at, tenant_name) → bool`
  - `send_privacy_erasure_rejected(db, *, tenant_id, recipient_email,
    rejection_reason, tenant_name) → bool`
- `backend/app/api/v1/privacy_requests.py` — call the new functions
  (fire-and-forget via `send_email_background`) from:
  - `execute_privacy_erasure` — after `await db.commit()`
  - `reject_privacy_request` — after `await db.commit()`
- `backend/tests/test_privacy_requests_outcomes.py` — new test file.

### Frontend
None — this change is backend-only.

### Handbook
- `frontend/src/pages/Handbook/handbookSections.tsx` — note that speakers
  now receive an outcome email for their deletion requests.

## Out of Scope

- Export requests — export is self-service and runs inline; no admin
  approval or rejection step exists.
- In-app portal notification for the speaker (no portal notification
  inbox exists today; email is the correct channel here).
- Changing the erasure execution / human-in-the-loop preview flow.

## Spec

See `openspec/specs/` once implementation lands.
