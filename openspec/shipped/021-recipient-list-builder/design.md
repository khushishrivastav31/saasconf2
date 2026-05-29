# Design — Recipient list builder

## Backend

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/recipient-lists` | List recipient lists for the current tenant |
| `POST` | `/recipient-lists` | Create a new list |
| `GET` | `/recipient-lists/{id}` | Get a list with its members |
| `PATCH` | `/recipient-lists/{id}` | Update name/description |
| `DELETE` | `/recipient-lists/{id}` | Delete a list |
| `POST` | `/recipient-lists/{id}/members` | Add members (single or bulk) |
| `DELETE` | `/recipient-lists/{id}/members/{member_id}` | Remove a member |

All gated by `TenantAdminDep` + the `messaging` module (or equivalent).

### Models

`recipient_lists` and `recipient_list_members` already exist in the
schema. Confirm during recon.

## Frontend

### New route

`/modules/communications/recipient-lists` (or `/settings/recipient-lists`
if that fits the existing IA better — locate during recon).

### Components

- `RecipientListsPage.tsx` — index page with a table + "New List" button.
- `RecipientListDetailPage.tsx` — edit name, view + edit members.
- `AddMembersModal.tsx` — search existing applicants/attendees by email,
  add to the list. Bulk paste also supported.

## Test Impact

| File | Change |
|------|--------|
| `tests/messaging/test_recipient_lists.py` (new) | CRUD + member add/remove + tenant isolation |
| `RecipientListsPage.test.tsx` (new) | Renders list, opens create modal |
| `RecipientListDetailPage.test.tsx` (new) | Add/remove members |
