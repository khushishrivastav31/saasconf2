# Design — Sidebar lists existing conferences

## Frontend

### Sidebar query

Add a TanStack Query inside `AppSidebar.tsx` (or wherever the
"Conferences" nav item is rendered):

```tsx
const { data: confData } = useQuery({
  queryKey: ['sidebar-conferences'],
  queryFn: async () => {
    const res = await api.get('/conferences?page_size=50');
    return res.data.items as Array<{ id: string; name: string }>;
  },
  staleTime: 60_000, // cheap nav list — 1 min is plenty
});
```

### Rendering

Below the "Conferences" parent item, render an indented list of
`<NavLink to={`/modules/conferences/${c.id}`}>` entries.

Use the current `useLocation()` to highlight the active conference. Active
class should match the rest of the sidebar styling.

### Query invalidation on create

In the conference create mutation's `onSuccess`, call:

```tsx
queryClient.invalidateQueries({ queryKey: ['sidebar-conferences'] });
```

## Test Impact

| File | Change |
|------|--------|
| `AppSidebar.test.tsx` (or new) | Renders conference names from mocked API |
| Same | Active conference is highlighted based on URL |
| Same | Invalidates the sidebar list when create mutation fires |
