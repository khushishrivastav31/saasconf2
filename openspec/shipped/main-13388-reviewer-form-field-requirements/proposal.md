# MAIN-13388: Update Reviewer Form Field Requirements

## Problem

The reviewer form (`ReviewForm.tsx`) currently has no frontend validation on submit. A reviewer can submit a review without selecting options for any question, without providing speaker feedback, and the speaker feedback field has no minimum length — only a 2000-char maximum. This means reviewers can submit low-effort or empty reviews.

## Proposed Solution

Add frontend validation that fires when the reviewer clicks **Submit Review** (not Save Draft). Gate the submit path on:

1. **Criterion question answers** — every visible question must have a `selected_option_id` selected.
2. **Speaker Feedback** — when enabled (`enable_speaker_feedback`), the field is **required** and must contain at least **200 characters** of plain text.
3. **Internal Comment** — remains optional (no validation).
4. **Must Have** — remains optional (it is a checkbox; no validation needed).

Add matching backend validation in `PaperReviewSubmit` so that a direct API call also cannot bypass the frontend rules.

## Out of Scope

- Saving a draft (`submit=false`) — drafts bypass all validation intentionally.
- The `comment_requirement` logic per question (already handled by `question.comment_requirement`; no changes needed there).
- DB schema or migrations — no column changes required.
