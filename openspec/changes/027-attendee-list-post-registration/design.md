# Design — Attendee appears in admin list after registration

## Backend

### Verify the existing list endpoint

Search for `GET /conferences/{id}/attendees` (or `/registrations`).
Confirm:
- It returns newly created registrations (no filter excludes pending /
  invoiced statuses).
- Default ordering puts newest first (or supports `order_by=created_at desc`).
- Default page size is at least 50 so a new row is not pushed off page 1
  on busy conferences.

### Regression test

```python
async def test_new_registration_appears_in_admin_list(...):
    # Submit a public registration
    await client.post(f"/portal/.../register", json=payload)

    # Fetch admin list
    resp = await client.get(
        f"/conferences/{conf.id}/attendees",
        headers=auth_headers(tenant_admin_token),
    )

    assert resp.status_code == 200
    emails = {item["email"] for item in resp.json()["items"]}
    assert payload["attendees"][0]["email"] in emails
```

## Frontend

### Query staleTime audit

In the Attendees tab, the list query should have:
- `staleTime: 0` (or ≤ 30_000) so a tab switch / focus refetches.
- `refetchOnWindowFocus: true` (default).

If a longer staleTime is set, lower it.

### Optional: add a manual "Refresh" button

If users frequently expect to see a newly registered attendee, a small
"Refresh" button next to the search input gives them an explicit action
without waiting for the focus-based refetch.

## Test Impact

| File | Change |
|------|--------|
| `tests/conferences/test_attendee_list.py` (new) | New registration appears in admin list |
| `AttendeesTab.test.tsx` (extend) | staleTime ≤ 30000 on the list query |
