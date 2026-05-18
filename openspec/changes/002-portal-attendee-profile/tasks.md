# Tasks — Portal Attendee Profile (Change 002)

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 1 — Extend PATCH /portal/unified/me

### RED
- [x] Write `tests/portal/test_portal_profile_patch.py`
  - PATCH with first_name → persisted on PortalUser
  - PATCH with phone → encrypted + hashed correctly
  - PATCH with address fields → persisted
  - PATCH with unknown fields → ignored (no 422)
  - Run → **expect failure**: endpoint ignores new fields

### GREEN
- [x] Extend `PortalMePatch` schema with all profile fields
- [x] Update `patch_portal_profile` to apply each field when provided
- [x] Run tests → **expect green**

### REFACTOR
- [x] Confirm phone setter handles None correctly (clear both encrypted + hash)

---

## Phase 2 — Frontend attendee profile branch

### RED
- [x] Write / extend `frontend/src/pages/portal/__tests__/ProfilePage.test.tsx`
  - When applicant=null + portalMe set → form seeded from portalMe
  - On save → calls PATCH /portal/unified/me (not /portal/me)
  - On success → refreshApplicant() called
  - Run (`pnpm test`) → **expect failure**

### GREEN
- [x] Add `isAttendeeOnly` branch to `ProfilePage.tsx`
- [x] Seed form from `portalMe` when `isAttendeeOnly`
- [x] Save via `PATCH /portal/unified/me`
- [x] Run tests → **expect green**

### REFACTOR
- [x] Confirm CFP applicant path is bit-for-bit unchanged
- [x] Fix theme persist: attendees use `PATCH /portal/unified/me` (not `PUT /portal/me`)
- [x] Fix navbar alignment: `ml-auto` on header right-side div

---

## Phase 3 — Full sweep

- [x] `venv/bin/python -m pytest tests/ -v -n 3 --dist=loadfile`
- [x] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [x] `ruff check app/ && ruff format --check app/`
- [x] `pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [x] `pnpm gen:api` + `pnpm gen:api:check`
- [x] Manual: attendee logs in → opens profile → edits name → saves → refreshed ✓
- [x] Manual: theme toggle persists after profile save ✓
- [x] Manual: navbar options right-aligned ✓
