# MAIN-13428: Design

## Step 1 — measure before fixing

```
cd frontend && pnpm exec eslint src/ --format json > /tmp/eslint-before.json
jq '[.[].messages[] | select(.severity==1)] | length' /tmp/eslint-before.json
```

This is the real starting count — the ticket's "120" is the CI *ceiling*, not
necessarily today's actual count. The "at least 20" reduction target applies to
this measured number.

## Step 2 — group by rule, fix mechanically first

```
jq '[.[].messages[] | select(.severity==1) | .ruleId] | group_by(.) |
    map({rule: .[0], count: length}) | sort_by(-.count)' /tmp/eslint-before.json
```

Rules with an auto-fixer (`eslint --fix`) get resolved first — free reduction,
no manual review risk. Remaining warnings need per-file judgment (e.g.
`no-unused-vars` needs confirming the variable really is dead, not fixing by
suppressing).

## Step 3 — lower the ceiling to match

Once the count is reduced, update both:
- `.github/workflows/ci.yml:232`
- `.github/workflows/_verify.yml:171`

to `--max-warnings <new_count + small buffer>` (e.g. new count rounded up to
nearest 10) rather than leaving `120` in place — an unmoved ceiling gives no
regression protection once this PR's fixes land.

## Makefile inconsistency

`Makefile:99` already runs `--max-warnings 0` locally, stricter than CI's 120.
Once CI's ceiling drops to a small buffer above the real count, decide: either
match CI to `0` outright (if the reduced count reaches zero) or keep a small
gap and document why (e.g. CI is the merge gate, Makefile is a stricter local
habit-forming check). Don't leave the two silently diverging without a comment
explaining the intended difference.

## Backend ruff gap (secondary, optional)

`ruff check .` (79 violations, all `tests/`/`scripts/`) is a local-only signal
today (`Makefile:96`) — CI's `ruff check app/` never sees it. Two honest options,
not a spec decision made here:
1. Extend CI to `ruff check .` and fix the 79 (mostly auto-fixable: 46/79 via
   `--fix`, remainder are manual import-order/unused-var cleanups in test
   files).
2. Add an explicit `exclude = ["tests", "scripts"]` in `pyproject.toml`'s
   `[tool.ruff]` if the team doesn't want test/script files held to the same
   bar, making the current gap intentional and documented rather than silent.

Bring this to review as a yes/no rather than deciding unilaterally — it's
adjacent to, not the literal ask of, the ticket.
