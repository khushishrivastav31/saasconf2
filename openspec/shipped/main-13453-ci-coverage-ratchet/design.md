# MAIN-13453: Design

## The shape of the current gate

`.github/workflows/ci.yml:417-428`:

```bash
FLOOR=30
BE="${{ steps.backend.outputs.pct }}"
FE="${{ steps.frontend.outputs.pct }}"
below() { awk "BEGIN{exit !($1 < $2)}"; }
fail=0
if below "$BE" "$FLOOR"; then echo "::error::Backend coverage ${BE}% is below the ${FLOOR}% floor"; fail=1; fi
if below "$FE" "$FLOOR"; then echo "::error::Frontend coverage ${FE}% is below the ${FLOOR}% floor"; fail=1; fi
exit $fail
```

Two inputs, one constant. `steps.backend.outputs.pct` is
`totals.percent_covered` from `coverage json` — that is **statement** coverage.
`steps.frontend.outputs.pct` is `total.lines.pct` from nyc's `coverage-summary.json`
— that is **line** coverage, and nothing reads `total.statements.pct`.

So today the frontend's `statements: 60` threshold has no CI representation at all.
Fixing that is a prerequisite for "matches `vite.config.ts`", not a nicety.

## Why three floors, not one

`awk` compares floats fine; the problem is semantic. Backend statement coverage and
frontend line coverage are different measurements of different codebases with
different targets. Collapsing them onto one scalar means the gate is always pinned
to whichever stack is weakest, and raising it for the strong stack silently
threatens the weak one. Three named variables:

```bash
BACKEND_FLOOR=<n>              # statements, mirrors pyproject fail_under
FRONTEND_STATEMENTS_FLOOR=<n>  # mirrors vite.config.ts thresholds.statements
FRONTEND_LINES_FLOOR=<n>       # mirrors vite.config.ts thresholds.lines
```

Each gets its own `below` check and its own `::error::` line, so a red run names the
metric that regressed.

## Emitting frontend statements coverage

The nyc merge step (`ci.yml:356-372`) already writes `json-summary`, which contains
`total.statements.pct` — it is simply never read. One extra line:

```bash
LINES=$(node -e "console.log(require('./coverage-merged/coverage-summary.json').total.lines.pct.toFixed(2))")
STMTS=$(node -e "console.log(require('./coverage-merged/coverage-summary.json').total.statements.pct.toFixed(2))")
echo "lines_pct=$LINES"      >> "$GITHUB_OUTPUT"
echo "statements_pct=$STMTS" >> "$GITHUB_OUTPUT"
```

Note this **renames** `steps.frontend.outputs.pct`. Three consumers must be updated
in the same commit or the summary silently renders empty: the job summary
(`ci.yml:383`), the sticky PR comment (`ci.yml:403`), and the gate itself.

## The ratchet schedule

The rule for every step: **the new floor is `floor(measured) - 1`, capped at the
documented target.** The `-1` absorbs the small drift that comes from coverage being
recomputed against a changing codebase; without it, the very PR that raises the floor
to exactly the measured value risks flapping red on an unrelated one-line change.
Never round up to a number the suite has not actually hit.

Assuming the ticket's estimates hold (backend ≈55, frontend ≈63):

| Step | Backend | FE statements | FE lines | Gate                     |
|------|---------|---------------|----------|--------------------------|
| 0    | 30      | *(none)*      | 30       | today                    |
| 1    | 30      | 30            | 30       | split + emit statements; behaviour unchanged |
| 2    | 54      | 60            | 61       | first real bump          |
| 3    | `fail_under` (55) | 60  | 61       | target; backend delegates to pyproject |

If measurement shows a stack **below** its target, that stack stops at step 2 with a
floor of `floor(measured) - 1`, a `TODO(MAIN-XXXXX)` comment naming the follow-up
test-writing ticket, and this spec ships with the ratchet partially complete. That is
an acceptable outcome and much better than lowering a documented target to match
reality. The one thing we must not do is raise a floor above what the suite achieves
and leave `main` red.

Backend at ≈55 against a target of exactly 55 is the tight case: step 2's `-1` rule
lands it at 54, and step 3 can only move to 55 if the measurement is comfortably
≥ 55.0 rather than 54.6-rounds-to-55. Verify with two decimal places before bumping.

## End state: the configs own the numbers

**Backend.** `coverage report` reads `fail_under` from `pyproject.toml` by itself.
The merge step currently suppresses this on purpose (`--fail-under=0`, `ci.yml:343-344`)
because MAIN-13426 reported without gating. At step 3 the gate becomes:

```bash
coverage report --fail-under=55   # or simply `coverage report`, which reads pyproject
```

…run *after* the artifacts are published. Then `55` lives in exactly one place. Keep
`coverage xml`/`coverage json` on `--fail-under=0`: those two produce the artifacts
and the percentage, and they must never be the thing that fails the job — otherwise
the artifacts vanish precisely on the runs where you most want to read them.

**Frontend.** There is no equivalent trick. `nyc` cannot read `vite.config.ts`'s
`thresholds` block, and the merged number is produced by nyc, not vitest. Two options:

- **(chosen)** Hardcode `60`/`61` in `ci.yml` with a comment naming
  `frontend/vite.config.ts:38,41` as the source, and mirror the comment there.
  Two places, both commented, both greppable for the literal.
- *(rejected)* `nyc report --check-coverage --statements 60 --lines 61` — same
  duplication, but it also short-circuits before the artifact upload, reintroducing
  the "gate ran before publish" failure mode that `ci.yml:419-420` was written to
  avoid. Do the check in the last step, by hand, with `awk`, as today.

The asymmetry is real and worth stating plainly: backend gets a single source of
truth, frontend gets two synchronised constants. Pretending otherwise would mean
inventing a config-reading step for a two-integer problem.

## Ordering constraint

The gate step must remain **last** in the job (`ci.yml:417`, after
`Upload merged coverage reports` at `:407`). Its whole design is that the summary,
the sticky comment, and the artifacts publish even on a failing run — that is how a
contributor sees *what* their coverage was when CI told them it was too low. Any
refactor that moves the check earlier, or folds it into the merge steps, breaks this
and must be rejected in review.

## Risk: the first bump turns `main` red

Steps 2 and 3 change a gate that every subsequent PR must clear. If the measurement
is stale by the time the bump merges — because coverage-lowering PRs landed in
between — `main` goes red for everyone. Mitigation: take the measurement from a CI
run on the merge commit itself, and land each bump as its own small PR so it can be
reverted in one click. Do not bundle the bump with the split (step 1), which is
behaviour-preserving and safe.
