# Change 025 — Alumni list from past conferences

## Status
`shipped` · Jira: MAIN-13417

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 3.6.1 / MAIN-13417: The "Alumni" tab is intended to show people who
have attended, spoken at, or served on the committee of **past**
conferences for the tenant. The feature is currently BLOCKED: there is no
aggregation across past conferences, and the admin surface shows nothing
useful.

A legacy `alumni` table exists, but it is **not** a record of past
participants. It is a manually managed / import-fed list that powers the
**alumni discount** at registration time (`app/core/alumni_discount.py`,
`app/services/cfp_portal_register_service.py`) and is exposed through the
conference-scoped CRUD router at `/conferences/{conference_id}/alumni`.
Repurposing it would break the discount feature.

**Decision (Phase 0 recon, resolved):** keep the legacy `alumni` table as
the discount source of truth. Build the alumni list as a **separate,
tenant-scoped read path** that queries live participation data, so the
list stays current automatically as conferences end. No auto-population,
no new table.

## Proposed Change

1. **Backend** — new tenant-scoped `GET /alumni` that aggregates
   participants across all past conferences for the tenant.
   "Past" = `conference.end_date < today`. Conferences with a null
   `end_date` are excluded (they have not ended). Sources:
   - **Attendees** — `Registration` (status != `cancelled`) keyed by
     `email_hash`, joined to past conferences via `conference_id`.
   - **Speakers** — `CFPApplicant` who is the `main_speaker_id` of an
     `accepted` `CFPPaper`, **or** an accepted co-speaker
     (`CFPPaperCospeaker.invitation_status == 'accepted'`). A paper's
     conference(s) come through `CallForPapers` → `conference_cfps`
     (many-to-many).
   - **Committee** — `CFPCommitteeMember` (`applicant_id`), which already
     carries a direct `conference_id`.

   Deduplicate by `email_hash`. Each alumnus returns name, email, the list
   of conferences they participated in, and the set of roles held
   (`attendee` / `speaker` / `committee`).

   Filters: `conference_id` (restrict to one past conference) and `role`.

2. **CSV export** — `GET /alumni/export.csv` streams the same rows.

3. **Frontend** — replace the legacy conference-scoped Alumni CRUD tab
   with a tenant-wide read-only list: name, email, conference badges,
   role badges, conference + role filters, and a CSV export button.

## Out of Scope

- Per-alumnus profile pages (defer).
- Email blasts to alumni (use the recipient list builder, spec 021).
- Importing historical alumni from CSV (defer until needed).
- Removing or refactoring the legacy alumni-discount table/endpoint.

## Spec

Feature spec lands in `openspec/specs/` when implementation merges.
