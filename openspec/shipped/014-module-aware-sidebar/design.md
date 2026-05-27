# Design — Module-aware sidebar navigation

## Approach

The auth context already exposes `currentUser.modules: string[]` (set
from the JWT). The sidebar needs to:

1. Read `currentUser` (or `useAuth()` hook).
2. Use a small `hasModule(code: string) => boolean` helper.
3. Wrap each top-level module link with a `hasModule(...) &&` guard.

Example:

```tsx
{hasModule('conferences') && (
  <NavLink to="/modules/conferences">Conferences</NavLink>
)}
{hasModule('trainings') && (
  <NavLink to="/modules/trainings">Trainings</NavLink>
)}
```

For super admins, the helper short-circuits:

```ts
function hasModule(code: string): boolean {
  if (currentUser.is_super_admin) return true;
  return currentUser.modules?.includes(code) ?? false;
}
```

## Module codes inventory

Walk the sidebar and tag each top-level item with its module code:

| Sidebar item | Module code |
|--------------|-------------|
| Conferences | `conferences` |
| Trainings | `trainings` |
| Customers (CRM) | `customers` |
| Trainers | `trainings` (sub-module) |
| News (system-wide) | `news` |
| Privacy Requests | always shown (admin-only via separate guard) |
| Settings | always shown for tenant admins |

## Test Impact

| File | Change |
|------|--------|
| Sidebar test (new or extended) | Conferences-only user does NOT see Trainings link |
| Same | Trainings-only user does NOT see Conferences link |
| Same | Super admin sees all module links |
| Same | User with multiple modules sees all matching links |
