# MAIN-13443: Sort evaluated papers by session type/score + full detail parity

## Status
`draft` · Branch: _to be created on approval_ (`feat/admin-evaluated-papers-sort-detail`)

## Methodology
TDD — Red → Green → Refactor.

## Problem

Ticket: sort evaluated papers by Session Type and average score; clicking a
paper in the admin view should show all details, matching what a reviewer
sees (currently the admin view shows less).

### Recon findings (2026-07-02)

- Admin evaluated-papers list:
  `frontend/src/pages/modules/cfp/CFPEvaluatedPapers.tsx:274-436`, fetches
  `/cfp/papers?status=final_consideration`, has only client-side text search
  (lines 319-333) — **no sort by session type or avg score today**.
- Average score is already computed client-side per card in
  `EvaluatedPaperCard` (lines 86-126) from `paper.review_summaries` — sorting
  by it can be done client-side without a backend change, if the full list is
  already fetched unpaginated. Sort by session type is a plain field sort.
  **Server-side sort is only needed if the list is paginated** — confirm
  current page size/behavior before deciding client vs. server sort.
- Admin's expandable card (`EvaluatedPaperCard`, lines 19-272) renders: level,
  abstract_short, abstract_long, internal comments, cospeakers, then
  `ReviewsPanel` (line 267) — **missing** `learning_objectives`, `video_url`,
  and `custom_field_answers`/session-type duration that the reviewer view
  shows.
- Reviewer's fuller view for comparison:
  `frontend/src/pages/portal/EvaluatedPapersTab.tsx:98-212` (video block
  147-192) and `frontend/src/pages/portal/AssignedPapersTab.tsx:118-297`
  (custom fields block 250-268, video block 199-248).
- `ReviewsPanel.tsx` (lines 42-161) already shows full per-question
  answers/comments/speaker feedback/internal comment/must_have — so "admin
  sees less" is about the **paper fields**, not the review data.
- There's a **second, separate** admin paper-detail surface:
  `frontend/src/pages/modules/cfp/CFPAssignments/PaperDetailModal.tsx:11-275`
  (used in the Assignments tab — shows video, abstracts, learning objectives,
  assigned reviewers, but no scores). **Confirmed with user (2026-07-03):
  out of scope** — this change targets `CFPEvaluatedPapers.tsx` only;
  `PaperDetailModal.tsx` is not touched.

## Proposed Change

1. Add sort controls (Session Type, Average Score — asc/desc) to
   `CFPEvaluatedPapers.tsx`, implemented client-side if the list is already
   fully loaded (matches existing client-side search pattern), or server-side
   query params on `/cfp/papers` if the list is paginated (need to confirm
   which, per recon note above).
2. Bring `EvaluatedPaperCard`'s expanded detail up to parity with the
   reviewer's `EvaluatedPapersTab`/`AssignedPapersTab` fields: add
   `learning_objectives`, `video_url` (rendered per whatever
   [[main-13441-reviewer-video-hyperlink-download]] lands as the correct video
   UI, so both surfaces stay consistent), and `custom_field_answers`.

## Out of Scope

- `PaperDetailModal.tsx` (Assignments tab) — confirmed out of scope; this
  change only touches `CFPEvaluatedPapers.tsx`. File a separate ticket if
  the same detail-parity gap should be fixed there too.
- Changing the reviewer-facing views themselves (source of truth for "full
  detail" — no changes needed there).
- Server-side average-score computation/caching if client-side sort proves
  sufficient (only add a backend aggregate if the list turns out to be
  paginated).

## Acceptance Criteria

- Admin can sort the evaluated-papers list by Session Type and by average
  score, both directions.
- Clicking into a paper from the admin evaluated-papers list shows
  `learning_objectives`, `video_url`, and `custom_field_answers` — the same
  fields a reviewer sees for the same paper.
- Sorting and detail parity work correctly for papers with zero, partial, or
  full review completion (average score of an unreviewed/partially-reviewed
  paper is handled sensibly, e.g. `null`/"—" not a crash or `NaN`).

## Spec

See `openspec/specs/` once implementation lands.
