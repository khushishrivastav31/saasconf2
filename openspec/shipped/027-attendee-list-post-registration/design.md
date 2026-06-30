# Design — Attendee appears in admin list after registration

## Backend

### Existing list endpoint (verified 2026-06-29)

`GET /conferences/{conference_id}/registrations`
(`backend/app/api/v1/registrations/core.py:83`). Confirmed:
- Returns newly created registrations — default excludes only
  `CANCELLED` (`core.py:128-132`); portal regs are
  `REGISTERED_PENDING_INVOICE`.
- Default ordering is newest first — `created_at.desc()` (`core.py:137`).
- Pagination is fine — newest-first keeps the fresh row on page 1; the
  frontend requests `page_size=100`.

No backend code change is required; the work is to lock this with a test.

### Regression test

Lives in `backend/tests/registrations/`, reusing the public-portal
fixtures/`PORTAL_BASE` helper from `test_public_registration_portal.py`.

```python
async def test_new_registration_appears_in_admin_list(...):
    # Submit a public portal registration
    await client.post(f"{PORTAL_BASE}/register", json=payload)

    # Fetch the admin registrations list
    resp = await client.get(
        f"/api/v1/conferences/{conf.id}/registrations",
        headers=auth_headers(tenant_admin_token),
    )

    assert resp.status_code == 200
    emails = {item["email"] for item in resp.json()["items"]}
    assert payload["attendees"][0]["email"] in emails
```

## Frontend

### Query staleTime audit (verified 2026-06-29)

The AttendeesTab list query (`AttendeesTab.tsx:79`) sets **no** explicit
`staleTime`, so it inherits the global 5-minute default
(`main.tsx:42`). To meet the ≤30s target, set on that query:
- `staleTime: 30_000` so a tab switch / focus refetches within 30s.
- `refetchOnWindowFocus: true` (already the global default).

Optional — a page reload already refetches, which satisfies the "or
after the admin reloads the page" acceptance clause, so this tune can be
skipped if reload-only is acceptable.

### Optional: add a manual "Refresh" button

If users frequently expect to see a newly registered attendee, a small
"Refresh" button next to the search input gives them an explicit action
without waiting for the focus-based refetch.

## Test Impact

| File | Change |
|------|--------|
| `backend/tests/registrations/test_attendee_list_post_registration.py` (new) | Public portal registration appears in admin `/registrations` list |
| `AttendeesTab.test.tsx` (new/extend, optional) | staleTime ≤ 30000 on the list query |
