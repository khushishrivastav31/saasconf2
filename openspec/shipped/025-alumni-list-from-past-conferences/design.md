# Design — Alumni list from past conferences

## Backend

### Routing

The legacy alumni CRUD router already owns
`/conferences/{conference_id}/alumni`. The new aggregation read path is
**tenant-scoped** and mounts at its own prefix so the two never collide:

```
GET /alumni                                  # JSON list (paginated)
GET /alumni/export.csv                       # streamed CSV
```

Auth: `TenantAdminDep`. `tenant_id` comes from the authenticated admin;
RLS still applies on every underlying table.

New module: `app/api/v1/alumni_list.py` (do not extend the legacy
`app/api/v1/alumni.py`), included in `app/api/v1/router.py` with
`prefix="/alumni"`, tag `Alumni`.

### Query parameters

| Param | Type | Notes |
|-------|------|-------|
| `conference_id` | `UUID?` | Restrict to one past conference. 404/empty if it is not a past conference of this tenant. |
| `role` | `attendee \| speaker \| committee`? | Keep only alumni who hold this role. |
| `search` | `str?` | Optional name match (`unaccent_ilike` on first/last name), consistent with other admin lists. |
| `skip` / `limit` | `int` | Default 100, max 500 (per perf rules). |

### "Past" definition

`Conference.end_date < today`. Conferences with a **null** `end_date` are
excluded — they have not ended. There is **no `year` column** on
`Conference`; derive the display year from `end_date` (fallback
`start_date`).

### Query strategy

Three role sub-selects projecting a common shape
`(email_hash, first_name, last_name, role, conference_id)`, unioned, then
grouped on `email_hash` to dedupe and aggregate roles + conferences.

```python
today = date.today()

past = (
    select(Conference.id)
    .where(
        Conference.tenant_id == tenant_id,
        Conference.end_date.is_not(None),
        Conference.end_date < today,
    )
)

# 1. Attendees — Registration, non-cancelled.
attendees = select(
    Registration.email_hash,
    Registration.first_name,
    Registration.last_name,
    literal("attendee").label("role"),
    Registration.conference_id,
).where(
    Registration.tenant_id == tenant_id,
    Registration.conference_id.in_(past),
    Registration.status != RegistrationStatus.CANCELLED.value,
    Registration.email_hash.is_not(None),
)

# 2a. Main speakers — accepted papers. Paper -> CallForPapers ->
#     conference_cfps (M2M) gives the conference(s).
# 2b. Co-speakers — CFPPaperCospeaker with invitation_status == 'accepted',
#     same accepted-paper + conference join.
#     Both project CFPApplicant.email_hash/first_name/last_name and
#     literal("speaker").

# 3. Committee — CFPCommitteeMember.applicant_id -> CFPApplicant,
#     conference_id direct, joined to `past`. literal("committee").

unioned = union_all(attendees, main_speakers, co_speakers, committee).subquery()

rows = (
    select(
        unioned.c.email_hash,
        func.min(unioned.c.first_name).label("first_name"),
        func.min(unioned.c.last_name).label("last_name"),
        func.array_agg(distinct(unioned.c.role)).label("roles"),
        func.array_agg(distinct(unioned.c.conference_id)).label("conference_ids"),
    )
    .group_by(unioned.c.email_hash)
)
```

Notes / decisions:

- **Dedup key is `email_hash`.** A person who is both attendee and speaker
  collapses to one row with `roles = ['attendee', 'speaker']`. Rows whose
  `email_hash` is null are dropped (cannot be deduped or contacted).
- **Email/name are encrypted PII.** `email_hash` is queryable;
  the plaintext `email`, `first_name`, `last_name` come from decrypting one
  source row (`read_pii`) after the grouped query returns — resolve
  conference names in a second batched query keyed by `conference_id`, no
  N+1 inside the union.
- `role` / `conference_id` filters are applied as outer `HAVING` /
  `WHERE` on the grouped result so a person still appears with all their
  roles even when filtered to one.

### Response shape

```python
class ConferenceRef(BaseModel):
    id: UUID
    name: str
    year: int | None   # derived from end_date (fallback start_date)

class AlumniEntry(BaseModel):
    email_hash: str            # stable ID for the frontend
    first_name: str | None
    last_name: str | None
    email: str | None          # decrypted from any source row
    roles: list[str]           # subset of ['attendee','speaker','committee']
    conferences: list[ConferenceRef]

class AlumniListResponse(BaseModel):
    items: list[AlumniEntry]
    total: int
```

`model_config = ConfigDict(from_attributes=True)` (Pydantic v2).

### CSV export

`GET /alumni/export.csv` reuses the same aggregation, streamed via
`StreamingResponse` / the shared `csv_response` helper (see
`app/core/csv_export.py`, mirroring `app/api/v1/applicant_activity.py`).
Columns: `first_name, last_name, email, roles, conferences`
(`roles` and `conferences` joined with `; `). Respects the same filters.
Cap at 50k rows per the streaming-export rule.

## Frontend

### Alumni tab

`frontend/src/pages/ConferenceDetail/tabs/AlumniTab.tsx` is rewritten from
the legacy CRUD/import UI into a **read-only tenant-wide list**:

- Table columns: name, email, conference badges, role badges.
- Filter bar: conference `<select>`, role `<select>`, name search.
- "Export CSV" button hitting `/alumni/export.csv` with current filters.
- `React.memo` on the row component; `useUrlFilters` for filter state
  (already imported in the existing tab).
- New types in `frontend/src/types/alumni.ts`; query key in
  `frontend/src/config/queryKeys.ts`.
- Regenerate `frontend/src/types/api.generated.ts` (`pnpm gen:api`).

> Note: the legacy add / delete / import controls are removed from this
> tab. The discount-list management surface, if still needed, stays on the
> legacy conference-scoped endpoint — out of scope here.

## Test Impact

| File | Change |
|------|--------|
| `backend/tests/test_alumni_list.py` (new) | Dedup across roles by email_hash, attendee/speaker/co-speaker/committee sourcing, accepted-papers-only, cancelled-registration exclusion, past-only (`end_date < today`, null excluded), `conference_id` + `role` filters, tenant isolation, CSV matches JSON |
| `frontend/.../__tests__/AlumniTab.test.tsx` (new/extend) | Renders rows from mocked API, role + conference badges, filter wiring |
| `frontend/src/types/api.generated.ts` | Regenerated for the new endpoints |
