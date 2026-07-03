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

- [x] Measure current `pnpm exec eslint src/` warning count (baseline: **110**;
      106 `max-lines`, 2 `react-hooks/incompatible-library`, 2
      `react-refresh/only-export-components`). No auto-fixable rules — `max-lines`
      requires splitting files.
- [x] Group warnings by rule; run `eslint --fix` for auto-fixable rules (none
      applicable — all warnings are structural).
- [x] Manually resolve warnings down to at least 20 below baseline: split 21
      over-400-LOC files by extracting cohesive subcomponents, hooks, types, and
      constants into sibling modules. Final count **89** (21 below baseline).
      No blanket `eslint-disable`; the one react-refresh regression introduced
      mid-way (PaperCards) was fixed by moving the non-component helper out.
- [x] Update `--max-warnings` from 120 to **90** (count 89 + small buffer,
      rounded up to nearest 10) in `ci.yml` and `_verify.yml`, with a ratchet
      comment.
- [x] Reconcile `Makefile`'s `--max-warnings 0`: kept intentionally stricter
      (aspirational zero-warning local target) and documented the difference in
      a comment.

## Verify

- [x] `cd frontend && pnpm exec eslint src/ --max-warnings 90` — passes (89
      warnings ≤ 90).
- [x] `cd frontend && pnpm exec tsc --noEmit` — clean, no new type errors.
- [x] Full frontend test suite `pnpm test` — 182 files / 2278 tests pass.

## Ship

- [x] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `chore(lint): reduce ESLint warning count and lower CI
      ceiling (MAIN-13428)`; PR per workflow (manual merge — no `--auto`).
