# Design — Admin visibility for portal privacy requests

## Current behaviour (as built)

```
portal user POST /portal/me/privacy-requests {request_type: erasure}
  └─ PrivacyRequest row (status=pending_review)        ✅ persisted
  └─ send_email_background(user_confirmation)          ✅ speaker gets email
  └─ send_email_background(admin_notification)
       └─ _pick_tenant_contact_email(tenant)
            ├─ contact_persons[0].email  → often empty
            ├─ resend_from_email         → often empty
            └─ None → return False, NO EMAIL            ❌ admin gets nothing
admin UI: MyCompany → Privacy Requests tab              ❌ no badge / no prompt to open it
```

Files in play:
- `backend/app/api/v1/portal/privacy.py` — endpoint wiring.
- `backend/app/core/email/privacy.py` — `_pick_tenant_contact_email`,
  `send_privacy_request_admin_notification`.
- `backend/app/models/user_tenant_role.py` — `UserTenantRole`,
  `TenantRoleLevel.ADMIN` (the real admins to notify).
- `frontend/src/pages/MyCompany/index.tsx` — tab via local `useState`
  (no URL param).
- `frontend/src/components/layout/AdminLayout.tsx` — `NotificationBell`
  (messaging-only today).

## Backend

### 1 — Reliable admin recipient resolution

Add a resolver that returns the admin email set for a tenant, e.g.
`resolve_privacy_notify_recipients(db, tenant_id) -> list[str]`:

- Query `UserTenantRole` rows with `level == TenantRoleLevel.ADMIN` for
  the tenant, join `User`, collect active users' emails.
- Union with `_pick_tenant_contact_email` (keep the DPO/contact_persons
  address — it may be a dedicated privacy mailbox).
- De-dupe; only no-op when the union is genuinely empty.

`send_privacy_request_admin_notification` sends to each resolved
recipient (or one email with the set as recipients, per existing
`send_email` capability). Point the CTA link at the deep-linked tab
(see frontend).

### 2 — Pending count endpoint (for the in-app badge)

Reuse or add a lightweight admin endpoint, e.g.
`GET /privacy-requests/pending-count` →
`{ "pending_review": <int> }`, scoped to the tenant, counting
`status == pending_review`. Mirrors the `/messaging/unread-count`
pattern the bell already polls.

### Regression tests (RED first)

```python
# test_privacy_admin_notify_recipients.py
async def test_notifies_tenant_admin_users_when_contact_persons_empty(...):
    # tenant with contact_persons=[] but one admin UserTenantRole
    # → send_privacy_request_admin_notification sends to the admin's email

async def test_unions_contact_person_and_admin_users(...):
    # both configured → both addresses receive (de-duped)

async def test_noop_only_when_no_admins_and_no_contact(...):
    # genuinely empty → returns False, no send
```

```python
# test_privacy_pending_count.py
async def test_pending_count_reflects_open_erasure_requests(...):
```

## Frontend

### 3 — Deep-link the Privacy Requests tab

`MyCompany/index.tsx`: seed `activeTab` from a URL param/query
(`?tab=privacy`) and keep it in sync on tab change, so
`/my-company?tab=privacy` opens directly on the queue. Use this URL in
the admin email CTA and the badge target.

### 4 — In-app badge

Poll the pending-count endpoint (same `refetchInterval`/`staleTime`
shape as `NotificationBell`). Show a count badge on the MyCompany
sidebar entry (and/or fold privacy into the bell). Clicking routes to
`/my-company?tab=privacy`.

### Frontend tests (RED first)

- `MyCompany/__tests__`: `?tab=privacy` renders the Privacy Requests tab
  active on mount.
- Badge component: renders the count from the pending-count query; hides
  at zero.

## Test Impact

| File | Change |
|------|--------|
| `backend/tests/gdpr/test_privacy_admin_notify_recipients.py` (new) | admin-user resolution + union + no-op |
| `backend/tests/gdpr/test_portal_privacy_emails.py` (extend) | recipient set now includes admin users |
| `backend/tests/.../test_privacy_pending_count.py` (new) | pending-count endpoint |
| `frontend/src/pages/MyCompany/__tests__/...` | `?tab=privacy` deep-link |
| MyCompany nav / bell test | badge reflects pending count |

## Open questions

- One email to all admins, or per-recipient sends? (Existing
  `send_email` shape decides this — check before implementing.)
- Badge on the sidebar entry, on the bell, or both? Confirm with user.
