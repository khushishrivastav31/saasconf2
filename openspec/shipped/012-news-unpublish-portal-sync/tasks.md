# Tasks — News Unpublish Portal Sync

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 1 — Backend regression test

### RED
- [ ] Write `tests/cfp_portal/test_news_visibility.py`:
  - As portal user, fetch news → published article appears
  - Admin unpublishes the article
  - As portal user, fetch news again → article is absent
  - Run → **expect green** (verifies existing behaviour is correct)
  - If test fails, that is the root cause — fix the portal query filter

### GREEN
- [ ] If filter is wrong: fix `GET /portal/news` query to exclude
  `is_published=False` articles
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm the test covers both conference-domain and training-domain news

---

## Phase 2 — Portal news `staleTime`

### RED
- [ ] Find the portal news list query in the frontend source
  (search for `portal/news` in hooks or page components)
- [ ] Write test that asserts `staleTime` on the query is `≤ 30000`
  - Run → **expect failure** if `staleTime` is high or not set

### GREEN
- [ ] Set `staleTime: 30_000` on the portal news list query
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm `refetchOnWindowFocus: true` is not disabled for this query
  (default behaviour is fine; don't add unless already absent)

---

## Phase 3 — Admin unpublish modal copy

### RED
- [ ] Extend `NewsTab.test.tsx`:
  - Opening the unpublish modal for a published article shows copy containing
    "removed from the portal feed"
  - Run → **expect failure**: copy says "no longer be visible"

### GREEN
- [ ] Update the unpublish modal body text in `NewsTab.tsx`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Ensure the publish confirmation modal copy (publishing) is also accurate

---

## Phase 4 — Full sweep

- [ ] `cd backend && venv/bin/python -m pytest tests/cfp_portal/ -v`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: publish an article → view portal → confirm it appears
- [ ] Manual: unpublish the article → view portal (or wait ≤30s) → confirm it disappears
