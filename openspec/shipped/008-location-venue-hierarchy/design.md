# Design — Location Venue Hierarchy

## Data Shape

The existing `organizeHierarchy` logic in `LocationsTab.tsx` (around line 232)
produces:
- `parentLocations: Location[]` — items with `parent_id === null/undefined`
- `childrenByParent: Map<string, Location[]>` — keyed by parent ID

This structure is correct. The bug is likely that the rendered JSX iterates
over the full `items` array rather than `parentLocations`.

---

## Frontend Changes

### `LocationsTab.tsx` — list rendering

Replace any iteration over `items` (the full flat list) with an iteration
over `parentLocations`. For each parent:
1. Render the venue row.
2. Below it, conditionally render child rows (indented `pl-8`) from
   `childrenByParent.get(loc.id) ?? []`.

Expand/collapse (optional but preferred):
- Add `expandedVenues: Set<string>` local state.
- Each venue row has a chevron toggle button.
- Child rows are shown only when the venue ID is in `expandedVenues`.
- Default: all venues expanded (so existing users see their data immediately).

### Orphaned child detection

Add a computed `orphanedLocations`:
```ts
const orphanedLocations = items.filter(
  (loc) => loc.parent_id && !items.find((p) => p.id === loc.parent_id)
);
```
(This logic already exists at line 259.) Render orphaned locations in a
separate "Orphaned rooms" section with a warning badge.

---

## Test Impact

| File | Change |
|------|--------|
| New `LocationsTab.test.tsx` (or extend existing) | Top-level list renders only venues (no child rooms) |
| Same | Child room appears indented under its parent |
| Same | Orphaned room appears in "Orphaned rooms" section |
| Same | Toggling venue expand/collapse shows/hides child rooms |

---

## Rollout / Risk

- Pure frontend; no backend or migration changes.
- Existing location data is unaffected.
- Default-expanded state ensures no data is hidden for users who haven't
  interacted with the new toggle.
