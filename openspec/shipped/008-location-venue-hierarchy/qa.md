# QA — Location Venue Hierarchy

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| Conferences Member | `conf.member@bjvsoft.com` | `Test1234!` | Pre-seeded |

---

## Pre-conditions — create test data

Log in as **Conferences Admin**, open a conference → **Locations** tab.

1. **Create a top-level venue:**
   - Name: `Main Hall Building`
   - Parent: _(none)_
   - Save → note the newly created item.

2. **Create a child room:**
   - Name: `Main Hall`
   - Parent: `Main Hall Building`
   - Save.

3. **Create a second child room:**
   - Name: `Side Room A`
   - Parent: `Main Hall Building`
   - Save.

4. **Create a second top-level venue:**
   - Name: `Workshop Centre`
   - Parent: _(none)_
   - Save.

You should now have:
```
Main Hall Building        ← top-level venue
  └── Main Hall           ← child room
  └── Side Room A         ← child room
Workshop Centre           ← top-level venue
```

---

## Scenario A — Top-level list shows only venues

1. Look at the Locations list.
2. **Expected:** Only `Main Hall Building` and `Workshop Centre` appear at the top level.
3. **Expected:** `Main Hall` and `Side Room A` do NOT appear as top-level items.

**PASS:** Only venues visible at top level.
**FAIL:** All four locations listed at the same level (current bug).

---

## Scenario B — Child rooms appear under their parent

1. Find `Main Hall Building` in the list.
2. **Expected:** `Main Hall` and `Side Room A` appear indented below it (either always visible or behind an expand toggle).
3. If there is a collapse/expand toggle: click to collapse `Main Hall Building`.
4. **Expected:** `Main Hall` and `Side Room A` are hidden.
5. Click to expand.
6. **Expected:** Both rooms reappear.

**PASS:** Child rooms shown under parent, toggle works.
**FAIL:** Child rooms not shown under parent, or toggle doesn't work.

---

## Scenario C — Adding a room shows correct parent options

1. Click **Add Location**.
2. In the "Parent venue" dropdown:
3. **Expected:** Only top-level venues are listed as options (`Main Hall Building`, `Workshop Centre`). Child rooms (`Main Hall`, `Side Room A`) are NOT selectable as parents.

**PASS:** Only top-level venues in the parent dropdown.
**FAIL:** Child rooms appear as selectable parents.

---

## Scenario D — Orphaned room warning (edge case)

> This scenario requires manually creating a data inconsistency or deleting a parent venue that has children.

1. Delete `Main Hall Building` (if the UI allows deleting a venue that has children).
2. **Expected:** `Main Hall` and `Side Room A` appear in an "Orphaned rooms" section with a warning badge, NOT promoted to the top-level venue list.

**PASS:** Orphaned rooms shown in a warning section.
**FAIL:** Orphaned rooms silently promoted to top-level venues.

---

## Scenario E — Read-only for Conferences Member

**Role:** Conferences Member (`conf.member@bjvsoft.com`)

1. Open a conference → Locations tab.
2. **Expected:** The "Add Location" button is hidden or disabled.
3. **Expected:** The venue/room list is visible and hierarchy is correctly displayed (read-only view should benefit from the same fix).

**PASS:** Correct hierarchy displayed; no write controls for member.
**FAIL:** Hierarchy display broken for member role.
