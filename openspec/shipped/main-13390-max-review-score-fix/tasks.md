# MAIN-13390: Tasks

## Backend

- [x] Create `backend/app/core/score_utils.py` with `normalize_to_5(raw, min_val, max_val) → float`
- [x] Update `submit_or_save_review` in `reviews.py`: normalize each option's value before multiplying by weight
- [x] Update batch `max_review_score` in `shared.py` (~line 342–355): use 5.0 as each question's max contribution
- [x] Update single-paper `max_review_score` in `shared.py` (~line 626–653): same
- [x] Write tests:
  - `normalize_to_5` unit tests (normal scale, negative-min scale, degenerate single-option)
  - Review submission with recommendation question → `total_score` uses normalized value
  - `max_review_score` = 5.0 when a mix of scales is present

## OpenAPI

- [x] No endpoint/schema changes → no `pnpm gen:api` run needed
