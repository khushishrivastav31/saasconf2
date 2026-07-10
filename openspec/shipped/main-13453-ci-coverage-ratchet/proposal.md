# MAIN-13453: Ratchet the CI coverage floor from 30% up to the real targets

## Status
`draft` · Branch: `chore/ci-coverage-ratchet`

## Methodology
No TDD applicable — CI configuration change. Verified by observing the
`coverage-report` job pass/fail against known merged percentages, not by
application tests. Any test-writing done to *lift* coverage follows normal
Red-Green-Refactor, but that is deliberately out of scope here (see below).

## Problem

MAIN-13426 (PR #426, `openspec/shipped/main-13426-ci-test-coverage/`) added merged
coverage reporting to `ci.yml` and, at the team's request, a **temporary 30% floor**
so CI had a real gate immediately. That floor is far below the documented targets
and is now the thing standing between us and a meaningful regression gate.

Three concrete defects in the current `coverage-report` job
(`.github/workflows/ci.yml:417-428`, step `Enforce temporary 30% coverage floor`):

1. **One floor for two stacks.** `FLOOR=30` is compared against *both* the backend
   and the frontend percentage. The real targets differ (backend 55, frontend 60/61),
   so a single scalar can never express both.
2. **The frontend gate only checks `lines`.** The merge step derives its percentage
   from `coverage-summary.json` → `total.lines.pct` only (`ci.yml:365`).
   `frontend/vite.config.ts:37-41` declares **two** thresholds that matter —
   `statements: 60` **and** `lines: 61`. Statement coverage is never computed or
   enforced on the merged number, so a statements regression is invisible.
3. **The floors are duplicated, not derived.** `ci.yml` hardcodes `30` while
   `backend/pyproject.toml:193` says `fail_under = 55` and
   `frontend/vite.config.ts:38,41` say `60`/`61`. Nothing keeps them in sync, and
   the backend merge step actively suppresses the real value with
   `coverage xml/json --fail-under=0` (`ci.yml:343-344`).

Documented targets, verbatim from the configs:

| Stack | Source | Value |
|---|---|---|
| Backend | `backend/pyproject.toml:193` | `fail_under = 55` (comment: "Do not lower this value; only raise it.") |
| Frontend | `frontend/vite.config.ts:38` | `statements: 60` |
| Frontend | `frontend/vite.config.ts:41` | `lines: 61` |

Per the ticket, measured reality is already close: backend full-suite ≈55%, merged
frontend ≈63%. **Both numbers are unverified at time of writing** — establishing
them is the first task, because they determine how many ratchet steps we need.

## Proposed Change

Convert the single temporary floor into **per-stack, per-metric floors**, then raise
them in discrete, verifiable steps until they match the configs.

1. **Measure first.** Record the current merged backend %, frontend statements %,
   and frontend lines % from a real CI run. Every subsequent step is chosen against
   these, not against the ticket's estimates.
2. **Split the floor** into `BACKEND_FLOOR`, `FRONTEND_STATEMENTS_FLOOR`, and
   `FRONTEND_LINES_FLOOR`.
3. **Emit frontend statements coverage** alongside lines from the `nyc` merge step,
   so metric #2 above can be gated at all.
4. **Ratchet up** in steps (see `design.md` for the schedule and the rule for
   picking each value). Each step is its own commit/PR so a red CI localises to one
   bump.
5. **Land on the configs as the source of truth.** End state: the backend gate
   delegates to `pyproject.toml`'s `fail_under` rather than restating `55`; the
   frontend gate names `60`/`61` explicitly with a comment binding it to
   `vite.config.ts`. The word "temporary" and the value `30` disappear from the repo.
6. Write any tests needed to *reach* a target as separate, normal TDD work — this
   spec covers the gate, not the tests behind it.

## Out of Scope

- **Writing the tests that lift coverage.** If a measured number lands below its
  target, closing the gap is separate ticketed work (backend `pyproject.toml:190-192`
  already gestures at a Phase G / 70% ambition). This change ratchets the gate to
  match *reality plus the documented targets*; it does not manufacture coverage.
- **Raising past the documented targets** (backend → 70, frontend → 65). The
  configs' own comments describe those as future phases. Out of scope.

  *(An earlier revision reversed this on the strength of a local backend measurement
  of 78.02%. That number was contaminated by a stale `.coverage` file; the merged CI
  figure is 55.79%, and `fail_under = 55` is correct. The reversal is withdrawn.
  Backend gets no config change. The one exception is `vite.config.ts`, whose 60/61
  are ~3pt below the merged 63.55/64.18 and are raised to 62/63 in Phase 3 — an
  ordinary ratchet, not a correction. See `tasks.md` → Phase 0.)*
- **Per-shard gating.** Stays off, permanently. A shard exercises ~1/3 of the suite,
  so `--cov-fail-under=0` (backend, `ci.yml:144`) and `--coverage.thresholds.*=0`
  (frontend, `ci.yml:265-268`) must remain. Gating happens on the MERGED number in
  `coverage-report` and nowhere else. This is a load-bearing invariant of
  MAIN-13426's design; re-read `ci.yml:238-241` before touching it.
- **`branches` / `functions` thresholds** (`vite.config.ts:39-40`, both `50`). Not
  currently merged or gated. Adding them is a follow-up.
- Migrating `ci.yml` onto `_verify.yml` — still deferred, for the required-status-check
  reasons documented in MAIN-13426's `design.md`.

## Acceptance Criteria

- The `coverage-report` job enforces **three** floors: backend, frontend statements,
  frontend lines.
- The frontend merge step emits a statements percentage, not just lines.
- Backend floor is ≥ 55 and does not restate the number — it reads
  `pyproject.toml`'s `fail_under`, which stays at 55.
- Frontend floors are ≥ 62 (statements) and ≥ 63 (lines), matching `vite.config.ts`,
  which this change raises from 60 / 61.
- The ratchet comment in `vite.config.ts:33-36` is refreshed against the merged
  2026-07-10 measurements.
- Every floor is derived from a merged `coverage-report` run, never a local one.
- The literal `30` and the string `temporary` are gone from `ci.yml`, including the
  job's header comment (`ci.yml:299-302`) and the sticky PR comment footer
  (`ci.yml:405`).
- **No value is ever lowered.** Ratchet-up only, consistent with the existing notes
  in `pyproject.toml:190-192` and `vite.config.ts:33-36`.
- Per-shard runs still do not gate.
- A PR whose coverage dips below a floor goes red, and the job summary + PR comment
  + artifacts still publish (the gate step runs last, `ci.yml:417`).

## Spec

See `openspec/specs/` once implementation lands.
