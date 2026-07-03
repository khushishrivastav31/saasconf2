# MAIN-13429: Tasks

> This ticket adds tests, not features — "RED" means confirming no such coverage
> exists today (true per recon), "GREEN" means the new test passing unmodified
> against current app code. No OpenAPI drift (no API changes). No handbook update
> (test-only, not user-visible).

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval
      before writing any test code.**

## RED (in spirit) — confirm the gap

- [ ] Confirm (already done in recon) that no existing test chains
      program-year → placement → registration → invoice → payment → park →
      reassign in one scenario.

## Build — new tests

- [ ] `backend/tests/trainings/test_training_full_path.py`: write the chained
      scenario per `design.md`, asserting at each step boundary.
- [ ] Reuse existing Stripe-mocking fixture (find it in `test_training_finance.py`
      or invoice tests) rather than introducing a new mock approach.
- [ ] `frontend/e2e/training-full-path.spec.ts`: env-gated (`E2E_TRAINING_SLUG`)
      spec driving the same path through the UI.
- [ ] Extend `frontend/e2e/pages/training.page.ts` with the form-fill/assert
      methods the new spec needs.

## Verify

- [ ] `venv/bin/python -m pytest tests/trainings/test_training_full_path.py -v`
      passes against current app code.
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml` clean.
- [ ] `ruff check app/ && ruff format --check app/` clean.
- [ ] Full backend suite `pytest tests/ -n 4 -q` stays green (new test doesn't
      leak state affecting other tests — check tenant/DB isolation).
- [ ] Run the new Playwright spec against a seeded local/staging target with
      `E2E_TRAINING_SLUG` set; confirm it passes.
- [ ] If the full path surfaces an actual bug while writing the test: stop,
      file a separate ticket, do not silently patch app code inside this
      test-only change.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `test(trainings): add full end-to-end path coverage
      for the Training module (MAIN-13429)`; PR per workflow, `--auto --squash`
      once green.
