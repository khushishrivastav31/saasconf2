# Design — News Unpublish Portal Sync

## Backend Verification

### `GET /portal/news` — `cfp_portal/news.py`

Current filter (line 121):
```python
.where(NewsArticle.is_published.is_(True), or_(*filters))
```

This is correct. Unpublished articles will not be returned.

Write a regression test to lock this behaviour:
- Create an article with `is_published=True`
- Call `GET /portal/news` → article appears
- PATCH article to `is_published=False`
- Call `GET /portal/news` again → article does NOT appear

---

## Frontend: Portal News `staleTime`

Find the portal news list query (likely in a portal news page component or
hook). Current `staleTime` setting, if any, may be the default (0ms in
TanStack Query v5, which means always-stale → always refetches on focus,
so the data should be fresh).

Action:
1. If `staleTime` is long (e.g. 5min or Infinity), reduce it to `30_000`
   (30 seconds) for the portal news list query.
2. If it's already `0` or default, document that the data is fresh on every
   focus/navigation — no change needed, but capture this in the test.

---

## Frontend: Admin Confirmation Modal Copy

### `NewsTab.tsx` — unpublish modal (around line 407–411)

Current text:
```tsx
"Are you sure you want to unpublish ... It will no longer be visible to portal users."
```

Change to:
```tsx
"Are you sure you want to unpublish ... It will be removed from the portal feed. Portal users currently viewing the news page may see it for up to 30 seconds."
```

---

## Test Impact

| File | Change |
|------|--------|
| New `tests/cfp_portal/test_news_visibility.py` | Unpublished article excluded from `GET /portal/news` |
| Same | Published article appears in `GET /portal/news` |
| `NewsTab.test.tsx` (extend) | Unpublish confirmation modal contains updated copy |
| Portal news component test | `staleTime` ≤ 30000 on the news list query |
