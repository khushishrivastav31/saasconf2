# Tasks — Required built-in rich-text fields not enforced on submit

## Phase 0 — Recon (done during planning)

- [x] Confirm save path persists `required: true` in `builtin_fields_config`
      (admin PUT `/paper-form-schema`) — works.
- [x] Confirm submit endpoint reads `builtin_fields_config` (variant →
      conference schema fallback) as authoritative source.
- [x] Reproduce: `abstract_long = "<p></p>"` + required → submit returns 200
      (should be 422). `NULL` case correctly returns 422.
- [x] Identify rich-text built-in fields: `abstract_short`, `abstract_long`,
      `learning_objectives`. Plain fields: `title`, `level`, `session_type`,
      `topics`.

## Phase 1 — Backend required validation (primary fix)

### RED
- [ ] Add test: form schema marks `abstract_long` required; paper has
      `abstract_long = "<p></p>"` → submit returns 422 with
      `paper:abstract_long` in `missing_fields`.
- [ ] Add test: `<p><br></p>` and `<p>&nbsp;</p>` variants → also 422.
- [ ] Add test: legacy `required_paper_fields` path with empty-HTML
      `abstract_long` → 422 (consistency).
- [ ] Add green-path test: non-empty rich text (`<p>Real content</p>`) with
      required=true → submit 200.
- [ ] Confirm the empty-HTML tests fail before implementation.

### GREEN
- [ ] In `submit_paper` required-field loop, branch on whether the field is a
      rich-text/HTML field. For HTML fields, treat as missing when
      `strip_html_for_char_count(val)` is empty; for others keep `if not val`.
- [ ] Apply the same logic to the legacy `required_paper_fields` fallback loop.
- [ ] Re-run targeted tests → green.

### REFACTOR
- [ ] Extract a small helper (e.g. `_field_is_blank(field_key, value)` or
      reuse a set `HTML_PAPER_FIELDS`) so the rich-text set is defined once and
      shared between the required check and the existing char-limit check.
- [ ] Verify no duplicated field-key lists drift apart.

## Phase 2 — Frontend defence-in-depth

### RED
- [ ] Vitest: `RichTextEditor` `onChange` emits `''` for `<p><br></p>` and
      whitespace/`&nbsp;`-only content (source toggle + edit paths).

### GREEN
- [ ] Replace exact `=== EMPTY_BODY` comparison with a normalise helper that
      strips tags/`&nbsp;`/whitespace and emits `''` when blank; apply on both
      `onUpdate` and `handleSourceChange`.

### REFACTOR
- [ ] Ensure the normalise helper is unit-testable and used in one place.

## Phase 3 — Verify sweep (mandatory before PR)

- [ ] `cd backend && venv/bin/python -m pytest tests/cfp_portal/ -v`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] No OpenAPI schema change expected (no endpoint/schema signature change) —
      run `pnpm gen:api:check` to confirm no drift.
- [ ] Handbook: no user-visible UI change; update only if wording about
      required fields needs clarifying.

## Phase 4 — Ship

- [ ] Present commit message + PR title, ask once.
- [ ] On approval: commit, push, open PR. (No auto-merge — user merges.)
- [ ] After merge: move `openspec/changes/031-…` → `openspec/shipped/`.
