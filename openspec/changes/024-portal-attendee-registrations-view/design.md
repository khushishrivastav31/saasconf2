# Design — Portal attendee registrations view

## Backend

### New endpoint

`GET /portal/unified/me/registrations` — returns the attendee's
registrations across all conferences in the current tenant.

Query approach:

```python
email_hash = portal_user.email_hash
result = await db.execute(
    select(Registration, Conference.name)
    .join(Conference, Conference.id == Registration.conference_id)
    .where(
        Registration.tenant_id == tenant_id,
        Registration.email_hash == email_hash,
        Registration.status != 'cancelled',
    )
    .order_by(Conference.start_date.desc())
)
```

Return shape:

```python
class PortalRegistration(BaseModel):
    id: UUID
    conference_id: UUID
    conference_name: str
    booking_option_name: str | None
    status: str
    invoice_id: UUID | None
    invoice_number: str | None
    created_at: datetime
```

## Frontend

### New page

`frontend/src/pages/portal/RegistrationsPage.tsx` — table view of the
registrations returned by the new endpoint. Each row links to a small
detail panel (invoice, booking option, payment status).

### Route

`/{companySlug}/portal/registrations` registered in `App.tsx`.

### Sidebar

In `PortalLayout.tsx`, add a "Registrations" nav link visible when
`portalMe.is_conference_attendee === true`.

## Test Impact

| File | Change |
|------|--------|
| `tests/portal/test_my_registrations.py` (new) | Returns own registrations, excludes cancelled, isolates per tenant |
| `RegistrationsPage.test.tsx` (new) | Renders rows from mocked API |
| `PortalLayout.test.tsx` (extend) | Sidebar shows Registrations link when attendee |
