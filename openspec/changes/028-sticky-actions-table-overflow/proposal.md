# Change 028 — Sticky Actions Column + Horizontal Table Scroll

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

The admin UI uses a three-panel layout: left nav sidebar + secondary nav panel + main content area. When both sidebars are fully expanded, the main content area is squeezed to roughly half the screen width. Wide data tables (e.g. Session Types, Attendees, Speakers, Invoices) overflow horizontally but horizontal scroll is not enabled — columns are simply cut off. The ACTIONS column (edit/delete/view buttons) lives at the far right of these tables and becomes unreachable without manually collapsing both sidebars first.

This directly harms discoverability for external users (reviewers, attendees, speakers, less-trained admins) who do not know they need to collapse the sidebar before they can edit a record.

## Proposed Change

1. **Sticky Actions column** — pin the ACTIONS column to the right edge of every admin data table using `position: sticky; right: 0`. The column stays visible at all times regardless of sidebar state or table width.
2. **Horizontal scroll on table containers** — add `overflow-x: auto` to all table wrapper elements so the body columns between NAME and ACTIONS can scroll underneath the sticky pin. A visible scrollbar appears automatically when content overflows, signalling to the user that more columns exist.

These two changes together mean:
- Edit/delete buttons are always reachable — no sidebar manipulation required.
- All column data remains accessible via scroll — nothing is permanently hidden.
- No sidebar behaviour changes are needed — sidebar state becomes irrelevant to action reachability.

## Out of Scope

- Changing sidebar collapse/expand behaviour.
- Moving action buttons to the left side of rows.
- Replacing actions with a kebab/hover-reveal menu (worthwhile future enhancement, not required here).
- Mobile / portal-facing tables (separate responsive concern).

## Affected Tables (known)

Session Types, Location Types, Sponsor Packages, User Roles, Volunteer Tasks, Committee Roles, Registration Questions, Speakers, Attendees, Badges, Invoices, Program Committee, Deadlines, and any other admin table that carries an ACTIONS column.

## Spec

See `openspec/specs/` once implementation lands.
