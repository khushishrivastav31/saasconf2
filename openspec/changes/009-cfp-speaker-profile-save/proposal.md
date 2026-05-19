# Change 009 — CFP Speaker Profile & Address Fields Save

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

### 3.2.2 — Edit speaker profile — changes don't save

When a conference admin edits a speaker's profile in the CFP People tab, the
changes appear to submit but are not persisted. The form submits, but either:
- The PATCH request is sent to the wrong endpoint.
- The request body does not include the changed fields (stale closure or
  incorrect form-state collection).
- The API returns success but the optimistic update is incorrect, masking a
  server-side validation error.

The `SpeakersTab.tsx` is read-only (derived from program grid data) and does
not have edit functionality. Speaker editing must therefore live in the CFP
applicant management path — likely `CFPApplicants` or a speaker detail modal
in the CFP module.

### 3.3.3 — User address fields don't save

When a conference admin edits a user's address fields (street, city, postcode,
country), the PATCH request is submitted but the values are not persisted.
Root cause could be:
- The address fields are not included in the `UserUpdate` Pydantic schema
  (`app/schemas/user.py`).
- The frontend does not send address fields in the request body.
- RLS blocks the update for some tenants.

## Proposed Change

1. **CFP speaker profile** — identify the speaker edit path in the CFP module;
   confirm the PATCH endpoint (`/conferences/{id}/cfp/applicants/{applicant_id}`)
   is wired correctly; fix the payload construction or endpoint reference.

2. **User address fields** — confirm `UserUpdate` schema includes address
   fields; confirm the frontend form sends them; add them if missing.

## Out of Scope

- Speaker profile photo upload (separate media storage concern).
- Portal-side speaker self-edit (a separate portal flow).

## Spec

See `openspec/specs/` (to be created alongside implementation).
