# SaaSConf Project Notes

## Architecture
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (port 8000)
- **Frontend**: React + TypeScript + TanStack Query + Tailwind CSS (port 3000)
- **Migrations**: Alembic (sequential numbered: `001_`, `002_`, etc.)

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
VAT validation is triggered **on blur** of the VAT number field when:
- A **company name** is provided
- The **country** is an EU member state

Three-stage validation cascade:
1. **python-stdnum** (offline, fast) - validates format + checksum
2. **Regex fallback** - basic format check per country if stdnum fails
3. **VIES API** (`ec.europa.eu`) - online verification against EU registry if regex passes but stdnum failed

Validation results:
- **Valid** (green border): stdnum or VIES confirmed the VAT number
- **Invalid** (red border): validation failed - registration still proceeds but VAT is flagged
- **Uncertain** (yellow): format OK but VIES unavailable for online verification

The result is persisted on the `billing_profiles.vat_validated` column (`true`/`false`/`null`).

**Endpoint**: `POST /conferences/{id}/registrations/validate-vat?vat_number=...&country=...`

**Dependencies**: `python-stdnum` (added to `requirements.txt`)
