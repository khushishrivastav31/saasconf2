# Deadlines Calendar

## Context

Conference organizers need to track important deadlines (contract sign-off dates, submission windows, payment due dates, etc.). Currently there's no deadline management — organizers rely on external tools. This feature adds a **Deadlines tab** to ConferenceDetail where admins can create deadlines with due dates and descriptions. The system sends **email reminders** (7 days before, 1 day before, and on the due date) to the conference contact email, and shows **toast warnings** in the UI when deadlines are approaching. Admins can **deactivate** a deadline once it's been handled.

## Design Decisions

- **Core feature, no module gate**: Deadlines are always visible (like Details, Team, Alumni) — no `require_module()` on the backend router, no `moduleCode` in `conferenceSections.ts`. Placed in `coreSections` between Alumni and Settings.
- **Hourly cron**: A `deadline-cron` container (like `cleanup-cron`) calls `POST /ops/send-deadline-reminders` every hour with Bearer token auth.
- **Simple emails**: Inline HTML email via `send_email()` — not a DB-backed template. Includes conference name, deadline title, description, due date in conference timezone, and reminder type.
- **Toast warnings**: On ConferenceDetail load, approaching deadlines (within 7 days or overdue) trigger warning toasts. Max 2 individual toasts; 3+ collapses to a summary.

---

## Changes

### 1. Migration — `backend/app/db/migrations/versions/105_deadlines.py`

Create `deadlines` table (following `104_alumni.py` pattern):

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `tenant_id` | `UUID` | FK → tenants, NOT NULL, CASCADE |
| `conference_id` | `UUID` | FK → conferences, NOT NULL, CASCADE |
| `title` | `VARCHAR(500)` | NOT NULL |
| `description` | `TEXT` | nullable |
| `due_date` | `TIMESTAMPTZ` | NOT NULL |
| `is_active` | `BOOLEAN` | NOT NULL, default `true` |
| `reminder_7d_sent` | `BOOLEAN` | NOT NULL, default `false` |
| `reminder_1d_sent` | `BOOLEAN` | NOT NULL, default `false` |
| `reminder_due_sent` | `BOOLEAN` | NOT NULL, default `false` |
| `created_by` | `UUID` | FK → users, SET NULL |
| `created_at` | `TIMESTAMPTZ` | default `now()` |
| `updated_at` | `TIMESTAMPTZ` | default `now()` |

Indexes: `ix_deadlines_conference_id`, `ix_deadlines_due_date`, partial `ix_deadlines_active_due` on `(is_active, due_date) WHERE is_active = true`.

RLS: `tenant_isolation_deadlines` (same tenant_id + super_admin pattern as alumni).

### 2. Model — `backend/app/models/deadline.py` (new)

SQLAlchemy model following `alumni.py` pattern. Relationships to Tenant and Conference.

Register in `backend/app/models/__init__.py`: add import + `"Deadline"` to `__all__`.

### 3. Constants & Audit Actions

**`backend/app/constants.py`**: Add `ResourceType.DEADLINE = "deadline"` (after `DISCOUNT_CODE`).

**`backend/app/models/audit.py`**: Add to `AuditAction` (after Alumni group):
```python
DEADLINE_CREATE = "deadline.create"
DEADLINE_UPDATE = "deadline.update"
DEADLINE_DELETE = "deadline.delete"
```

### 4. Schemas — `backend/app/schemas/deadline.py` (new)

Following `schemas/news.py` pattern:
- `DeadlineCreate`: title (required, max 500), description (optional), due_date (datetime, required)
- `DeadlineUpdate`: all optional (title, description, due_date, is_active)
- `DeadlineResponse`: all fields, `model_config = ConfigDict(from_attributes=True)`
- `DeadlineListResponse`: `items: list[DeadlineResponse]`, `total: int`

### 5. API Router — `backend/app/api/v1/deadlines.py` (new)

Conference-scoped CRUD, no module gate. Following `alumni.py` pattern using `ConferenceService`:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET ""` | `/conferences/{id}/deadlines` | Any user | List deadlines ordered by `due_date ASC` |
| `POST ""` | `/conferences/{id}/deadlines` | Admin | Create deadline + audit log |
| `PUT "/{deadline_id}"` | `/conferences/{id}/deadlines/{did}` | Admin | Update fields. If `due_date` changes, reset relevant reminder flags |
| `DELETE "/{deadline_id}"` | `/conferences/{id}/deadlines/{did}` | Admin | Delete + audit log |
| `PATCH "/{deadline_id}/toggle"` | `/conferences/{id}/deadlines/{did}/toggle` | Admin | Toggle `is_active` + audit log |

**Due date change logic**: When `due_date` is updated, reset reminder flags where the new window hasn't passed yet (e.g., if new `due_date - 7d > now()`, reset `reminder_7d_sent = false`).

Register in `backend/app/api/v1/router.py`:
```python
from app.api.v1 import deadlines
api_router.include_router(deadlines.router, prefix="/conferences/{conference_id}/deadlines", tags=["Deadlines"])
```

### 6. Reminder Endpoint — `backend/app/main.py`

Add `POST /ops/send-deadline-reminders` after the existing cleanup endpoint (line 371). Same Bearer token auth pattern.

Logic:
1. Query active deadlines where any reminder is due but unsent
2. For each, determine which reminders to send (7d / 1d / due)
3. Send email to `conference.contact_email` (fallback: `support_email`) via `send_email()`
4. Mark `reminder_*_sent = true`, commit
5. Skip if no email or `email_sending_enabled` is false

Add helper `_send_deadline_reminder()` in `backend/app/core/email.py` for the email template (subject: `[Conference Name] Deadline Reminder: {title}`, body: reminder type badge, title, description, due date in conference timezone).

### 7. Cron Container — `deploy/staging/docker-compose.yml`

Add `deadline-cron` after `cleanup-cron` (~line 153):
```yaml
deadline-cron:
  image: curlimages/curl:8.5.0
  container_name: saasconf_deadline_cron
  restart: unless-stopped
  depends_on: [backend]
  environment:
    SUPER_ADMIN_PASSWORD: "Test1234"
  entrypoint: "/bin/sh -c 'trap exit TERM; while :; do sleep 3600; curl -sf -X POST -H \"Authorization: Bearer $${SUPER_ADMIN_PASSWORD}\" http://backend:8000/ops/send-deadline-reminders || echo \"Deadline reminders failed\"; done;'"
  networks: [saasconf_network]
```

### 8. Frontend Sidebar — `conferenceSections.ts`

Add `'deadlines'` to `SectionId` union type (line 47, after `'alumni'`).

Add to `coreSections` array (between alumni and settings):
```typescript
{ id: 'deadlines', name: 'Deadlines', icon: DeadlinesIcon },
```

Add `DeadlinesIcon` to `icons.tsx` (calendar SVG icon) and import it.

### 9. Query Keys — `frontend/src/config/queryKeys.ts`

Add:
```typescript
deadlines: {
  byConference: (conferenceId: string) => ['conference-deadlines', conferenceId] as const,
},
```

### 10. DeadlinesTab — `frontend/src/pages/ConferenceDetail/tabs/DeadlinesTab.tsx` (new)

Following `NewsTab.tsx` pattern. Props: `{ conference, isAdmin }`.

**Data fetching**: `useQuery` with `queryKeys.deadlines.byConference(conferenceId)`.

**Mutations**: create, update, toggle, delete — all invalidate query on success.

**UI**:
- Header with "Deadlines" title + "New Deadline" button (admin only)
- Card list sorted by `due_date` ASC (active first, then resolved)
- Each card: title, description (truncated), formatted due date, status badge, action buttons
- **Status color coding**:
  - Overdue + active → red border/badge
  - Due within 7 days + active → amber border/badge
  - Active, not urgent → blue badge, normal styling
  - Resolved (`is_active=false`) → gray, muted, strikethrough title
- **Modal** for create/edit: title (text input), description (textarea), due date (`<input type="datetime-local">`)
- **ConfirmDialog** for delete
- Dark mode: all `dark:` Tailwind variants

### 11. Register Tab — `frontend/src/pages/ConferenceDetail/index.tsx`

Add lazy import (after AlumniTab, line 29):
```typescript
const DeadlinesTab = lazy(() => import('./tabs/DeadlinesTab'));
```

Add render case (after alumni, before settings, ~line 417):
```tsx
{activeSection === 'deadlines' && conference && (
  <DeadlinesTab conference={conference} isAdmin={isAdmin} />
)}
```

### 12. Toast Warnings — `frontend/src/pages/ConferenceDetail/index.tsx`

In the main component, after conference data loads:
- Fetch deadlines (reuse the same query key — TanStack Query deduplicates)
- `useEffect` with a `useRef` guard (show once per mount): filter active deadlines due within 7 days
- If 1-2 approaching: show individual warning toasts per deadline
- If 3+: show single summary toast ("X deadlines approaching")

### 13. Backend Tests — `backend/tests/test_deadlines.py` (new)

Tests following existing patterns:
- `test_create_deadline` — POST 201, verify response
- `test_list_deadlines` — GET, verify items + total
- `test_update_deadline` — PUT, verify updated fields
- `test_delete_deadline` — DELETE 200
- `test_toggle_deadline` — PATCH toggle, verify `is_active` flips
- `test_create_deadline_not_admin` — 403 for non-admin
- `test_update_due_date_resets_reminders` — verify flags reset
- `test_deadline_not_found` — 404
- `test_cross_tenant_isolation` — can't access other tenant's deadlines

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/app/db/migrations/versions/105_deadlines.py` | Migration |
| `backend/app/models/deadline.py` | SQLAlchemy model |
| `backend/app/schemas/deadline.py` | Pydantic schemas |
| `backend/app/api/v1/deadlines.py` | CRUD router |
| `backend/tests/test_deadlines.py` | Backend tests |
| `frontend/src/pages/ConferenceDetail/tabs/DeadlinesTab.tsx` | Frontend tab |

### Modified Files

| File | Change |
|------|--------|
| `backend/app/models/__init__.py` | Import Deadline, add to `__all__` |
| `backend/app/constants.py` | Add `ResourceType.DEADLINE` |
| `backend/app/models/audit.py` | Add `DEADLINE_CREATE/UPDATE/DELETE` |
| `backend/app/api/v1/router.py` | Register deadlines router |
| `backend/app/main.py` | Add `/ops/send-deadline-reminders` endpoint |
| `backend/app/core/email.py` | Add `send_deadline_reminder()` helper |
| `deploy/staging/docker-compose.yml` | Add `deadline-cron` container |
| `frontend/src/pages/ConferenceDetail/index.tsx` | Lazy import + render + toast warnings |
| `frontend/src/pages/ConferenceDetail/conferenceSections.ts` | Add `'deadlines'` section |
| `frontend/src/pages/ConferenceDetail/icons.tsx` | Add `DeadlinesIcon` |
| `frontend/src/config/queryKeys.ts` | Add deadlines query keys |

---

## Verification

1. `cd backend && venv/bin/python -m alembic upgrade head` — migration applies cleanly
2. `cd backend && venv/bin/pytest tests/test_deadlines.py -v` — all tests pass
3. `cd backend && venv/bin/ruff check app/ && venv/bin/ruff format --check app/` — no lint errors
4. `cd frontend && npx tsc --noEmit` — zero TypeScript errors
5. `cd frontend && npx vitest run` — all tests pass
6. Manual: Conference → Deadlines tab visible in sidebar
7. Manual: Create/edit/delete/toggle deadlines
8. Manual: Overdue deadlines show red, approaching show amber, resolved show gray
9. Manual: Toast warnings appear on conference load for approaching deadlines
10. Manual: Dark mode renders correctly
