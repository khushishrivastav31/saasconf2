# Design — Portal Attendee Profile (Change 002)

## Backend Changes

### `app/api/v1/portal_auth.py`

Extend `PortalMePatch` to include the full profile field set:

```python
class PortalMePatch(BaseModel):
    theme_preference: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    pronouns: str | None = None
    title: str | None = None
    company: str | None = None
    bio: str | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
```

`patch_portal_profile` — update each field if provided (skip if None).
Phone uses the existing `user.phone = value` property setter (handles
encryption + hashing automatically).

---

## Frontend Changes

### `ProfilePage.tsx`

Add a branch at the top of the component:

```tsx
const { applicant, portalMe, refreshApplicant } = useApplicantAuth();
const isAttendeeOnly = !applicant && !!portalMe?.is_conference_attendee;
```

**When `isAttendeeOnly`:**
- Seed form state from `portalMe` fields
- On save: `PATCH /portal/unified/me` with updated fields
- On success: call `refreshApplicant()` to refresh context

**When `applicant` exists (existing flow):**
- No change — existing CFP endpoint and logic untouched

---

## Test Impact

| File | Change |
|------|--------|
| New: `tests/portal/test_portal_profile_patch.py` | PATCH endpoint accepts all fields, persists correctly |
| New: `frontend/src/pages/portal/__tests__/ProfilePage.test.tsx` | Attendee branch renders portalMe data and saves via PATCH /portal/unified/me |

---

## Risk

Low. The backend change is additive (new optional fields on an existing
endpoint). The frontend change is a branch — the existing CFP path is
untouched.
