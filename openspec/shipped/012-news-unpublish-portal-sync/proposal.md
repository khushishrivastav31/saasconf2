# Change 012 — News Unpublish Portal Sync

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 6.2.3: When a published news article is unpublished via the admin UI,
the behaviour on the public portal is unconfirmed — it is unknown whether the
article disappears from the portal feed immediately or continues to be shown.

From the codebase:
- `GET /portal/news` (`app/api/v1/cfp_portal/news.py:121`) filters by
  `NewsArticle.is_published.is_(True)` — so unpublished articles should NOT
  appear for portal users.
- The admin `PATCH /conferences/{id}/news/{article_id}` sets
  `is_published=False` and `published_at=None` on unpublish.
- The portal query should therefore return the correct result server-side.

However:
1. The portal news list is cached by TanStack Query (`staleTime`) — if the
   portal page has already fetched the article list, an unpublish will not
   be reflected until the cache expires or the user refreshes.
2. If `staleTime` is set too long (or the query never refetches), the article
   remains visible in the portal despite being unpublished.
3. There is no indication in the admin UI confirming that the unpublish will
   remove the article from the portal. The confirmation modal copy reads:
   "It will no longer be visible to portal users" — but this is only true
   once the portal cache clears.

## Proposed Change

1. **Backend (verify)** — confirm the `GET /portal/news` endpoint correctly
   excludes `is_published=False` articles. Write a test if one does not exist.

2. **Frontend: portal query staleTime** — set a short `staleTime` (≤ 30s)
   on the portal news list query so that unpublished articles disappear
   promptly without requiring a full page reload.

3. **Frontend: admin confirmation copy** — update the unpublish modal message
   to be more accurate: "It will be removed from the portal feed. Portal users
   currently viewing the page may see it for up to 30 seconds."

## Out of Scope

- Real-time WebSocket push to portal on unpublish (premature optimisation).
- Invalidating portal caches cross-user via the admin action.

## Spec

See `openspec/specs/` (to be created alongside implementation).
