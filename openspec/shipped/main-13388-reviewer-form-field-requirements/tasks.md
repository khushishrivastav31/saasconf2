# MAIN-13388: Tasks

## Backend

- [ ] Extract `_strip_html(html: str) -> str` helper (regex-based) to `backend/app/schemas/review.py` or a shared util
- [ ] Add `speaker_feedback_min_length` Pydantic field_validator to `PaperReviewSubmit` in `backend/app/schemas/review.py`
- [ ] In `submit_or_save_review` endpoint (`reviews.py`), add `submit=True` guard: require speaker_feedback when `form_settings.enable_speaker_feedback` and enforce 200-char plain-text minimum
- [ ] Write backend tests:
  - Submitting with `enable_speaker_feedback=True` and empty feedback → 422
  - Submitting with feedback < 200 chars → 422
  - Submitting with feedback ≥ 200 chars → 200
  - Saving draft with empty feedback → 200 (no validation)

## Frontend

- [ ] Add `validateForSubmit()` in `ReviewForm.tsx`:
  - All criterion question `selected_option_id` must be non-null
  - If `enable_speaker_feedback`: plain-text length of `speakerFeedback` ≥ 200 and non-empty
- [ ] Add per-question inline error state (`Map<string, string>`) and render error below each unanswered question's radio group
- [ ] Add error state for speaker feedback and render below the `RichTextEditor`
- [ ] Pass `minLength={200}` to the speaker feedback `<RichTextEditor>`
- [ ] Mark required fields with `*` in labels (criterion questions + speaker feedback)
- [ ] Update global `formError` to show "Please fix the errors above" summary when inline errors exist
- [ ] Write frontend tests:
  - Submit with no answers → shows per-question errors
  - Submit with speaker feedback < 200 chars → shows feedback error
  - Submit with all valid → calls mutation
  - Save Draft with empty fields → no errors, calls draft mutation

## OpenAPI

- [ ] Run `pnpm gen:api` after backend changes and commit updated `frontend/src/types/api.generated.ts`

## Handbook

- [ ] Update `frontend/src/pages/Handbook/handbookSections.tsx` if reviewer instructions mention the feedback field
