# Design — Sticky Actions Column + Horizontal Table Scroll

## Recon outputs

Before implementation, document:

- All admin table components that render an ACTIONS column (grep for
  `ACTIONS` and action icon buttons in `frontend/src/`).
- Whether tables share a common wrapper component (e.g. a reusable
  `<Table>` or `<DataTable>`) or are each hand-rolled `<table>` elements.
- Current CSS on table wrapper `<div>` elements — confirm `overflow` is
  unset or `hidden`.

## Frontend

### Table container

For every table wrapper `<div>` (or the shared wrapper component if one
exists), add:

```
overflow-x: auto
```

Tailwind: `overflow-x-auto`. This enables the native horizontal scrollbar
when table content overflows the container width.

### Sticky Actions `<th>` / `<td>`

On the ACTIONS column header and every ACTIONS data cell, add:

```
position: sticky
right: 0
```

Tailwind: `sticky right-0`. The cell also needs a solid background colour
matching the table row (white in light mode, the dark-mode surface colour
in dark mode) to prevent content from bleeding through during scroll.

Tailwind example for a light/dark table row:

```
sticky right-0 bg-white dark:bg-gray-900
```

If rows have alternating stripe colours, the sticky cell must inherit the
stripe colour too — use `bg-inherit` or apply stripe variants explicitly.

### Shared component path (preferred)

If a reusable table component exists, apply both changes there once.
Otherwise apply per-table — document which files were changed in tasks.md.

### Visual indicator

The sticky column should carry a subtle left border or box-shadow to
visually separate it from scrolling content:

```
border-l border-gray-200 dark:border-gray-700
```

or a shadow:

```
shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]
```

Choose whichever is consistent with the existing table style.

## Dark mode

Every sticky cell background must carry a `dark:` variant. Omitting it
causes the cell to become transparent in dark mode, showing text bleed-
through from scrolled columns.

## Test Impact

| File | Change |
|------|--------|
| Component tests for each affected table | Assert ACTIONS column `<th>` has `sticky` class |
| Shared table component test (if applicable) | Assert wrapper has `overflow-x-auto` |
