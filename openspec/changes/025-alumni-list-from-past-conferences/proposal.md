# Change 025 — Alumni list from past conferences

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 3.6.1: The "Alumni" tab is intended to show people who have attended,
spoken at, or otherwise participated in past conferences for the tenant.
The feature is currently BLOCKED because no aggregation across past
conferences exists, and there is no admin UI surface for it.

An `alumni` table exists in the schema, but it's unclear whether it is
populated automatically when a conference ends, or only by manual
insertion. The QA tester could not load any alumni in the current admin.

## Proposed Change

1. **Backend** — `GET /alumni` that aggregates participants across all
   past conferences for the tenant. "Past" = `conference.end_date <
   today`. Sources:
   - `Registration.email_hash` (attendees) joined to non-cancelled rows.
   - `CFPPaper.main_speaker_id` (speakers, accepted papers only).
   - `CFPCommitteeMember.applicant_id` (committee members).
   Deduplicate by email hash. Return name, email, conferences attended,
   roles held.
2. **Frontend** — render the existing Alumni tab using this endpoint.
   Include a tenant-wide filter (by conference, by role) and CSV export.
3. **No auto-population needed** — the read path queries live data so
   alumni stay current as conferences end.

## Out of Scope

- Per-alumni profile pages (defer).
- Email blasts to alumni (use the recipient list builder, spec 021).
- Importing historical alumni from CSV (defer until needed).

## Spec

See `openspec/specs/` once implementation lands.
