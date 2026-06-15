# Change 031 — Required built-in rich-text fields not enforced on paper submit

## Status
`planned` · Branch: `fix/paper-required-richtext-validation`

## Methodology
TDD — Red → Green → Refactor.

## Problem

In the CFP **Paper Form Builder**, a tenant admin can mark a built-in field as
**Required** (e.g. *Long Abstract* / `abstract_long`). Saving the toggle works
— the `required: true` flag persists in `builtin_fields_config`. But the
requirement is **not enforced when a speaker submits a paper**: a paper with an
empty Long Abstract can still be submitted.

### Root cause (reproduced)

The portal submit endpoint `POST /portal/papers/{id}/submit`
(`app/api/v1/cfp_portal/papers/authored.py`) validates required built-in fields
with a raw truthiness check:

```python
val = paper_field_map.get(field_key)
if not val:
    missing.append(f"paper:{field_key}")
```

Three built-in fields — `abstract_short`, `abstract_long`,
`learning_objectives` — are **rich-text** fields rendered by `RichTextEditor`.
When "empty", they are frequently stored not as `NULL`/`""` but as residual
HTML such as `<p></p>`, `<p><br></p>`, or `<p>&nbsp;</p>`:

- TipTap emits `<p><br></p>` after typing-then-deleting a line.
- The editor's HTML **source** toggle (`handleSourceChange`) calls
  `onChange(html)` without the empty-normalisation that the rich path applies.
- The frontend only normalises the exact string `<p></p>` → `''`; every other
  visually-empty variant slips through.

Because `"<p></p>"` is truthy, `if not val` treats the field as filled and the
paper submits — even though it renders blank to reviewers.

This was confirmed with a reproduction test:

| `abstract_long` value | required=true | Result | Correct? |
|----------------------|---------------|--------|----------|
| `NULL`               | yes           | 422 blocked | ✅ |
| `"<p></p>"`          | yes           | **200 submitted** | ❌ bug |

The char-limit validation in the same endpoint already strips HTML via
`strip_html_for_char_count()` before counting — the required check does not.
This change brings the required check in line.

## Proposed Change

1. **Strip HTML before the emptiness check for rich-text built-in fields** in
   the submit endpoint's required-field validation. Reuse the existing
   `strip_html_for_char_count()` helper (which removes tags and trims
   whitespace) for `abstract_short`, `abstract_long`, `learning_objectives`;
   keep the plain truthiness check for non-HTML fields (`title`, `level`,
   `session_type`, `topics`). A field is "missing" when its plain-text content
   is empty after stripping.

2. **Apply the same correction to the legacy `required_paper_fields` fallback
   path** so behaviour is consistent regardless of which config drives
   validation.

3. **Harden the frontend `RichTextEditor` empty-normalisation** so the source
   toggle and non-exact empty variants (`<p><br></p>`, whitespace/`&nbsp;`
   only) also normalise to `''`. This is defence-in-depth; the backend remains
   the authoritative gate.

## Out of Scope

- Custom (non-built-in) field required validation — custom rich-text fields are
  a separate follow-up if the same gap exists there.
- Form-variant `builtin_fields_config` staleness (a variant copies config at
  creation time and may diverge from the Standard Form) — tracked separately.
- Client-side required validation on `SubmitPaperPage` (it only saves drafts;
  the authoritative submit gate is the backend endpoint).
- Changing how rich-text content is stored.

## Affected Code

- `backend/app/api/v1/cfp_portal/papers/authored.py` — `submit_paper` required
  validation block.
- `backend/app/api/v1/cfp/_paper_helpers.py` — reuse / possibly export an
  `is_blank_field` helper.
- `frontend/src/components/common/RichTextEditor.tsx` — empty normalisation.
- Tests: `backend/tests/cfp_portal/test_cfp_portal_papers_deep.py` (or a new
  `test_cfp_portal_submit_required.py`).

## Spec

See `openspec/specs/` once implementation lands.
