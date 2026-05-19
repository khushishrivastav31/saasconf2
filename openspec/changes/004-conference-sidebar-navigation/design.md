# Design — Conference Sidebar Navigation

## Route Detection

Use `useMatch('/modules/conferences/:conferenceId/*')` (React Router v6) inside
`AdminLayout` to detect whether the user is currently viewing a conference.
When matched, `conferenceId` is available for highlighting and sub-nav rendering.

## Data

The existing `useConferences()` query (or equivalent list query already in
`AdminLayout.tsx`) provides the conference list. No new API endpoints needed.

---

## Frontend Changes

### `AdminLayout.tsx`

1. Read `conferenceId` from the active route match.
2. Find the matching conference from the fetched list.
3. Render a `ConferenceSidebarSection` component below the static
   "Conferences" link when `conferenceId` is set.
4. When `conferenceId` is unset but at least one conference exists, render a
   collapsed "Recent" entry pointing to the most-recently-updated conference
   (`updated_at` desc, index 0).

### New component: `ConferenceSidebarSection.tsx`

Props:
```ts
interface Props {
  conference: Conference;
  activeSection?: string; // derived from route params
}
```

Renders:
- Conference name as a section heading (truncated, max 24 chars + ellipsis)
- Sub-links for each major section (using `conferenceSections.ts` or a
  dedicated subset):
  - Overview → `/:id?section=overview`
  - CFP → `/:id?section=cfp`
  - Registration → `/:id?section=registration`
  - Program → `/:id?section=program`
  - Sponsors → `/:id?section=sponsors`
  - Communications → `/:id?section=messaging`
  - Insights → `/:id?section=insights`
  - Settings → `/:id?section=settings`
- Active sub-link is highlighted (same Tailwind pattern as other sidebar items)
- Dark-mode variants required

### Collapsed "Recent" entry

When no active route: single-row entry showing the conference name + an icon,
linking to the conference detail page. Styled as `text-sm text-gray-500`.

---

## Test Impact

| File | Change |
|------|--------|
| New: `frontend/src/__tests__/layout/AdminLayout.conferenceNav.test.tsx` | Sidebar shows conference name and sub-links when on a conference route |
| New: `frontend/src/__tests__/layout/AdminLayout.conferenceNav.test.tsx` | No sub-links shown on the conferences list page |

---

## Rollout / Risk

- Pure frontend change; no backend migration or API changes.
- The sidebar query is already in place; adding a matched route reader is additive.
- Mobile: `AdminLayout` already hides the sidebar on small screens; no change needed.
