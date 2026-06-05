# Tasks — Portal attendee registrations view

## Phase 0 — Recon

- [ ] Confirm `Registration.email_hash` is populated at registration
      time.
- [ ] Confirm `Registration.status` enum values.
- [ ] Locate the portal sidebar / layout component for adding the new
      link.

## Phase 1 — Backend endpoint

### RED
- [ ] Test: attendee with 2 registrations sees both.
- [ ] Test: cancelled registrations excluded.
- [ ] Test: different tenant's registrations excluded.
- [ ] Test: unauth → 401.

### GREEN
- [ ] Implement `GET /portal/unified/me/registrations`.

## Phase 2 — Frontend page

### RED
- [ ] Test: renders 2 rows from mocked API.
- [ ] Test: empty state when no registrations.

### GREEN
- [ ] Build `RegistrationsPage.tsx`.
- [ ] Register the route in `App.tsx`.

## Phase 3 — Sidebar link

### RED
- [ ] Test: `is_conference_attendee` user sees the Registrations link.
- [ ] Test: non-attendee portal user does NOT see the link.

### GREEN
- [ ] Add the conditional link to `PortalLayout.tsx`.

## Phase 4 — Full sweep + manual

- [ ] Backend + frontend full sweep.
- [ ] Manual: log in as attendee → confirm Registrations link → confirm
      list shows the expected entries with conference name and status.
