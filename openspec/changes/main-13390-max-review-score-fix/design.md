# MAIN-13390: Design

## Affected Files

| File | Change |
|---|---|
| `backend/app/api/v1/cfp_portal/reviews.py` | Normalize option value before weighting in `total_score` computation |
| `backend/app/api/v1/cfp/shared.py` | Batch + single-paper `max_review_score` always = 5.0 (via normalization) |
| `backend/tests/cfp/test_reviewer_workflow.py` | Update score assertions to match normalized values |

No frontend, no OpenAPI schema changes.

---

## Normalization Formula

```python
def normalize_to_5(raw: float, min_val: float, max_val: float) -> float:
    """Map any scale [min_val, max_val] onto [1, 5]."""
    if max_val == min_val:
        return 3.0  # degenerate scale — mid-point
    return (raw - min_val) / (max_val - min_val) * 4.0 + 1.0
```

| Scale   | Raw | Normalized |
|---------|-----|------------|
| −2 to 2 | +2  | 5.0        |
| −2 to 2 | +1  | 4.0        |
| −2 to 2 |  0  | 3.0        |
| −2 to 2 | −1  | 2.0        |
| −2 to 2 | −2  | 1.0        |
| 1 to 5  |  5  | 5.0  (no-op)|
| 1 to 5  |  3  | 3.0  (no-op)|
| 1 to 5  |  1  | 1.0  (no-op)|

A 1–5 scale is a no-op: `(raw − 1) / (5 − 1) × 4 + 1 = raw`.

The helper lives in `backend/app/core/score_utils.py` (new file, alongside
`text_utils.py`).

---

## 1. `submit_or_save_review` — normalize before weighting

In `backend/app/api/v1/cfp_portal/reviews.py`, the loop that computes
`total_weighted_score`:

**Before:**
```python
if not opt or opt.is_unsure or opt.numeric_value is None:
    continue
total_weighted_score += opt.numeric_value * question.weight
total_weight += question.weight
```

**After:**
```python
if not opt or opt.is_unsure or opt.numeric_value is None:
    continue
option_values = [
    o.numeric_value
    for o in question.score_scale.options
    if o.numeric_value is not None and not o.is_unsure
]
min_val = min(option_values, default=opt.numeric_value)
max_val = max(option_values, default=opt.numeric_value)
normalized = normalize_to_5(opt.numeric_value, min_val, max_val)
total_weighted_score += normalized * question.weight
total_weight += question.weight
```

Note: `question.score_scale` must be eagerly loaded. Confirm the existing query
already joins it (it does, per the current code).

---

## 2. `max_review_score` — always 5.0 when questions exist

In `shared.py`, the batch and single-paper calculations currently compute a
weighted average of raw max values. After the change, every `count_in_score=True`
question with a valid scale contributes max=5.0 to the weighted average, so the
result is always 5.0.

Simplest implementation: replace the per-question `max_val` contribution with 5.0:

```python
# In the loop over count_in_score questions:
option_values = [
    o.numeric_value
    for o in q.score_scale.options
    if o.numeric_value is not None and not o.is_unsure
]
if not option_values:
    continue
# All questions normalize to max 5.0
total_max_weighted += 5.0 * q.weight
total_weight += q.weight
```

Apply to both:
1. Batch path (~line 342–355)
2. Single-paper path (~line 626–653)

---

## Edge Cases

| Scenario | Result |
|---|---|
| All questions use 1–5 scale | total_score and max_review_score unchanged |
| Question with only one option (min = max) | Normalized to 3.0 (mid-point fallback) |
| `is_unsure` option selected by reviewer | Excluded from normalization, question skipped |
| Question has no numeric options | Skipped (same as before) |
