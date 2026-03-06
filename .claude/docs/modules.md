# Module Documentation

## Registration Module

### Session Selection
When registering, if a booking option is linked to a program day that has sessions marked as `separately_bookable`, the registrant sees dropdown menus to choose sessions. Sessions are grouped by **session type** (e.g., Tutorial, Hackathon, Bonus Session) within each day.

- Parallel sessions in the same time slot: choose **one** via dropdown
- Non-parallel sessions (different slots): choose from **each** independently
- Sessions without papers assigned show: *"You can choose your sessions later. We will come back to you."*
- Session time labels account for multi-slot spans (e.g., full-day tutorials show 09:00-17:00, not just the first slot)
- Data is always fresh (`staleTime: 0`) so program changes are reflected immediately

### Registration Modes
- **Single Registration**: One attendee with billing info (uses `/registrations/individual` endpoint)
- **Group Registration**: Multiple attendees sharing one billing profile (uses `/registrations/bulk` endpoint)

### VAT Number Validation

**Single source of truth** — all VAT validation across the entire application goes through one path:

- **Backend**: `validate_vat_number()` in `app/core/vat_validation.py` — the only validation function. Every endpoint that validates VAT calls this one function.
- **Frontend**: `useVatValidation` hook (`hooks/useVatValidation.ts`) → `VatNumberInput` component (`components/common/VatNumberInput.tsx`). Every VAT field in the app uses this component.
- **Endpoint**: `POST /my-company/validate-vat?vat_number=...&country=...` — standalone, no module dependency. All VAT fields use this single endpoint.

**Any new VAT field must use `<VatNumberInput>`** — never create inline VAT validation or call the API directly.

VAT validation is triggered **on blur**. Country is resolved from: explicit `country` prop > VAT prefix extraction (first 2 chars) > fallback. Accepts both ISO codes (`DE`) and full country names (`Germany`).

Three-stage validation cascade:
1. **python-stdnum** (offline, fast) — validates format + checksum
2. **Regex fallback** — basic format check per country if stdnum fails
3. **VIES API** (`ec.europa.eu`) — online verification against EU registry if regex passes but stdnum failed

Validation results:
- **Valid** (green border + checkmark): stdnum or VIES confirmed
- **Invalid** (red border + X icon): validation failed — registration still proceeds but VAT is flagged
- **Uncertain** (yellow border + warning): format OK but VIES unavailable

Result persisted on `billing_profiles.vat_validated` column (`true`/`false`/`null`).

**Current locations using VatNumberInput**: Registration billing fields, Fiscal Rep section (2 fields), Sponsor detail panel, Sponsor create form, My Company page.

### Country Field Rules
- **Always use a `<select>` dropdown** with `COUNTRY_OPTIONS` from `frontend/src/config/countries.ts` — never a free-text `<input>`
- **Store ISO codes** (`"DE"`, `"RO"`, `"SE"`) — not full names
- Backend `normalize_country()` in `vat_validation.py` accepts both for backward compatibility

## Screen Overlays (Settings > Communication)

Full-screen overlays shown to portal users on login events. Support text content (title + body), animations, and optional image uploads.

### Image Upload
- **One image per overlay** with replace semantics (uploading new deletes old)
- Follows the **conference logo pattern**: dedicated upload/serve/delete endpoints with `image_url` column
- Stored via polymorphic `Attachment` model (`entity_type="screen_overlay_image"`)
- **Allowed types**: JPEG, PNG, WebB, GIF (no SVG — XSS risk in portal)
- EXIF metadata stripped via `strip_image_metadata()`
- **Public serve endpoint** (no auth) — `Cache-Control: public, max-age=86400`
- Cache-bust URL: `/conferences/{id}/screen-overlays/{overlay_id}/image?v={timestamp}`

### Trigger Types & Linking
- `first_registration` — shown once per user (localStorage key: `overlay_seen_{id}`)
- `scheduled` — shown on/after `schedule_date`
- `always` — shown every login
- Overlays can be linked to content entities via FK columns; linked overlays always show regardless of trigger type

## Booking Module — Discount Codes

Each conference can have discount codes for attendee bookings. Stored in `discount_codes` table.

- **Fields**: `description` (String 200), `code` (unique per conference), `discount_type` (percentage/fixed), `discount_value`, `currency`, `start_date`/`end_date`, `max_uses` (0=unlimited), `usage_count`, `is_active`, `is_combinable`
- **Applicability**: Scoped to specific booking **options** and/or **periods** via junction tables. Empty = applies to all.

### Bulk Discount Generation
- **People Sources**: Sponsors, Speakers, Program Committee, Recipient Lists
- **Template Variables**: `[ConferenceSlug]`, `[FirstName]`, `[LastName]`, `[FullName]`, `[CompanyName]`, `[Email]`, `[Counter]` (zero-padded)
- **Endpoint**: `POST /conferences/{id}/settings/discount-codes/bulk`
- **Two-step UI**: Step 1 (configure) → Step 2 (preview with duplicate highlighting)

## Sponsor Contract Management

Full contract lifecycle: create from templates or DOCX upload, edit rich-text content, version history, PDF/DOCX export, and email delivery.

### Data Model
- **`sponsor_contracts`** — one active contract per sponsor. Fields: `html_content`, `filename`, `status` (draft/sent/signed), `version_number`, `sent_at`, `sent_to_email`, `sent_by_user_id`
- **`sponsor_contract_versions`** — immutable snapshots created on each content save
- **Contract Statuses**: `draft` → `sent` → `signed`

### Document Processing
- **DOCX upload → HTML**: `mammoth`; **RTF upload → HTML**: `striprtf`
- **HTML → PDF export**: `fpdf2`; **HTML → DOCX export**: `html2docx`

### API Endpoints (12 routes under `/conferences/{id}/sponsors/{sponsor_id}/contract`)
GET `/`, POST `/generate`, PUT `/content`, PUT `/status`, GET `/download`, GET `/pdf`, GET `/send-preview`, POST `/send`, DELETE `/`, GET `/versions`, GET `/versions/{n}`, GET `/versions/{n}/download`

### Email Integration
- Template type: `sponsor_contract_send`
- Placeholders: `[Recipient Name]`, `[Package Name]`, `[Custom Message]`, `[Contract Content]`
- Uses `build_sponsor_contract_context()` in `app/core/email_templates.py`

## Alumni

Conference-scoped alumni tracking. **Core feature** — no module gate. Alumni records created manually, imported via CSV, or auto-created from paid registrations.

### Data Model
- **`alumni`** table — `email` (case-insensitive unique per conference), `first_name`, `last_name`, `company`, `source` (manual/import/registration), `notes`
- Migration: `104_alumni.py`

### API Endpoints (`/conferences/{id}/alumni/`)
GET `/` (paginated), POST `/`, PUT `/{id}`, DELETE `/{id}`, POST `/import` (CSV, up to 50k rows), GET `/export` (CSV UTF-8 BOM), GET `/check?email=...` (cross-conference lookup)

### Data Propagation
Email/name updates cascade to linked `Registration` and `CFPApplicant` records.

## Deadlines

Conference-scoped deadline tracking. **Core feature** — no module gate.

### Data Model
- **`deadlines`** table — `title`, `description`, `due_date` (TZ-aware), `is_active`, reminder flags (`reminder_7d_sent`, `reminder_1d_sent`, `reminder_due_sent`), `created_by`
- Migration: `105_deadlines.py`

### API Endpoints (`/conferences/{id}/deadlines/`)
GET `/`, POST `/`, PUT `/{id}`, PATCH `/{id}/toggle`, DELETE `/{id}`

### Reminder System
- `POST /ops/send-deadline-reminders` — cron endpoint (hourly), sends color-coded emails
- Due date change selectively resets reminder flags

### Frontend
- Color-coded cards: overdue (red), due-soon (amber), active (blue), resolved (gray)
- Toast warnings on load for deadlines due within 7 days

## Volunteer Task System

### Data Model
- **`volunteer_roles`** (Settings) — Task definitions. UI says "Volunteer Tasks" but table name is `volunteer_roles`
- **`session_volunteer_tasks`** — Links sessions to tasks with `required_count`
- **`volunteer_assignments`** — Links volunteers to session-tasks
- **`conference_volunteers.color`** — Per-conference hex color for visual identification

### API Endpoints (`/conferences/{id}/volunteer-tasks/`)
Module-gated by `volunteers`. 14 routes covering session-task CRUD, volunteer assignment, scheduling, and PDF export.

### Frontend Sections
Sidebar tree: **Volunteers** → **Task Assignment** | **Volunteer Assignment** | **Volunteer Schedule**
- **Task Assignment** — Program grid with drag-and-drop tasks
- **Volunteer Assignment** — Program grid with drag-and-drop volunteers
- **Volunteer Schedule** — Expandable list with PDF export
- Shared `useGridPositions` hook for CSS grid positioning
