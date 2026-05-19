# Design — CFP Speaker Profile & Address Fields Save

## Investigation Areas

### 3.2.2 — Speaker profile

1. Locate the edit form: search `CFPApplicants/` for `useMutation` + `PATCH`
   targeting `/applicants/`.
2. Check the payload: does the mutation send `first_name`, `last_name`,
   `bio`, etc., or does it send only a subset?
3. Check the backend schema: `app/schemas/cfp/applicant.py` — is `ApplicantUpdate`
   comprehensive? Does it include all fields shown in the edit form?
4. Check optimistic update / `onSuccess`: does `queryClient.invalidateQueries`
   or `setQueryData` run after success? If the form closes before the
   refetch, stale data may re-render.

### 3.3.3 — User address fields

Backend: `app/schemas/user.py` — `UserUpdate` model.
- Check if `address_line_1`, `address_line_2`, `city`, `postal_code`,
  `country` are included as `Optional` fields.
- If absent, add them.

Frontend: the user edit form (likely in the member details drawer or modal).
- Check the PATCH body construction — are address fields included?
- If not, add them to the payload.

---

## Backend Changes (if needed)

### `app/schemas/user.py` — `UserUpdate`

Add address fields if missing:
```python
class UserUpdate(BaseModel):
    ...
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
```

### `app/api/v1/users.py` — PATCH handler

Confirm `update_data` includes address fields from `UserUpdate`:
```python
update_data = body.model_dump(exclude_unset=True)
for field, value in update_data.items():
    setattr(user, field, value)
```
No special handling needed — `model_dump(exclude_unset=True)` naturally
includes only provided fields.

---

## Frontend Changes (if needed)

### CFP applicant edit form

In `CFPApplicants/ApplicantForm/` or similar:
- Confirm the `PATCH` body includes all visible fields.
- Confirm `queryClient.invalidateQueries` is called in `onSuccess`.

### User address fields in member edit modal

- Confirm `address_line_1`, `city`, `postal_code`, `country` are sent in the
  PATCH body.

---

## Test Impact

| File | Change |
|------|--------|
| `tests/cfp/test_applicant_update.py` | PATCH with `bio` + `website` → persisted values match |
| `tests/users/test_user_update.py` (or existing) | PATCH with `city=London` → user.city === 'London' after reload |
| Frontend: CFP applicant form test | Save mutation sends all form fields; `invalidateQueries` called |
