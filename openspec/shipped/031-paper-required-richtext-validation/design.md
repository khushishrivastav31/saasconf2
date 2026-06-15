# Design — Required built-in rich-text field enforcement

## Where validation lives

`POST /portal/papers/{id}/submit` in
`backend/app/api/v1/cfp_portal/papers/authored.py` is the **authoritative
gate**. It already:

1. Loads `builtin_fields_config` (form variant first, conference schema
   fallback).
2. Iterates the config; for each `visible && required` field, checks the
   paper's value.
3. Separately validates character limits, stripping HTML via
   `strip_html_for_char_count()`.

The defect is only in step 2: it uses `if not val` for **all** fields, but
rich-text fields can hold "empty" markup.

## Field classification

```
HTML_PAPER_FIELDS = {"abstract_short", "abstract_long", "learning_objectives"}
# plain: title, level, session_type, topics
```

This mirrors the `is_html` flags already encoded in the endpoint's
`char_limit_fields` dict, so the single source of truth should be shared.

## Emptiness check

```python
def _paper_field_is_blank(field_key: str, value) -> bool:
    if value is None:
        return True
    if field_key in HTML_PAPER_FIELDS:
        return strip_html_for_char_count(value) == ""
    # lists (topics) and scalars
    if isinstance(value, (list, tuple, set)):
        return len(value) == 0
    return not str(value).strip()
```

`strip_html_for_char_count` already removes tags and trims whitespace, so
`<p></p>`, `<p><br></p>`, `<p>&nbsp;</p>` → `""` → blank. (Note `&nbsp;` is a
non-tag entity; if `strip_html_for_char_count` does not decode entities, extend
it to treat `&nbsp;`/`\xa0` as whitespace, or decode before stripping. Verify
with a test for the `&nbsp;` case.)

Both the `builtin_cfg` loop and the legacy `required_paper_fields` loop call
this helper instead of the inline `if not val`.

## Why not fix only the frontend

The endpoint comment already declares `builtin_fields_config` "the
authoritative source for required + char-limit validation." Client
normalisation (RichTextEditor) is best-effort and bypassable (API clients,
source toggle, future editors). The backend fix is necessary and sufficient;
the frontend hardening is defence-in-depth to avoid storing junk markup in the
first place.

## Risk / blast radius

- Pure tightening of an existing check — papers that were previously
  submittable with blank rich-text required fields will now be correctly
  blocked. No schema/migration change. No API contract change (same 422 shape).
- Existing legacy tests use real content and remain green.
- Edge case to cover in tests: a field that is **not** required but contains
  `<p></p>` must still submit fine (no over-blocking).
