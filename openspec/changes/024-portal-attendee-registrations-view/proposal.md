# Change 024 — Portal: attendee can view their registrations

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

Conference attendees who registered via the public portal currently have
nowhere in the portal to view a summary of their registrations — which
conferences they're registered for, what they paid for, invoice status,
booking option, etc.

Discovered during 012 QA: attendees logging into the portal see News
(if they're linked to a conference) but no "My Registrations" view.

## Proposed Change

1. **Backend** — `GET /portal/unified/me/registrations` returning the
   list of `Registration` rows matched by the portal user's `email_hash`,
   with conference name, booking option, status, and invoice link.
2. **Frontend** — new `RegistrationsPage.tsx` in the portal showing the
   list, with a link/details panel per registration.
3. **Nav** — add a "Registrations" entry to the portal sidebar when the
   logged-in user is a conference attendee.

## Out of Scope

- Editing a registration from the portal (admin-only).
- Cancelling a registration from the portal (separate spec).
- Training registrations (covered by the trainings portal flow).

## Spec

See `openspec/specs/` once implementation lands.
