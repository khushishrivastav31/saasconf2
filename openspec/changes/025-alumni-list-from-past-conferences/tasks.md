# Tasks — Alumni list from past conferences

## Phase 0 — Recon

- [ ] Inventory current `alumni` table — is it used anywhere? If not,
      decide whether to keep it as a cache or query live each time.
      (Default: query live; drop the cache if unused.)
- [ ] Locate the existing Alumni tab/page in the frontend.

## Phase 1 — Backend aggregation

### RED
- [ ] Test: an applicant who was both attendee and speaker shows once
      with `roles = ['attendee', 'speaker']`.
- [ ] Test: only past conferences (end_date < today) are included.
- [ ] Test: cancelled registrations excluded.
- [ ] Test: tenant isolation.

### GREEN
- [ ] Implement `GET /alumni` with the unioned query per design.

### REFACTOR
- [ ] Extract per-role subqueries into small helpers.

## Phase 2 — CSV export

- [ ] `GET /alumni/export.csv` streams the same rows as CSV. Test that
      the file content matches the JSON result.

## Phase 3 — Frontend

### RED
- [ ] Test: AlumniTab renders 2 rows from mocked API.
- [ ] Test: role badges and conference badges render.

### GREEN
- [ ] Wire the tab to the new endpoint.

## Phase 4 — Full sweep + manual

- [ ] Backend + frontend full sweep.
- [ ] Manual: set a conference's end_date to yesterday → confirm its
      attendees + speakers appear in the Alumni tab → export CSV →
      confirm rows match.
