# Design — Session Types CRUD

## Recon outputs

Before implementation, document:

- Current `session_types` model fields (`app/models/session_type.py` or
  similar).
- Existing endpoints (if any) at `/conferences/{id}/session-types`.
- Whether `program_sessions.session_type_id` is wired.
- Whether the program builder reads session types when rendering the
  "type" dropdown.

## Backend

If endpoints are missing, add (gated by `TenantAdminDep`):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/conferences/{id}/session-types` | List |
| `POST` | `/conferences/{id}/session-types` | Create |
| `PATCH` | `/conferences/{id}/session-types/{type_id}` | Update |
| `DELETE` | `/conferences/{id}/session-types/{type_id}` | Delete (block if in use) |

Standard fields: `name`, `colour_hex`, `default_duration_minutes`,
`description`, `is_active`.

## Frontend

New `SessionTypesTab.tsx` under conference Settings. Table view with
inline create/edit. Colour swatch picker.

## Test Impact

| File | Change |
|------|--------|
| `tests/conferences/test_session_types.py` (new) | CRUD + delete-when-in-use guard |
| `SessionTypesTab.test.tsx` (new) | Create/edit/delete flow |
| Program builder test (extend) | Session type dropdown shows configured types |
