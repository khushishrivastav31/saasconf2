# MAIN-13443: Tasks

> Frontend-primary change; backend sort work only if list endpoint is
> paginated (confirm during implementation). OpenAPI regen only if a
> `sort_by` query param is added to `/cfp/papers`. User-visible → handbook
> update required.

## Gate

- [x] **Reviewed/approved by user (2026-07-03).** Scope confirmed:
      `CFPEvaluatedPapers.tsx` only — `PaperDetailModal.tsx` is out of scope.

## RED — tests first

Frontend (`frontend/src/pages/modules/cfp/__tests__/CFPEvaluatedPapers.test.tsx`
and `EvaluatedPaperCard.test.tsx`):
- [x] Sorting by Session Type orders the list correctly, both directions.
- [x] Sorting by average score orders correctly, both directions, with
      unscored papers placed consistently (not interleaved as `0`).
- [x] Expanded paper card shows `learning_objectives`, `video_url`,
      `custom_field_answers`.

Backend (only if server-side sort is needed — confirm pagination first):
- [x] Confirmed client-side sort is sufficient — no backend change needed
      (see GREEN notes below).
- [x] Run and confirm frontend tests fail for the right reason (no sort
      control exists yet).

## GREEN — implementation

- [x] Confirm client-side vs. server-side sort need (check pagination on
      current endpoint). `GET /cfp/papers` is paginated (`page`/`page_size`,
      default 100), but `CFPEvaluatedPapers.tsx` already fetches without
      pagination params and sorts/searches only over that single fetched
      page — matching the existing client-side search precedent. Went with
      client-side sort, consistent with current behavior; no backend change.
- [x] Add sort controls to `CFPEvaluatedPapers.tsx`.
- [x] Add missing fields (`learning_objectives`, `video_url`,
      `custom_field_answers`) to `EvaluatedPaperCard`, reusing reviewer-view
      sub-components where they exist (`VideoAttachmentLink`,
      `MediaPreviewModal`, `useAuthMedia`, `RichTextDisplay`). Custom field
      labels/types resolved via a single extra `paper-form-schema` fetch at
      the list level (not per-card) to avoid N+1 requests.
- [x] Re-run targeted tests → green.

## REFACTOR

- [x] Extracted `getAverageScore` to `frontend/src/utils/paperScore.ts`,
      shared between the list's sort comparator and the card's inline score
      display (previously duplicated). No shared "full paper detail" block
      extracted — `PaperDetailModal.tsx` and `EvaluatedPaperCard.tsx` remain
      genuinely different permission/UI contexts, per design.md.

## Verify (full sweep)

- [x] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [x] `pnpm test`
- [x] Backend not touched — no backend verification needed.
- [x] No `sort_by` param added — no OpenAPI regen needed.
- [x] Updated `frontend/src/pages/Handbook/sections/content.tsx` (2.1.4
      Evaluated Papers).

## Ship

- [x] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `feat(cfp): sort evaluated papers and show full
      detail in admin view (MAIN-13443)`; PR per workflow, `--auto --squash`
      once green.
