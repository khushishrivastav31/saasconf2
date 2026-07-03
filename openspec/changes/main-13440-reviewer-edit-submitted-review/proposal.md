# MAIN-13440: Reviewer can edit a submitted evaluation

## Status
`draft` · Branch: _to be created on approval_ (`feat/reviewer-edit-submitted-review`)

## Methodology
TDD — Red → Green → Refactor.

## Problem

Ticket (Story): "As Reviewer, I need to edit the evaluated paper, we need to
add a button 'edit' for that function."

### Recon findings (2026-07-02) — real backend blocker, not just a missing button

- `backend/app/api/v1/cfp_portal/reviews.py:272-273` explicitly **rejects any
  write once a review is submitted**:
  ```python
  if review and review.status == ReviewStatus.SUBMITTED.value:
      raise HTTPException(status_code=400, detail="Review has already been submitted")
  ```
  So "add an Edit button" is not a pure frontend change — the backend has to
  allow un-submitting/re-editing first, or this is just a button that always
  errors.
- Frontend: `frontend/src/components/portal/ReviewForm.tsx:176-300` — when
  `existing_review.status === 'submitted'`, the form renders fully
  read-only (`ReadOnlyCriterionSection`/`ReadOnlyQuestion`, lines 258-299,
  570-670), no Edit affordance today.
- Submitting all assigned reviewers' reviews triggers a status transition
  (paper moves to `final_consideration`) at
  `backend/app/api/v1/cfp_portal/reviews.py:454-476`. Allowing edits after
  submission means handling the case where a paper already moved to
  `final_consideration` (or beyond, e.g. accepted/rejected) — editing a
  review on an already-decided paper needs a policy decision (allowed
  freely? blocked once the paper itself has a final decision? admin
  notified?).
- Used from `frontend/src/pages/portal/EvaluatedPapersTab.tsx:210`
  (`<ReviewForm assignmentId=... />`, no `onReviewSubmitted` callback wired
  today) and `AssignedPapersTab.tsx:286` (has the callback, used for
  drafts).

## Proposed Change

**Policy confirmed with user (2026-07-03): always allowed, but audited.** A
reviewer can edit their submitted review at any time, including after the
paper reaches a final decision (accepted/rejected) — no paper-status write
guard. Every edit stamps an audit trail (`last_edited_at`/`edit_count`) so a
post-decision edit is visible to admins even though it's not blocked.

1. **Backend**: remove the submitted-review write guard entirely
   (`reviews.py:272-273`), and stamp audit fields on every edit:
   - Add `PaperReview.last_edited_at: datetime | None` and
     `PaperReview.edit_count: int = 0` (small migration).
   - Re-running submitted-review edits must correctly re-evaluate the
     "all reviewers submitted → advance paper status" logic
     (`reviews.py:454-476`) — editing one review after the paper already
     advanced shouldn't silently re-trigger or corrupt that transition.
   - Surface the audit trail to admins, e.g. a small "edited after
     submission" (and "edited after decision") badge in `ReviewsPanel.tsx`.
2. **Frontend**: add an "Edit" button to the read-only submitted view in
   `ReviewForm.tsx` that toggles back to the editable
   (`EditableCriterionSection`) state and re-enables the draft-save/submit
   mutations already used for drafts.
3. Wire `EvaluatedPapersTab.tsx:210` with the same
   `onReviewSubmitted`-style callback `AssignedPapersTab.tsx:286` already
   has, so an edited-then-resubmitted review refreshes the evaluated-papers
   list correctly.

## Out of Scope

- Changing scoring/must-have semantics — only the editability of an
  already-submitted review.
- Notifying admins/other reviewers when a review is edited post-submission
  (could be a follow-up if wanted).

## Acceptance Criteria

- A reviewer sees an "Edit" button on their own submitted review, regardless
  of the paper's current status (including accepted/rejected).
- Editing and re-submitting updates the stored review; the paper's aggregate
  score/must-have reflects the edit.
- The paper-status-advance logic (all reviewers submitted → final
  consideration) behaves correctly when a review is edited after that
  transition already happened once.
- Every submitted-review edit is audited (`last_edited_at`/`edit_count`
  updated) and visible to admins, including edits made after the paper's
  final decision.

## Spec

See `openspec/specs/` once implementation lands.
