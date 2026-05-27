# Tasks — Invite form filters roles by enabled modules

## Phase 0 — Recon

- [ ] Find `InviteUserModal.tsx` and confirm where `ROLE_OPTIONS` are
      defined (constant vs API-driven).
- [ ] Check whether `GET /admin/modules/enabled` (or similar) already
      exists.

## Phase 1 — Backend

### RED
- [ ] If endpoint missing: write test for `GET /admin/modules/enabled`
      returning the tenant's enabled modules.

### GREEN
- [ ] Implement endpoint if needed.

## Phase 2 — Frontend filter

### RED
- [ ] Test: a tenant with only `conferences` module → no "Trainings
      Admin" checkbox in the invite modal.
- [ ] Test: a tenant admin (non-super) → no "Tenant Super User" toggle.

### GREEN
- [ ] Fetch enabled modules in the modal.
- [ ] Filter `ROLE_OPTIONS` by module code.
- [ ] Guard the super user toggle with `currentUser.is_super_admin`.

### REFACTOR
- [ ] If `ROLE_OPTIONS` grows, extract to a shared `roleCatalog.ts`.

## Phase 3 — Full sweep

- [ ] Backend: pytest + ruff + mypy.
- [ ] Frontend: tsc + eslint + vitest.
- [ ] Manual: log in as tenant admin → open Invite → confirm only
      enabled-module roles are visible and no Super User toggle.
