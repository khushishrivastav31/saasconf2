# Design — Sponsor Tier Assignment Flow

## Label Changes

### `SponsorsTab.tsx` — create/edit form

Change the dropdown label from `"Package"` to `"Sponsorship Tier (Package)"`.

Add `<p className="text-xs text-gray-500 mt-1">Tiers are defined in Settings → Sponsor Packages.</p>`
below the dropdown.

### Empty-state help text

Current (approx. line 353–358):
```tsx
No packages yet. Create them in the Settings tab under Sponsor Packages.
```

Change to a `<Link>` using `useNavigate` + `?section=settings&tab=sponsor-packages`:
```tsx
No tiers yet.{' '}
<Link to={`/modules/conferences/${conference.id}?section=settings&tab=sponsor-packages`}
  className="text-blue-600 hover:underline dark:text-blue-400">
  Create them in Settings → Sponsor Packages.
</Link>
```

---

## Tier Badge in Sponsor List

### Sponsor list table column

Current cell content: `{sponsor.sponsor_package_name || '-'}`

Replace with a `<TierBadge>` component (or inline logic):
```tsx
{sponsor.sponsor_package_name ? (
  <span
    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
    style={{ backgroundColor: sponsor.sponsor_package_color || '#e5e7eb', color: '#111827' }}
  >
    {sponsor.sponsor_package_name}
  </span>
) : (
  <span className="text-gray-400 text-xs">No tier</span>
)}
```

If the sponsor list API response does not include `sponsor_package_color`,
check `GET /conferences/{id}/sponsors` response schema and add the `color`
field to the `SponsorPackage` model response if it's not there.

---

## Test Impact

| File | Change |
|------|--------|
| `SponsorsTab.test.tsx` (new or extended) | Form dropdown has "Tier (Package)" label |
| Same | Empty package state renders a link to Settings |
| Same | Sponsor with a package shows a badge with the package name |
| Same | Sponsor without a package shows "No tier" placeholder |

---

## Rollout / Risk

- No backend model changes needed if `color` is already on the package schema.
- If `color` is missing from the API response, a small schema change + regen is
  needed — document in tasks.
