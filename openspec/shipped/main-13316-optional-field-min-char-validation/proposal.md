# Change MAIN-13316 — "Required" checkbox ignored: optional paper fields still enforce min characters

## Status
`planned` · Branch: `fix/main-13316-optional-field-min-char`

## Methodology
TDD — Red → Green → Refactor.

## Problem

In the CFP **Paper Form Builder**, a tenant admin unchecks **Required** for a
built-in field (e.g. *Long Abstract* / `abstract_long`, labelled *Detailed
Abstract* in the portal) while leaving its **Min** character limit set (e.g.
`500`). The intent: the field is optional, but if a speaker fills it in, it
must be at least 500 characters.

Instead, a speaker cannot submit a paper while the optional field is **empty**:

> Detailed Abstract must be at least 500 characters (currently 0)

So the **Required** toggle appears to "not work" — an optional field behaves as
if it were required.

### Root cause

The portal submit endpoint `POST /portal/papers/{id}/submit`
(`backend/app/api/v1/cfp_portal/papers/authored.py`) validates character limits
independently of the required-field check:

```python
plain = strip_html_for_char_count(value) if is_html else (value or "").strip()
min_c = cfg.get("min_chars")
if min_c is not None and len(plain) < min_c:
    char_errors.append(f"{label} must be at least {min_c} characters (currently {len(plain)})")
```

The `min_chars` check fires for **every visible field**, regardless of the
`required` flag and regardless of whether the field has any content. An empty
optional field has `len(plain) == 0 < 500`, so it is blocked.

A minimum-length is a constraint on **content**: it should only apply when the
field is non-empty. Emptiness of a *required* field is already handled by the
required-field check earlier in the same endpoint (which correctly skips
optional fields).

| `abstract_long` | required | min_chars | content | Result | Correct? |
|-----------------|----------|-----------|---------|--------|----------|
| empty           | false    | 500       | 0 chars | **422 blocked** | ❌ bug |
| empty           | true     | 500       | 0 chars | 422 (missing required) | ✅ |
| 10 chars        | false    | 500       | 10 chars | 422 (too short) | ✅ |
| 600 chars       | false    | 500       | 600 chars | 200 | ✅ |

## Solution

Enforce `min_chars` only when the field has content. The `max_chars` check is
unchanged (it can never trigger on empty content anyway, but stays explicit).

This is a one-line guard in the existing char-limit loop. No schema change, no
migration, no API contract change (same 422 shape when it does fire).

## Scope

- **Backend** (authoritative gate): `authored.py` char-limit loop.
- **Frontend**: none required — the portal does not duplicate the
  "must be at least N characters" submit-time error; it originates from the
  backend and is surfaced verbatim. The editor's live min/max hint is advisory
  and already only colours the counter, it does not block submission.

## Out of scope

- Changing how `min_chars` / `max_chars` are stored or configured.
- The required-field check itself (correct since Change 031).
