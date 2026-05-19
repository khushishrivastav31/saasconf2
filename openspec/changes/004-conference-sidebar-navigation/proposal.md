# Change 004 — Conference Sidebar Navigation

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 0.4: After creating a conference, it does not appear in the left-side
navigation sidebar. Instead, the user must navigate to `/modules/conferences`
(the full list view) to reach the new conference.

The admin left panel currently shows a static "Conferences" module link that
always routes to `/modules/conferences`. There is no dynamic sidebar entry
for the currently-active conference or for recently-created conferences, so
users have no quick-nav shortcut once they know which conference they are
working on.

There is code in `AdminLayout.tsx` that fetches `data?.conferences?.[0]` and
uses it for messaging navigation, but this pattern is not surfaced as a
sidebar item. The sidebar experience for conferences lags behind the pattern
used in Trainings, where the selected training is accessible as a sidebar item.

## Proposed Change

1. **Frontend** — add a dynamic "current conference" section to the
   `AdminLayout` left nav: when a user is inside a conference detail route
   (`/modules/conferences/:id/**`), surface the conference name in the
   sidebar with a highlight state and expand-able sub-links matching the
   main conference sections (Overview, CFP, Registration, Program,
   Sponsors, Communications, Insights, Settings).

2. **Frontend** — when there is no active conference route but at least one
   conference exists for the tenant, show the most-recently-updated
   conference as a "pinned" sidebar entry (collapsed, name only). This
   gives one-click access to return to the last conference you were working on.

3. **Frontend** — the existing `/modules/conferences` list link in the
   sidebar remains; the new dynamic entry sits below it.

## Out of Scope

- Multi-conference pinning / bookmarking by the user (deferred).
- Trainings sidebar refactor (separate concern).
- Backend changes — the conference list query already exists.

## Spec

See `openspec/specs/` (to be created alongside implementation).
