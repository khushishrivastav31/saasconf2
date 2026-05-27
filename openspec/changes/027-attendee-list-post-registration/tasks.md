# Tasks — Attendee appears in admin list after registration

## Phase 0 — Recon

- [ ] Locate the admin attendees list endpoint + frontend page.
- [ ] Check the query's `staleTime` and ordering.

## Phase 1 — Backend regression test

### RED
- [ ] Test: complete a public registration → admin list endpoint
      returns the new attendee.

### GREEN
- [ ] If the test passes immediately, behaviour is correct — keep the
      test as a regression lock.
- [ ] If it fails, fix the filter / ordering bug.

## Phase 2 — Frontend stale-time

### RED
- [ ] Test: list query has `staleTime ≤ 30_000`.

### GREEN
- [ ] If staleTime is high, lower it.

## Phase 3 — Manual verification

- [ ] Manual: register a public attendee → switch to admin tab →
      confirm the row appears within 30 seconds (or after a focus).
- [ ] Update QA_CONFERENCE.md 3.4.1 / 3.4.2 to OK.
