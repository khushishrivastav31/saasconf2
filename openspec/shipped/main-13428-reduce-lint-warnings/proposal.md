# MAIN-13428: Decrease lint warnings from 120 ceiling by at least 20

## Status
`draft` · Branch: _to be created on approval_ (`chore/reduce-lint-warnings`)

## Methodology
No TDD applicable — lint cleanup, not behavior change. Verified by lint tool
output count, not tests.

## Problem

Ticket text: "we need to decrease the lint warnings that now are in 120 maximum,
at least 20."

### Recon findings (2026-07-02) — the premise needs correcting before scoping

**No 120-warning ceiling exists for backend ruff anywhere in the repo.**
Backend ruff runs (`ci.yml:65-68`, `_verify.yml:24-27`, `Makefile:96`) are plain
`ruff check` with no `--exit-zero` and no numeric threshold — any violation fails
outright. Running `ruff check app/` (the scope CI actually lints) today returns
**0 errors** — clean.

The only place a literal `120` ceiling exists is the **frontend ESLint** step:
`.github/workflows/ci.yml:232` and `.github/workflows/_verify.yml:171` both run
`pnpm exec eslint src/ --max-warnings 120`. `Makefile:99`'s local
`lint-frontend` target uses `--max-warnings 0`, inconsistent with CI's 120 —
itself worth reconciling.

Separately, `ruff check .` (the wider scope `Makefile:96`'s `lint-backend`
target actually runs, including `tests/` and `scripts/`, which CI does **not**
lint) currently has **79 violations** — `tests/` alone accounts for 77 of them
(top codes: `E402` module-import-not-at-top-of-file: 26, `I001`
unsorted-imports: 21, `F401` unused-import: 20, `F841` unused-variable: 5).
46 of the 79 are auto-fixable with `ruff check --fix`.

**Conclusion**: the ticket almost certainly means the frontend ESLint
`--max-warnings 120` ceiling, not backend ruff. Proceeding on that basis; flagging
the ambiguity for confirmation during review rather than guessing silently.

## Proposed Change

1. Get a live count of current ESLint warnings in `frontend/src/` (the ceiling
   is 120 but the actual count may be lower — determine current count first).
2. Fix warnings down by at least 20 from the current count (not from the
   ceiling, from whatever `eslint src/` reports today), prioritizing
   auto-fixable/mechanical rules first, then manual fixes for the rest.
3. Lower `--max-warnings` in both `ci.yml:232` and `_verify.yml:171` to match the
   new, reduced count (with a small buffer) so the ceiling can't silently drift
   back up — a ceiling only has teeth if it moves down with the actual count.
4. Reconcile `Makefile:99`'s `--max-warnings 0` vs. CI's (new, lower) ceiling —
   either tighten CI to match local, or document why they intentionally differ.

## Out of Scope

- Introducing new ESLint/ruff rules beyond what's already configured.
- Changing rule severity (error vs warning) — this ticket reduces the *count*
  under existing rules, not the rule set.
- **Confirmed (2026-07-03): the backend `ruff check .` gap is out of scope for
  this change.** Recon found 79 violations in `tests/`/`scripts/` that CI
  doesn't lint at all (`Makefile:96`'s local target covers them, CI's `ci.yml`/
  `_verify.yml` don't). This ticket only asked about the frontend ESLint
  ceiling; the backend gap should be filed as a separate follow-up ticket
  rather than bundled in here.

## Acceptance Criteria

- `pnpm exec eslint src/` warning count is at least 20 lower than the count
  measured at the start of this change.
- CI's `--max-warnings` value is updated to reflect (not exceed) the new count.
- No new warnings suppressed via blanket `eslint-disable` — genuine fixes only,
  consistent with existing code style.

## Spec

See `openspec/specs/` once implementation lands.
