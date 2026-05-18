# Change 002 — Portal Attendee Profile

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

`ProfilePage.tsx` reads all profile data from `applicant` (the CFP applicant
loaded via `/portal/me`). For a pure conference attendee (no CFP applicant),
`applicant` is `null`. The page renders nothing and the save button silently
does nothing.

`PATCH /portal/unified/me` currently only accepts `theme_preference`.

## Proposed Change

1. **Backend** — extend `PortalMePatch` schema and `patch_portal_profile`
   endpoint to accept and persist the full profile field set on `PortalUser`.

2. **Frontend** — make `ProfilePage` branch on `applicant`:
   - If `applicant` exists → existing CFP flow (unchanged)
   - If `applicant` is null → read from `portalMe`, save via
     `PATCH /portal/unified/me`

## Out of Scope

- Media uploads (profile picture / video) for attendees — requires
  separate storage handling; deferred.
- Merging CFP and portal-user profile into a single unified model.
- Question -> what's the difference between CFP and portal-user ?

Notes. Since we have this scenario, I would like to see if this scenario was tested already, and to know if there's any chance to create a new test for the new things.

## Spec

See `openspec/specs/portal-attendee-profile/spec.md`
