# MAIN-13390: Fix max review score showing 4.5 instead of 5.0

## Problem

The "Evaluated Papers" page shows scores as "3.6 / 4.5". The maximum should be 5.0.
All questions — including "Overall Recommendation" — should be counted, but every
question's score must be measured on the same 1–5 scale.

## Root Cause

`total_score` and `max_review_score` are computed from raw numeric option values.
The "Overall Recommendation" question uses a −2 to +2 scale (Strong Accept=2,
Accept=1, Borderline=0, Reject=−1, Strong Reject=−2), while all other questions use
a 1–5 scale.

Because all raw values are averaged directly, the Overall Recommendation's lower
ceiling (max=2) pulls the weighted-average maximum down:

```
max_review_score = (5×1 + 5×1 + 5×1 + 5×1 + 5×1 + 2×1) / 6 = 4.5   ← wrong
```

## Proposed Solution

**Normalize every question's score to a 1–5 range** before computing `total_score`
and `max_review_score`, using min-max normalization:

```
normalized = (raw − min_val) / (max_val − min_val) × 4 + 1
```

After normalization:

| Option         | Raw | Normalized |
|----------------|-----|------------|
| Strong Accept  |  +2 | 5.0        |
| Accept         |  +1 | 4.0        |
| Borderline     |   0 | 3.0        |
| Reject         |  −1 | 2.0        |
| Strong Reject  |  −2 | 1.0        |

Regular 1–5 questions are unchanged (the formula is a no-op when min=1, max=5).

After the fix:
```
max_review_score = (5 + 5 + 5 + 5 + 5 + 5) / 6 = 5.0   ✓
```

## Scope

- **`total_score` calculation** — normalize before weighting (going forward)
- **`max_review_score` calculation** — always 5.0 when questions exist
- No migration, no frontend changes, no schema changes
