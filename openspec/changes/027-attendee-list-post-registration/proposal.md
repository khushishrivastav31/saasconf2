# Change 027 — Attendee appears in admin list after registration

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 3.4.1 / 3.4.2: After a public registration completes (now verified
working in 5.2.1), the newly registered attendee should appear in the
admin's "Attendees" list for the conference. Previously this was
BLOCKED on 5.2.1; with that unblocked, it's likely the list already
works but has not been verified, and any small gap (filtering, ordering,
auto-refresh) needs to be confirmed.

## Proposed Change

1. **Verify** — the admin attendees list pulls fresh data and includes
   newly registered attendees within ≤ 30 seconds of registration (or
   after the admin reloads the page).
2. **Fill gaps** if any:
   - If `staleTime` on the list query is too long, lower it.
   - If a "Pending" status filter hides newly-paid registrations,
     adjust filters.
   - If pagination defaults exclude the newest row, switch to
     "newest first" ordering.
3. **Lock with a backend test** — registration creates a row that's
   returned by `GET /conferences/{id}/attendees` (or the equivalent
   admin list endpoint).

## Out of Scope

- Push notifications when a new attendee registers (defer).
- Realtime websocket updates (defer).

## Spec

See `openspec/specs/` once implementation lands.
