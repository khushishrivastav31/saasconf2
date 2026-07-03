# MAIN-13428: Tasks

> Lint cleanup only, no behavior change. No new tests (existing test suite must
> stay green as a correctness check on any refactor done to fix warnings). No
> OpenAPI drift. No handbook update (not user-visible).

## Gate

- [x] **Reviewed/approved by user (2026-07-03).** ESLint-vs-ruff scope
      correction confirmed; backend `ruff check .` gap (79 violations in
      `tests/`/`scripts/`) confirmed **out of scope** — file separately if
      wanted, don't bundle into this change.

## Implementation

- [ ] Measure current `pnpm exec eslint src/` warning count (baseline).
- [ ] Group warnings by rule; run `eslint --fix` for auto-fixable rules.
- [ ] Manually resolve remaining warnings down to at least 20 below baseline —
      real fixes (remove dead code, add missing deps to hooks, etc.), not
      blanket `eslint-disable`.
- [ ] Update `--max-warnings` in `ci.yml:232` and `_verify.yml:171` to the new
      count (+ small buffer).
- [ ] Reconcile `Makefile:99` (`--max-warnings 0`) vs. the new CI ceiling —
      align or document the intentional difference.

## Verify

- [ ] `cd frontend && pnpm exec eslint src/` — confirm new count matches target.
- [ ] `cd frontend && pnpm exec tsc --noEmit` — no new type errors introduced by
      warning fixes.
- [ ] Full frontend test suite `pnpm test` stays green (fixes didn't change
      behavior).

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `chore(lint): reduce ESLint warning count and lower CI
      ceiling (MAIN-13428)`; PR per workflow, `--auto --squash` once green.
