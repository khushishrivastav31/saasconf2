# Tasks — Session Types CRUD + QA coverage

## Phase 0 — Recon

- [ ] Inventory `session_types` model fields.
- [ ] Inventory existing endpoints + admin UI.
- [ ] Confirm where `session_type_id` is used (`program_sessions`,
      `cfp_papers`, etc.).

## Phase 1 — Backend CRUD (if missing)

### RED
- [ ] Tests for each missing endpoint, including:
  - Create / list / patch / delete happy paths.
  - 409 on delete when a `program_session` references the type.
  - Tenant isolation.

### GREEN
- [ ] Implement missing endpoints.

## Phase 2 — Frontend Settings tab

### RED
- [ ] Test: tab renders existing types, supports create/edit/delete.

### GREEN
- [ ] Build `SessionTypesTab.tsx`.

## Phase 3 — Program builder integration

### RED
- [ ] Test: creating a session shows configured session types in the
      type dropdown.

### GREEN
- [ ] Wire the dropdown to fetch types via the new endpoint.

## Phase 4 — Full sweep + manual

- [ ] Backend + frontend full sweep.
- [ ] Manual: create 3 session types → build a program → confirm they
      appear in the dropdown → save a session with a type → confirm it
      renders on the public program page.
