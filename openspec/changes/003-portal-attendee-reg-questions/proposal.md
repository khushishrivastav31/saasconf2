# Change 003 — Portal Attendee Registration Questions

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

`PortalLayout` gates the pending-questions query on `!!applicant` (line 315).
For a pure conference attendee, `applicant` is null, so the query never fires
and the questionnaire gate never appears.

Even if the query fired, both backend endpoints use `CurrentApplicantDep`
which requires a `CFPApplicant` record. Attendees have none. Answers are also
stored keyed by `applicant_id` — no column exists for `portal_user_id`.

## Proposed Change

1. **Migration** — add nullable `portal_user_id` FK to
   `RegistrationQuestionAnswer`. Existing CFP rows keep `portal_user_id = NULL`.

2. **Backend** — add two new portal-user-scoped endpoints:
   - `GET /portal/attendee/registration-questions/pending`
   - `POST /portal/conferences/{id}/attendee/registration-questions/answers`
   Both use `CurrentPortalUserDep` and look up registrations via email_hash.

3. **Frontend** — in `PortalLayout`:
   - Enable pending-questions query for `is_conference_attendee` users too
   - Call attendee endpoint when `applicant` is null, CFP endpoint when not

## Out of Scope

- Merging CFP and attendee answer storage into one unified model.
- Retroactive migration of answers (no existing attendee answers exist).

## Spec

See `openspec/specs/portal-attendee-reg-questions/spec.md`
