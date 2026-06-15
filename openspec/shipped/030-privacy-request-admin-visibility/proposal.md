# Change 030 — Admin visibility for portal privacy requests

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

When a portal speaker files an Art. 17 **deletion** (or Art. 15 export)
request from `/portal/privacy`, the *speaker* gets a confirmation email
("We received your privacy request") — this works, confirmed on staging.

The **admin gets nothing**: no email, no in-app notification, no badge.
The request only exists in `MyCompany → Privacy Requests`, a tab the
admin has no reason to open unless they already know a request is
waiting. For a GDPR obligation with a one-month statutory clock, a
queue nobody is told about is the core failure.

### Root cause (read from the code, not yet reproduced locally)

The erasure flow *does* try to email an admin. `POST
/portal/me/privacy-requests` (`backend/app/api/v1/portal/privacy.py`)
backgrounds `send_privacy_request_admin_notification`
(`backend/app/core/email/privacy.py`). But that function resolves its
recipient via `_pick_tenant_contact_email`:

1. `tenant.contact_persons[0].email`, else
2. `tenant.resend_from_email`, else
3. **no-op** — it logs `"...has no contact_persons email; skipping"`,
   returns `False`, and no email is ever sent.

So the notification targets a **configurable JSON field on the tenant,
not the actual admin users who log in**. On any tenant where
`contact_persons` is empty (very likely on staging), the admin email
silently disappears. That matches the report exactly: speaker email
works, admin email "missing."

Two secondary gaps compound it:

- **No in-app signal.** The admin `NotificationBell`
  (`frontend/src/components/layout/AdminLayout.tsx`) only counts unread
  *messaging* threads (`/messaging/unread-count`). Pending privacy
  requests are not reflected anywhere in the chrome.
- **Shallow deep-link.** Even when the admin email *is* sent, it links
  to `/my-company`, which lands on the default **Company** tab. The
  Privacy Requests tab is selected by local `useState` with no URL
  param, so "review the request" doesn't actually open the request.

## Proposed Change

1. **Verify locally first.** Reproduce on a dev tenant: file an erasure
   request as a portal user, confirm the admin email is skipped when
   `contact_persons` is empty, and confirm nothing surfaces in the admin
   UI. Capture the `email_logs` row / log line as evidence.
2. **Make the admin email reliable.** Notify the tenant's actual admin
   users (those with an `admin`-level `UserTenantRole`) in addition to
   (or instead of) the `contact_persons` fallback, so an unconfigured
   `contact_persons` no longer means silence.
3. **Surface it in-app.** Add a pending-privacy-request count the admin
   can see without opening the tab — a badge on the MyCompany nav entry
   and/or the existing notification bell.
4. **Deep-link the email + badge** straight to the Privacy Requests tab
   (URL param / query string the tab honours), so "review the request"
   opens the request.

## Out of Scope

- A general-purpose in-app notification model/inbox (none exists today;
  building one is a separate, larger change). This change reuses the
  existing badge/bell pattern only.
- Changing the erasure execution / human-in-the-loop preview flow.
- Export requests (self-service, intentionally no admin notification).

## Spec

See `openspec/specs/` once implementation lands.
