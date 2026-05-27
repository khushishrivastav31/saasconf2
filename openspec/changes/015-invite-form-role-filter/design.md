# Design — Invite form filters roles by enabled modules

## Frontend

Locate `InviteUserModal.tsx`. The current role checkboxes are hard-coded
or driven by a constant `ROLE_OPTIONS`. Replace with:

```tsx
const { data: tenantModules } = useQuery({
  queryKey: ['tenant-modules'],
  queryFn: async () => {
    const res = await api.get<{ items: { code: string }[] }>(
      '/admin/modules/enabled'
    );
    return new Set(res.data.items.map((m) => m.code));
  },
  staleTime: 5 * 60_000,
});

const visibleRoles = ROLE_OPTIONS.filter((r) =>
  tenantModules?.has(r.moduleCode) ?? false
);
```

Render `visibleRoles` instead of `ROLE_OPTIONS`.

For the Super User toggle:

```tsx
{currentUser.is_super_admin && (
  <Checkbox label="Tenant Super User" .../>
)}
```

(A tenant admin promoting someone to super user is a privilege
escalation; the backend already rejects this, but the UI should not
show it either.)

## Backend

If `GET /admin/modules/enabled` doesn't exist, add it. It returns the
list of `tenant_modules` rows where `is_enabled = true`, joined to
`modules` for the code.

## Test Impact

| File | Change |
|------|--------|
| `InviteUserModal.test.tsx` (extend) | Conferences-only tenant — no Trainings Admin checkbox |
| Same | Tenant admin user — no Super User toggle |
| Backend test (new or extend) | `GET /admin/modules/enabled` returns enabled modules |
