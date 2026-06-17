# Tasks — MAIN-13316

## RED
- [ ] Add test: empty **optional** field with `min_chars` set submits OK (200).
- [ ] Add test: non-empty but **too-short** optional field still blocked (422,
      char error).
- [ ] Add test: empty **required** field with `min_chars` still blocked, via the
      required-field path (422, `missing_fields`), not a char error.
- [ ] Run targeted tests, confirm the first one fails for the right reason.

## GREEN
- [ ] Guard the `min_chars` check in `authored.py` with `if plain and ...`.
- [ ] Re-run targeted tests, confirm green.

## REFACTOR
- [ ] Comment the intent; confirm no duplication with the required-field pass.

## VERIFY
- [ ] `pytest tests/cfp/test_paper_submission.py -v`
- [ ] `mypy app/`, `ruff check app/`, `ruff format --check app/`
- [ ] Full backend sweep `pytest tests/ -n 4 -q`
- [ ] No OpenAPI drift (no endpoint/schema change) — skip `gen:api` unless
      `gen:api:check` reports drift.

## SHIP
- [ ] Move this folder to `openspec/shipped/` in the same PR.
