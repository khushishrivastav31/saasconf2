# portal-attendee-reg-questions Specification

## Purpose

Conference admins can configure registration questions that attendees must
answer after their first login. Currently this flow only works for CFP
applicants (speakers). Pure conference attendees who registered via the
public portal see nothing — the pending-questions query is gated on having
a `CFPApplicant` record, and answers are stored keyed by `applicant_id`.

This spec covers making registration questions work for portal attendees
using their `PortalUser` identity.

---

## Requirements

### Requirement: Attendee sees pending registration questions on first login

After logging in for the first time, a conference attendee SHALL be shown
any mandatory registration questions the admin has configured for their
conference.

#### Scenario: Admin adds a mandatory question, attendee logs in
- GIVEN a conference has `registration_questions.enabled = true` with 1
  mandatory question
- AND the attendee has a `Registration` for that conference
- WHEN the attendee logs in to the portal
- THEN the questionnaire gate is shown before the portal content
- AND the attendee cannot dismiss it without answering the mandatory question

#### Scenario: Attendee has already answered all questions
- GIVEN the attendee previously submitted answers for all mandatory questions
- WHEN they log in again
- THEN no questionnaire gate is shown

---

### Requirement: Answers are stored per portal user + conference

Registration question answers for portal attendees SHALL be stored keyed
by `(portal_user_id, conference_id, question_id)`.

#### Scenario: Attendee answers are persisted
- GIVEN the attendee submits answers via the portal
- WHEN a new portal session is started
- THEN the previously submitted answers are recognised and the gate is not
  shown again

---

### Requirement: New endpoints do not break CFP applicant flow

The existing `GET /portal/registration-questions/pending` and
`POST /portal/conferences/{id}/registration-questions/answers` endpoints
(which use `CurrentApplicantDep`) SHALL remain unchanged. New
portal-user-based endpoints SHALL be added alongside them.

---

## Data Model Decision

**Option A — Add `portal_user_id` to `RegistrationQuestionAnswer`** (chosen)

Add a nullable `portal_user_id` FK column to `RegistrationQuestionAnswer`.
Rows created by the old CFP flow keep `portal_user_id = NULL`. Rows created
by the new attendee flow keep `applicant_id = NULL`.

- Pros: single table, unified query surface.
- Cons: one migration, partial nullability.

**Option B — Separate `AttendeeQuestionAnswer` table**

- Pros: clean separation.
- Cons: duplicated schema, harder to report across both.

Decision: **Option A**.

---

## New Endpoints

```
GET  /portal/attendee/registration-questions/pending
POST /portal/conferences/{conference_id}/attendee/registration-questions/answers
```

Both use `CurrentPortalUserDep` (from JWT). Lookup uses
`portal_user_id` + `Registration.email_hash` to find the attendee's
conferences.
