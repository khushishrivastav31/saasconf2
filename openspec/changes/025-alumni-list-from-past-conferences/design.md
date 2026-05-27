# Design — Alumni list from past conferences

## Backend

### Endpoint

`GET /alumni?conference_id=<uuid>&role=<attendee|speaker|committee>`

Auth: `TenantAdminDep`.

### Query strategy

Build a CTE / union for each role, then collapse on `email_hash`:

```python
past = select(Conference.id).where(
    Conference.tenant_id == tenant_id,
    Conference.end_date < today,
)

attendees = (
    select(
        Registration.email_hash,
        Registration.first_name,
        Registration.last_name,
        literal("attendee").label("role"),
        Registration.conference_id,
    )
    .where(
        Registration.conference_id.in_(past),
        Registration.status != "cancelled",
    )
)
# Similar selects for speakers (CFPPaper joined to ConferenceCFPs)
# and committee members.

unioned = attendees.union_all(speakers, committee)
# Group by email_hash to dedupe, aggregating roles + conferences.
```

Return shape:

```python
class AlumniEntry(BaseModel):
    email_hash: str  # stable ID for the frontend
    first_name: str | None
    last_name: str | None
    email: str | None  # decrypted if we have it from any source
    roles: list[str]  # ['attendee', 'speaker']
    conferences: list[ConferenceRef]  # [{id, name, year}]
```

## Frontend

### Alumni tab

`frontend/src/pages/.../AlumniTab.tsx`. Table view: name, email,
conferences (badges), roles (badges). Filters at the top.

CSV export endpoint: `GET /alumni/export.csv` (streams). Use the
existing CSV streaming pattern from analytics.

## Test Impact

| File | Change |
|------|--------|
| `tests/admin/test_alumni.py` (new) | Aggregation across roles, dedup by email, tenant isolation, past-only filter |
| `AlumniTab.test.tsx` (extend) | Renders rows + filters |
