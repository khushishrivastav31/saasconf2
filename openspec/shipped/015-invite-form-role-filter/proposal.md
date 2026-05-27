# Change 015 — Invite form filters roles by enabled modules

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 0.5.1.6: The "Invite User" form shows the Super User toggle and every
module role (Conferences Admin, Trainings Admin, Customers Admin, ...)
regardless of which modules the tenant has actually enabled.

A tenant that only has the `conferences` module enabled should NOT see
"Trainings Admin" or "Customers Admin" as options. Showing those creates
broken invites — the invitee gets a role for a module their tenant can't
access.

The Super User toggle also leaks for tenant-only admins who shouldn't be
able to promote anyone to super user.

## Proposed Change

1. **Backend** — extend the invite endpoint (or wherever the role
   options are computed) to return only roles whose module is enabled
   for the tenant.
2. **Frontend** — in `InviteUserModal.tsx` (or equivalent), filter the
   visible role checkboxes to only those whose module is enabled.
3. **Super User toggle** — hide the toggle unless the currently logged-in
   user is a super admin (not just a tenant admin).

## Out of Scope

- Backend role validation (already exists — invites with disabled-module
  roles are rejected).
- A separate "module manager" UI.

## Spec

See `openspec/specs/` once implementation lands.
