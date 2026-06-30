# Tasks — Attendee appears in admin list after registration

## Phase 0 — Recon (done 2026-06-29)

- [x] Locate the admin attendees list endpoint + frontend page.
      → `GET /conferences/{conference_id}/registrations`
      (`registrations/core.py:83`); UI `AttendeesTab.tsx`.
- [x] Check the query's `staleTime` and ordering.
      → ordering `created_at.desc()` (newest first, correct); list query
      has no explicit `staleTime`, inherits global 5-min default.
- [x] Confirm status filter does not hide new regs.
      → default excludes only `CANCELLED`; portal regs are
      `REGISTERED_PENDING_INVOICE`, so shown. No bug.

## Phase 1 — Backend regression test (primary deliverable)

### RED
- [ ] New test in `backend/tests/registrations/` (reuse public-portal
      fixtures): complete a public portal registration → admin
      `/registrations` list returns the new attendee's email.

### GREEN
- [ ] Behaviour is already correct — the test should pass on first run
      and stand as a regression lock. (Only investigate if it fails.)

## Phase 2 — Frontend stale-time (optional)

### RED
- [ ] Test: AttendeesTab list query has `staleTime ≤ 30_000`.

### GREEN
- [ ] Set `staleTime: 30_000` on the AttendeesTab list query. Skip the
      whole phase if reload-only refresh is deemed acceptable.

## Phase 3 — Manual verification

- [ ] Manual: register a public attendee → switch to admin tab →
      confirm the row appears within 30 seconds (or after a focus).
- [ ] Update QA_CONFERENCE.md 3.4.1 / 3.4.2 to OK.
