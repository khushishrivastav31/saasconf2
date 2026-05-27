# Change 013 — Sidebar lists existing conferences

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 0.4: After creating a new conference, it appears under
`/modules/conferences` (the list page) but does NOT appear as a child link
in the left-hand sidebar.

Expected: the sidebar should render an entry for each conference the user
has access to so they can jump directly between events without going
through the index page.

## Proposed Change

1. Extend the left sidebar (`AppSidebar.tsx` or equivalent) to fetch the
   user's accessible conferences from `GET /conferences?page_size=50` and
   render them as nested links under "Conferences".
2. Highlight the active conference based on the current route.
3. Refresh the sidebar list when a new conference is created (invalidate
   the `conferences` query in the create mutation's `onSuccess`).

## Out of Scope

- Drag-to-reorder.
- Pinning/favouriting.
- Per-tenant counts above N conferences (defer until we have a tenant with
  20+ conferences).

## Spec

See `openspec/specs/` once implementation lands.
