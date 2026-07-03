# MAIN-13440: Tasks

> Backend policy/guard change + frontend toggle. No new endpoint (reuses
> existing draft-save/submit mutation) → likely no OpenAPI drift, confirm
> during implementation. User-visible → handbook update required.

## Gate

- [x] **Reviewed/approved by user (2026-07-03).** Policy confirmed: always
      allowed, but audited (no paper-status write guard; edits are tracked
      via `last_edited_at`/`edit_count`).

## RED — tests first

Backend (`backend/tests/test_cfp_portal_reviews.py` or sibling):
- [ ] Editing a submitted review on a paper still in `final_consideration`
      succeeds and updates stored content.
- [ ] Editing a submitted review on a paper that's `accepted`/`rejected`
      also succeeds (no status guard) and stamps `last_edited_at`/
      `edit_count`.
- [ ] Editing an already-submitted review doesn't spuriously re-trigger the
      "all reviewers submitted → advance paper status" transition.
- [ ] Aggregate/average score reflects the edited review afterward.
- [ ] Run and confirm they fail for the right reason (blanket rejection
      still in place).

Frontend:
- [ ] "Edit" button appears on a reviewer's own submitted review.
- [ ] Clicking it reveals the editable form pre-filled with existing
      content; re-submitting persists the change.
- [ ] `EvaluatedPapersTab` refreshes correctly after an edit+resubmit
      (via the same callback pattern `AssignedPapersTab` already uses).

## GREEN — implementation

- [ ] Migration: add `PaperReview.last_edited_at`/`edit_count` columns.
- [ ] Remove the blanket write-rejection at `reviews.py:272-273`; stamp
      `last_edited_at`/`edit_count` on every write to an already-submitted
      review, regardless of paper status.
- [ ] Verify the paper-status-advance condition at `reviews.py:454-476`
      counts distinct submitted reviewers, not raw writes.
- [ ] Add "Edit" button + `isEditing` toggle to `ReviewForm.tsx`'s read-only
      submitted view.
- [ ] Wire `EvaluatedPapersTab.tsx:210` with the same refresh callback
      `AssignedPapersTab.tsx:286` uses.
- [ ] Surface the audit trail (edited-after-submission / edited-after-
      decision) as a small badge in `ReviewsPanel.tsx`.
- [ ] Re-run targeted tests → green.

## REFACTOR

- [ ] Confirm no duplicated submit/re-submit logic between draft and
      edit-after-submit paths.

## Verify (full sweep)

- [ ] `venv/bin/python -m pytest tests/test_cfp_portal_reviews.py -v`
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] Full sweep: backend `pytest tests/ -n 4 -q`, frontend `pnpm test`
- [ ] Confirm `pnpm gen:api:check` clean (no schema change expected, verify).
- [ ] Update `frontend/src/pages/Handbook/handbookSections.tsx`.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `feat(cfp): allow reviewers to edit a submitted
      evaluation (MAIN-13440)`; PR per workflow, `--auto --squash` once
      green.
