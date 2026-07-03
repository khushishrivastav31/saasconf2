# MAIN-13440: Design

## Policy — confirmed with user (2026-07-03)

**Always allowed, but audited.** A reviewer can edit a submitted review at any
time, including after the paper's been accepted/rejected — no status-based
write guard. To keep this safe, every edit is tracked (who/when) so a late
edit (post-decision) is visible to admins even though it isn't blocked. This
matters for [[main-13445-speaker-paper-notifications]]: if a review's
feedback is shown to a speaker after a decision, a late edit changing that
feedback should be auditable, even though it's allowed.

Audit trail shape: add `PaperReview.last_edited_at: datetime | None` and
`PaperReview.edit_count: int = 0` (or a lightweight `ReviewEditLog` table if
per-edit diffs are wanted — start with the two columns unless review wants
full history). Admins should be able to see "edited after submission" (and
ideally "edited after paper decision") on the review, e.g. a small badge in
`ReviewsPanel.tsx` alongside the existing review display.

## Backend change

```python
# reviews.py, remove the blanket rejection at line 272-273 entirely —
# no paper-status check; every write also stamps the audit fields:
if review and review.status == ReviewStatus.SUBMITTED.value:
    review.last_edited_at = datetime.utcnow()
    review.edit_count = (review.edit_count or 0) + 1
    # allow the write to proceed (re-submit / re-draft), regardless of
    # paper.status
```

Re-submitting a review needs to re-run whatever aggregate/must-have
recompute happens on submit (wherever `total_score`/aggregate consumers
read from `PaperReview`, confirm nothing caches a stale aggregate
elsewhere — e.g. the average-score display work in
[[main-13443-admin-evaluated-papers-sort-detail]] reads `review_summaries`,
which must reflect the edit).

## Paper-status-advance interaction

`reviews.py:454-476` presumably counts submitted reviews to decide when to
flip the paper to `final_consideration`. If a review is edited (still
submitted, just updated content) that transition shouldn't re-fire
spuriously — the guard there should be "did the count of submitted reviews
change," not "did any review get written to," so an edit-in-place doesn't
re-trigger the advance logic incorrectly. Confirm the exact condition in
that code during implementation.

## Frontend toggle

`ReviewForm.tsx`'s existing `EditableCriterionSection` (draft-editing UI)
already exists — the "Edit" button on the read-only submitted view just
needs to flip a local `isEditing` state to reuse that same editable UI and
its existing draft-save/submit mutation, rather than building new form
components.
