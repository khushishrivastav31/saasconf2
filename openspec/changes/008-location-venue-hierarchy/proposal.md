# Change 008 — Location Venue Hierarchy

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 1.6.1: The location list shows child rooms (`main_hall`) alongside parent
venues in the top-level list. The expected behaviour is that the parent list
shows only venues (locations with no `parent_id`), and child rooms are shown
indented under their parent or hidden until the parent is expanded.

In `LocationsTab.tsx`, the hierarchy code at line 236 filters correctly into
`parentLocations` and `childrenByParent` for the tree view — but the rendered
list still shows all locations flat, or the `parent_id` filter has a bug that
lets child rooms appear at the top level.

Additionally:
- When creating a new location, the "parent venue" dropdown (line 373) only
  shows top-level locations as options — but if a child room's `parent_id`
  references a location that itself has a parent, the chain can break.
- The "parent venue" field in the dropdown (line 373) correctly filters
  `!loc.parent_id`, but the top-level display list may not apply the same
  filter.

## Proposed Change

1. **Frontend** — in `LocationsTab.tsx`, ensure the top-level location list
   renders only items where `loc.parent_id` is `null` or `undefined`.
   Child rooms should appear as indented sub-items under their parent venue,
   or be hidden behind an expand toggle.

2. **Frontend** — add an expand/collapse toggle per venue row that shows its
   child rooms when expanded (accordion style).

3. **Frontend** — if a child location's parent is deleted, mark it as
   "orphaned" in the UI rather than promoting it silently to the top level.

## Out of Scope

- Backend location hierarchy changes (the data model already supports
  `parent_id`; only the display is broken).
- Deep nesting (rooms within rooms) — only one level of hierarchy is in scope.

## Spec

See `openspec/specs/` (to be created alongside implementation).
