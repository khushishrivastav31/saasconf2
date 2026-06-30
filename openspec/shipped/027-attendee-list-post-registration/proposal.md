# Change 027 — Attendee appears in admin list after registration

## Status
`shipped` · Branch: feat/attendee-list-post-registration

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 3.4.1 / 3.4.2: After a public registration completes (now verified
working in 5.2.1), the newly registered attendee should appear in the
admin's "Attendees" list for the conference. Previously this was
BLOCKED on 5.2.1; with that unblocked, the list needs verification and
a regression lock.

### Recon findings (2026-06-29)

The admin list is `GET /conferences/{conference_id}/registrations`
(`backend/app/api/v1/registrations/core.py:83`) — **not** `/attendees`.
Verified against the current code, the backend already behaves
correctly:

- **Status filter** — the default list excludes **only** `CANCELLED`
  (`core.py:131`). Public portal registrations are created with status
  `REGISTERED_PENDING_INVOICE` (`portal/registration.py:627`), so they
  are returned by default. No "Pending" filter hides them.
- **Ordering** — `order_by(Registration.created_at.desc())`
  (`core.py:137`) → newest first.
- **Pagination** — endpoint default page size is 20, but newest-first
  ordering keeps a fresh row at the top of page 1; the frontend also
  requests `page_size=100` (`AttendeesTab.tsx:82`). No row is pushed off.

So the originally-feared filtering/ordering/pagination gaps **do not
exist**. The only outstanding gaps are: (1) no regression test locks the
behaviour, and (2) the frontend list query inherits the global 5-minute
`staleTime` (`main.tsx:42`) rather than the spec's target of ≤ 30s — a
minor tune, since a page reload (explicitly acceptable per the
acceptance criteria) already refetches.

## Proposed Change

1. **Lock with a backend regression test** (primary deliverable) —
   complete a public portal registration
   (`POST /api/v1/portal/{tenant_slug}/conferences/{conference_slug}/register`)
   then assert the attendee's email is returned by
   `GET /conferences/{conference_id}/registrations`. New test lives in
   `backend/tests/registrations/`, reusing the public-portal fixtures
   from `test_public_registration_portal.py`.
2. **Optional frontend tune** — set `staleTime: 30_000` (and rely on the
   default `refetchOnWindowFocus: true`) on the AttendeesTab list query
   so a tab switch / refocus refetches within 30s without a manual
   reload. Skip if reload-only is deemed sufficient.

## Out of Scope

- Push notifications when a new attendee registers (defer).
- Realtime websocket updates (defer).

## Spec

See `openspec/specs/` once implementation lands.
