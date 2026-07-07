# MAIN-13440: Tasks

> Backend policy/guard change + frontend toggle. No new endpoint (reuses
> existing draft-save/submit mutation), but `last_edited_at`/`edit_count`
> must be added to `PortalExistingReviewResponse` (`cfp_portal.py:480`) and
> `PaperReviewSummary` (`cfp_papers.py:177`) so the frontend can render the
> edit state / audit badge → **this changes the OpenAPI schema**, run
> `pnpm gen:api` and commit `api.generated.ts`. User-visible → handbook
> update required.

## Gate

- [x] **Reviewed/approved by user (2026-07-03).** Policy confirmed: always
      allowed, but audited (no paper-status write guard; edits are tracked
      via `last_edited_at`/`edit_count`).

## Policy refinement — confirmed with user (2026-07-03, second pass)

No separate "save as draft" path once a review is submitted. The read-only
submitted view's "Edit" button only re-enables **resubmit** (`submit=true`);
`submit=false` against an already-submitted review remains blocked (400),
same as today — this avoids a submitted review ever silently flipping back
to `draft` (which would drop it out of the submitted-reviews count and out
of speaker-feedback visibility on an already-decided paper). Only the
`submit=true` branch of the existing guard is relaxed.

## RED — tests first

Backend (`backend/tests/cfp/test_reviewer_workflow.py`):
- [x] Re-submitting (`submit=true`) an already-submitted review succeeds and
      updates stored content (replaces the old
      `test_cannot_resubmit_an_already_submitted_review` expectation).
- [x] Saving a draft (`submit=false`) against an already-submitted review
      still returns 400 — unchanged from today
      (`test_cannot_save_draft_after_submitted` stays as-is).
- [x] Re-submitting a submitted review on a paper that's `accepted`/
      `rejected` also succeeds (no paper-status guard) and stamps
      `last_edited_at`/`edit_count`.
- [x] Re-submitting an already-submitted review doesn't spuriously re-fire
      the "all reviewers submitted → advance paper status" transition
      (two-reviewer scenario: paper already advanced off `in_evaluation`,
      edit doesn't change that).
- [x] Aggregate/total score reflects the edited answer afterward.
- [x] `last_edited_at`/`edit_count` are absent/zero after the *initial*
      submit, and only increment on a subsequent resubmit.
- [x] Run and confirm they fail for the right reason (blanket rejection on
      `submit=true` still in place).

Frontend (`frontend/src/components/portal/__tests__/ReviewForm.test.tsx`):
- [x] "Edit" button appears on a reviewer's own submitted review.
- [x] Clicking it reveals the editable form pre-filled with existing
      content; re-submitting persists the change.
- [x] `EvaluatedPapersTab` refreshes correctly after an edit+resubmit
      (via the same callback pattern `AssignedPapersTab` already uses) —
      not independently unit-tested; `AssignedPapersTab`, which already has
      the same wiring, has no dedicated test file either, and the callback
      invocation itself is covered by `ReviewForm`'s own tests.

Note: two pre-existing tests elsewhere encoded the old "cannot resubmit"
behavior and were updated in the same pass:
`backend/tests/cfp_portal/test_cfp_portal_papers.py::test_resubmit_review_fails`
→ `test_resubmit_review_succeeds` (+ new `test_save_draft_after_submit_still_fails`),
and `backend/tests/cfp/test_cfp_admin_deep.py::test_submit_review_cannot_resubmit`
→ `test_submit_review_can_resubmit_with_valid_feedback`.

## GREEN — implementation

- [x] Migration: add `PaperReview.last_edited_at`/`edit_count` columns.
- [x] Narrow the blanket write-rejection at `reviews.py:272-273`: keep
      blocking `submit=false` against an already-submitted review (400,
      unchanged); allow `submit=true` (resubmit) unconditionally, stamping
      `last_edited_at`/`edit_count` on that path regardless of paper status.
- [x] Add "Edit" button to `ReviewForm.tsx`'s read-only submitted view that
      only exposes resubmit — no "Save Draft" affordance in the edit-after-
      submit state.
- [x] Add `last_edited_at`/`edit_count` to `PortalExistingReviewResponse`
      (`cfp_portal.py:480`) and `PaperReviewSummary` (`cfp_papers.py:177`);
      regenerate `pnpm gen:api` and commit `api.generated.ts`.
- [x] Confirm the paper-status-advance condition at `reviews.py:454-476`
      (`if paper.status == PaperStatus.IN_EVALUATION.value`) is already
      idempotent against edit-in-place — verified by test, no code change
      expected since it only flips a paper still in `IN_EVALUATION`.
- [x] Add "Edit" button + `isEditing` toggle to `ReviewForm.tsx`'s read-only
      submitted view.
- [x] Wire `EvaluatedPapersTab.tsx:210` with the same refresh callback
      `AssignedPapersTab.tsx:286` uses.
- [x] Surface the audit trail (edited-after-submission / edited-after-
      decision) as a small badge in `ReviewsPanel.tsx`.
- [x] Re-run targeted tests → green.

## REFACTOR

- [x] Confirm no duplicated submit/re-submit logic between draft and
      edit-after-submit paths.

## Verify (full sweep)

- [x] `venv/bin/python -m pytest tests/test_cfp_portal_reviews.py -v`
- [x] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [x] `ruff check app/ && ruff format --check app/`
- [x] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [x] Full sweep: backend `pytest tests/ -n 4 -q`, frontend `pnpm test`
- [x] Confirm `pnpm gen:api:check` clean (no schema change expected, verify).
- [x] Update `frontend/src/pages/Handbook/handbookSections.tsx`.

## Ship

- [x] Move this folder to `openspec/shipped/` in the same PR.
- [x] Conventional commit `feat(cfp): allow reviewers to edit a submitted
      evaluation (MAIN-13440)`; PR per workflow, `--auto --squash` once
      green.
