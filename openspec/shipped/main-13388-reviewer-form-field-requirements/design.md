# MAIN-13388: Design

## Affected Files

| File | Change |
|---|---|
| `frontend/src/components/portal/ReviewForm.tsx` | Add `validateForSubmit()` helper; block `submitMutation` when invalid; display per-field errors |
| `frontend/src/components/common/RichTextEditor.tsx` | Pass `minLength={200}` to enable counter color and existing min-length display |
| `backend/app/schemas/review.py` | Add Pydantic validators to `PaperReviewSubmit` for `speaker_feedback` min length |
| `backend/app/api/v1/cfp_portal/reviews.py` | Enforce speaker_feedback required + min-length when `submit=true` |

---

## Frontend

### Validation logic (`ReviewForm.tsx`)

Add a `validateForSubmit()` function called inside the `submitMutation.mutationFn` (or as an `onClick` guard before calling `.mutate()`). It returns a list of error strings; if non-empty, set `formError` and abort.

**Rules (only enforced when `submit=true`):**

```
for each criterion question visible to the reviewer:
  if answer.selected_option_id is null → error: "Please select an option for: <question.text>"

if config.form_settings.enable_speaker_feedback:
  plainTextLength = stripHtml(speakerFeedback).trim().length
  if plainTextLength === 0 → error: "Feedback for the speaker(s) is required."
  if plainTextLength < 200 → error: "Feedback for the speaker(s) must be at least 200 characters (currently X)."
```

The existing `formError` `<div>` displays a single string; keep that pattern but join multiple errors with newlines or render each as a list item.

### Speaker Feedback field

Add `minLength={200}` to the existing `<RichTextEditor>` for speaker feedback. `RichTextEditor` already renders the min-length counter in red when `charCount < minLength` — no component changes needed.

### UI labeling

Add a red asterisk `*` to the "Feedback for the speaker(s)" label (and to each criterion question label) to indicate required status. Do not add it to Internal Comment or Must Have.

---

## Backend

### `PaperReviewSubmit` schema (`backend/app/schemas/review.py`)

The backend cannot know which form settings are enabled without querying the DB, so the schema-level validator is limited to: **if `speaker_feedback` is provided, it must be ≥ 200 plain-text characters**.

```python
from pydantic import field_validator
import re

def _strip_html(html: str) -> str:
    return re.sub(r'<[^>]+>', '', html or '')

class PaperReviewSubmit(BaseModel):
    answers: list[ReviewAnswerSubmit]
    speaker_feedback: str | None = None
    internal_comment: str | None = None
    must_have: bool = False

    @field_validator('speaker_feedback')
    @classmethod
    def speaker_feedback_min_length(cls, v: str | None) -> str | None:
        if v is not None:
            plain = _strip_html(v).strip()
            if 0 < len(plain) < 200:
                raise ValueError('Speaker feedback must be at least 200 characters')
        return v
```

### Endpoint (`backend/app/api/v1/cfp_portal/reviews.py`)

In the `submit=True` branch, after loading `form_settings`, add:

```python
if submit and form_settings.enable_speaker_feedback:
    plain = _strip_html(data.speaker_feedback or '').strip()
    if len(plain) == 0:
        raise HTTPException(status_code=422, detail="Speaker feedback is required")
    if len(plain) < 200:
        raise HTTPException(status_code=422, detail="Speaker feedback must be at least 200 characters")
```

`_strip_html` is the same helper (extract to `app/core/text_utils.py` or inline in the schema file).

---

## Character Count Display

`RichTextEditor` already supports `minLength` — the counter turns red when `charCount < minLength` and shows `X (min 200) / 2000`. No changes needed to the component itself, only the prop passed from `ReviewForm`.

---

## Draft Behaviour

Save Draft bypasses all validation. `buildRequestBody()` and `saveDraftMutation` are unchanged.

---

## Error UX

- Inline: per-question errors shown adjacent to the unanswered question (below the radio group), using `text-red-500 text-xs` pattern.
- Global: `formError` banner at the bottom of the form collects a summary ("Please fix the errors above before submitting.").
- The Submit button becomes `disabled` while validation is running (already disabled via `isSubmitting`).
