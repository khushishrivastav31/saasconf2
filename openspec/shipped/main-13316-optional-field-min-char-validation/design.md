# Design — Optional fields must not enforce minimum character count

## Where validation lives

`POST /portal/papers/{id}/submit` in
`backend/app/api/v1/cfp_portal/papers/authored.py` is the authoritative gate.
It runs two independent passes over `builtin_fields_config`:

1. **Required-field pass** — for each `visible && required` field, blocks
   submission if the value is blank (`paper_field_is_blank`, fixed in
   Change 031 to treat empty rich-text markup as blank). Optional fields are
   correctly skipped here.
2. **Character-limit pass** — for each `visible` field with `min_chars` /
   `max_chars`, blocks submission if the (HTML-stripped) length is out of
   range.

The defect is in pass 2: `min_chars` is enforced even when the field is empty,
which collides with pass 1's (correct) decision that an empty optional field is
fine.

## Fix

A minimum length constrains content, so it only applies to non-empty content:

```python
plain = strip_html_for_char_count(value) if is_html else (value or "").strip()
min_c = cfg.get("min_chars")
max_c = cfg.get("max_chars")
# Minimum length applies to *content*, not to emptiness. An empty optional
# field is allowed; an empty required field is already blocked by the
# required-field check above. Only enforce the minimum when content exists.
if plain and min_c is not None and len(plain) < min_c:
    char_errors.append(...)
if max_c is not None and len(plain) > max_c:
    char_errors.append(...)
```

`plain` is the already-stripped, already-trimmed plain text, so `if plain`
is the exact "has visible content" signal — consistent with
`strip_html_for_char_count`'s contract and with `paper_field_is_blank`.

## Why this is sufficient

- An empty **required** field is still blocked — by the required-field pass,
  which is the correct error ("Missing required fields"), not a misleading
  character-count error.
- A **filled** field (required or optional) still gets full min/max
  enforcement.
- No double-reporting: an empty required field surfaces one required error,
  not also a "min characters" error.

## Risk / blast radius

- Pure loosening of an over-eager check, scoped to empty fields only. Papers
  that were wrongly blocked become submittable; nothing that should be blocked
  is unblocked (required emptiness is handled separately).
- No schema/migration. No API contract change. Same 422 shape when min/max
  genuinely fails on non-empty content.
- Edge cases covered by tests: empty optional (now passes), empty required
  (still 422 via required pass), short non-empty optional (still 422 via
  char pass), valid-length (passes).
