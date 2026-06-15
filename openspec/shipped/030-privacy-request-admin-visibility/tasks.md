# Tasks — Admin visibility for portal privacy requests

## Phase 0 — Reproduce locally (confirm the diagnosis)

- [ ] Dev tenant with `contact_persons = []`. File an erasure request as
      a portal user.
- [ ] Confirm speaker confirmation email is sent (expected ✅).
- [ ] Confirm admin notification is **skipped** — check the log line
      `"...has no contact_persons email; skipping"` and `email_logs`.
- [ ] Confirm no in-app signal: MyCompany shows the row only if opened
      manually; no badge anywhere.

## Phase 1 — Reliable admin email recipient

### RED
- [ ] Test: `contact_persons=[]` + one admin `UserTenantRole` →
      notification sends to that admin's email.
- [ ] Test: both contact_person and admin users → union, de-duped.
- [ ] Test: no admins and no contact → no-op (returns False).

### GREEN
- [ ] Add `resolve_privacy_notify_recipients(db, tenant_id)`.
- [ ] Wire `send_privacy_request_admin_notification` to it.

### REFACTOR
- [ ] Tidy resolver; keep `_pick_tenant_contact_email` as one input.

## Phase 2 — Pending-count endpoint

### RED
- [ ] Test: endpoint returns count of `pending_review` requests for the
      tenant.

### GREEN
- [ ] Add `GET /privacy-requests/pending-count` (admin-scoped).
- [ ] `pnpm gen:api` + commit `api.generated.ts`.

## Phase 3 — Deep-link + in-app badge

### RED
- [ ] Test: `/my-company?tab=privacy` mounts on the Privacy tab.
- [ ] Test: badge shows pending count; hidden at zero.

### GREEN
- [ ] Seed `activeTab` from URL param in `MyCompany/index.tsx`.
- [ ] Add badge polling the pending-count endpoint.
- [ ] Point admin email CTA at `/my-company?tab=privacy`.

## Phase 4 — Verify + ship

- [ ] Manual: file erasure → admin receives email → click CTA → lands on
      Privacy tab → badge clears after handling.
- [ ] Full sweep (mypy, ruff, tsc, eslint, pytest, vitest, gen:api:check).
- [ ] Update handbook for the new admin notification behaviour.
