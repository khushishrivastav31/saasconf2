# Change 021 — Recipient list builder

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 1.4.4.6: Admins need to send bulk emails (announcements, deadline
reminders) to specific groups of people — e.g. "all attendees", "all
speakers", "all sponsors of conference X". A `RecipientList` table
exists in the model layer but there is no UI to create or manage one
from the admin.

This was previously BLOCKED on "needs applicants" but the underlying
admin UI is the missing piece.

## Proposed Change

1. **Backend** — verify CRUD endpoints exist for `RecipientList` and
   `RecipientListMember`. Add missing ones.
2. **Frontend** — new "Recipient Lists" page under Settings (or the
   Communications module) with:
   - List view of existing recipient lists for the tenant.
   - Create form: name + optional description + scope (tenant-wide or
     conference-specific).
   - Add/remove members by email or by selecting an existing group
     ("All attendees of conf X", "All speakers of conf Y").

## Out of Scope

- Dynamic recipient lists that auto-update (separate spec —
  `dynamic_recipient_lists` table already exists; that one is a future
  feature).
- Sending from the list (already implemented in 6.1).

## Spec

See `openspec/specs/` once implementation lands.
