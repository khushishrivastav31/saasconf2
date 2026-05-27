# Change 014 — Module-aware sidebar navigation

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 0.5.1.3 / 0.5.1.4: Users who only have the `conferences` module enabled
still see a "Trainings" link in the left sidebar (and vice versa). The
sidebar shows every top-level module regardless of the tenant's enabled
modules and the current user's role.

This was partially fixed previously — the sidebar filters some items —
but the "Trainings" module link still leaks through for Conferences-only
users. The user can click it and land on a 403 page, which is a poor UX.

## Proposed Change

1. Read `current_user.modules` (from `useAuth()` / JWT) inside the sidebar
   component.
2. For each top-level module nav item (Conferences, Trainings, Customers,
   etc.), only render it when:
   - The current user has the corresponding module code in their
     `modules` list, OR
   - The user is a super admin.
3. Apply the same filter recursively to any sub-items.

## Out of Scope

- Backend route protection (already handled by `require_module`).
- Hiding entire pages when navigated to via a direct URL — the existing
  403 page is sufficient.

## Spec

See `openspec/specs/` once implementation lands.
