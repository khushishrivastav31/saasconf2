# Tasks — Alumni list from past conferences

## Phase 0 — Recon  ✅ resolved (see proposal/design)

- [x] Inventory the legacy `alumni` table. **Finding:** it is NOT a
      record of past participants — it feeds the alumni **discount** at
      registration (`app/core/alumni_discount.py`,
      `app/services/cfp_portal_register_service.py`) and is served from
      the conference-scoped router
      `/conferences/{conference_id}/alumni`. **Decision:** keep it; build
      a separate tenant-scoped live read path. Do NOT repurpose or drop.
- [x] Locate the existing Alumni tab. **Finding:**
      `frontend/src/pages/ConferenceDetail/tabs/AlumniTab.tsx` — currently
      the legacy CRUD/import UI; to be rewritten as a read-only list.

## Phase 1 — Backend aggregation

### RED
- [ ] Test: an applicant who is both attendee and speaker shows once with
      `roles == ['attendee', 'speaker']` (dedup by `email_hash`).
- [ ] Test: only past conferences are included — `end_date < today`;
      conferences with `end_date IS NULL` are excluded.
- [ ] Test: cancelled registrations excluded; the other statuses
      (`registered_pending_invoice`/`invoiced`/`paid`) included.
- [ ] Test: speakers source = `main_speaker_id` of `accepted` papers AND
      accepted co-speakers (`CFPPaperCospeaker.invitation_status ==
      'accepted'`); rejected/draft papers excluded.
- [ ] Test: committee members sourced via `CFPCommitteeMember`.
- [ ] Test: `conference_id` filter restricts to that conference's alumni;
      `role` filter keeps only matching alumni but still lists all their
      roles.
- [ ] Test: tenant isolation — another tenant's participants never leak.

### GREEN
- [ ] New module `app/api/v1/alumni_list.py`; mount in
      `app/api/v1/router.py` at `prefix="/alumni"`, auth `TenantAdminDep`.
- [ ] Implement `GET /alumni` with the unioned query + `email_hash`
      grouping per design; batch-resolve conference names (no N+1);
      paginate (`skip`/`limit`, default 100 / max 500).
- [ ] Add `AlumniEntry` / `ConferenceRef` / `AlumniListResponse` schemas
      (Pydantic v2, `ConfigDict(from_attributes=True)`).

### REFACTOR
- [ ] Extract the per-role sub-selects into small helpers
      (`_attendee_select`, `_speaker_select`, `_committee_select`).

## Phase 2 — CSV export

- [ ] `GET /alumni/export.csv` streams the same aggregated rows
      (`StreamingResponse` / shared `csv_response`), honoring filters,
      capped at 50k rows.
- [ ] Test: CSV content matches the JSON result for the same filters.

## Phase 3 — Frontend

### RED
- [ ] Test: `AlumniTab` renders 2 rows from a mocked `/alumni` response.
- [ ] Test: role badges and conference badges render.
- [ ] Test: conference + role filters drive the query params.

### GREEN
- [ ] Rewrite `AlumniTab.tsx` as the read-only tenant-wide list (table +
      filter bar + Export CSV). Remove legacy add/delete/import controls.
- [ ] Add `frontend/src/types/alumni.ts` shapes + `queryKeys` entry.
- [ ] `pnpm gen:api` and commit `frontend/src/types/api.generated.ts`;
      verify with `pnpm gen:api:check`.

## Phase 4 — Full sweep + manual

- [ ] Backend sweep: targeted pytest, `mypy app/`, `ruff check/format app/`,
      full `pytest tests/ -n 4 -q`.
- [ ] Frontend sweep: `pnpm exec tsc --noEmit`, `pnpm exec eslint src/`,
      `pnpm test`.
- [ ] Update the in-app handbook
      (`frontend/src/pages/Handbook/handbookSections.tsx`) for the new tab.
- [ ] Manual: set a conference's `end_date` to yesterday → confirm its
      non-cancelled attendees + accepted speakers + committee appear in the
      Alumni tab → apply filters → export CSV → confirm rows match.

## Ship

- [ ] Move this folder from `openspec/changes/` to `openspec/shipped/` in
      the implementing PR.
