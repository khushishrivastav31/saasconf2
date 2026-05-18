# Design — Portal Attendee Registration Questions (Change 003)

## Migration

`migrations/versions/223_attendee_question_answers.py`

```sql
ALTER TABLE registration_question_answers
  ADD COLUMN portal_user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE;
```

Existing rows: `portal_user_id = NULL` (CFP applicant answers, unchanged).
New rows: `applicant_id = NULL`, `portal_user_id = <attendee's portal_user.id>`.

Add index: `(portal_user_id, conference_id)`.

---

## Backend Changes

### New file: `app/api/v1/portal/attendee_questions.py`

**`GET /portal/attendee/registration-questions/pending`**

Uses `CurrentPortalUserDep`. Logic mirrors the existing CFP endpoint but:
- Finds conferences via `Registration.email_hash == hash_email(portal_user.email)`
- Loads existing answers filtered by `portal_user_id == portal_user.id`
- Returns same `PendingSummaryResponse` schema

**`POST /portal/conferences/{conference_id}/attendee/registration-questions/answers`**

Uses `CurrentPortalUserDep`. Logic mirrors existing submit endpoint but:
- Verifies registration via `email_hash`
- Stores answers with `portal_user_id` set, `applicant_id = NULL`

### Router registration

Mount in `app/api/v1/portal/__init__.py` or wherever portal routes are
registered.

---

## Frontend Changes

### `PortalLayout.tsx`

**Pending questions query** (line ~309):
```tsx
enabled: !!applicant || !!portalMe?.is_conference_attendee,
```

**Query URL** — conditional on user type:
```tsx
const pendingQuestionsUrl = applicant
  ? '/portal/registration-questions/pending'
  : '/portal/attendee/registration-questions/pending';
```

**Submit answers URL** (inside the questionnaire component):
Pass `isAttendeeOnly` prop so it calls the correct submit endpoint.

---

## Test Impact

| File | Change |
|------|--------|
| New migration test | `portal_user_id` column exists, nullable |
| New: `tests/portal/test_attendee_reg_questions.py` | pending endpoint, submit endpoint, idempotent re-submit |
| `PortalLayout` frontend test | attendee user sees gate when mandatory questions pending |

---

## Risk

Medium. Requires a migration and new endpoints. CFP applicant flow is
completely unchanged — new code is additive. The migration adds a nullable
column so it is safe on a live table.
