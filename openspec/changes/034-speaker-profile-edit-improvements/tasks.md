# Tasks — Improve the speaker profile edit page

## Phase 0 — Recon (done during planning)

- [x] `ProfilePage.tsx` drives all profile state; `requiredSpeakerFields` is
      aggregated from open CFPs' `required_speaker_fields`; `handleSubmit`
      already validates bio/title/company/phone/picture/video.
- [x] Required speaker fields are admin-configured in `CFPsTab.tsx` and
      allow-listed by `VALID_SPEAKER_FIELDS` in `schemas/cfp.py`
      (`{bio, picture, video, phone, title, company}`).
- [x] `required_speaker_fields` is JSONB → adding `address` needs **no migration**.
- [x] `RichTextEditor` already supports `minLength`/`maxLength` with a live
      counter (`RichTextEditor.tsx:450`).
- [x] `phone` is a single PII-encrypted field; `libphonenumber-js` is a
      dependency (`getCountryCallingCode`, `AsYouType`, `parsePhoneNumber`).
- [x] `AddressFields` / `IdentityFields` are presentational; `IdentityFields`
      already takes an optional `requiredFields` prop.

## Phase 1 — Address as a required speaker field

### RED
- [ ] Backend test: a CFP with `required_speaker_fields=["address"]` is accepted
      (currently rejected as an invalid speaker field).
- [ ] Vitest (`ProfilePage`): when `address` is required and address fields are
      blank, saving is blocked with an "Address" error; filling Line 1 + City +
      Postal + Country allows save (Line 2 optional).
- [ ] Vitest (`AddressFields`): required asterisks render on Line 1 / City /
      Postal / Country when `requiredFields` includes `address`.

### GREEN
- [ ] Add `"address"` to `VALID_SPEAKER_FIELDS` (`schemas/cfp.py`).
- [ ] Add the `address` checkbox to *Required Speaker Profile Fields* in
      `CFPsTab.tsx`.
- [ ] `AddressFields`: accept `requiredFields?: string[]`, render `*` on the four
      required sub-fields.
- [ ] `ProfilePage`: pass `requiredFields={requiredSpeakerFields}` to
      `AddressFields`; extend the `handleSubmit` guard with `address`
      (all four present), label `"Address"`.

### REFACTOR
- [ ] Keep the field→label map and required logic defined once.

## Phase 2 — Short Bio help text + 300/2,000 char limits

### RED
- [ ] Vitest: Short Bio shows help text and a counter; saving a bio >2,000 chars
      is blocked; a non-empty bio <300 chars is blocked; an empty optional bio
      still saves.

### GREEN
- [ ] Add `BIO_MIN_CHARS`/`BIO_MAX_CHARS` constants; pass `minLength`/`maxLength`
      to the Short Bio `RichTextEditor`; add help text under the label.
- [ ] Enforce the bounds in `handleSubmit` using the HTML-stripped length,
      surfaced through the existing error banner.

### REFACTOR
- [ ] Share the HTML-stripped-length helper with the existing bio check.

## Phase 3 — Phone country-code dropdown

### RED
- [ ] Vitest (`PhoneNumberInput`): selecting a country + typing a national number
      emits the expected E.164 value; an existing E.164 value is parsed back into
      dial code + national number on mount.
- [ ] Vitest (`ProfilePage`): editing the phone via the new control round-trips
      into the `PUT /portal/me` payload as E.164.

### GREEN
- [ ] Add `PhoneNumberInput.tsx` (country/dial-code `<select>` from
      `COUNTRY_OPTIONS` + `getCountryCallingCode`; national input; emits E.164).
- [ ] Use it inside `IdentityFields` (keep the `phone` required marker).
- [ ] Default dial code from profile `country`; keep `validatePhone` gating.

### REFACTOR
- [ ] Ensure no inline objects in render paths; memoise the dial-code option list.

## Phase 4 — Verify sweep (mandatory before PR)

- [ ] `cd backend && venv/bin/python -m pytest tests/ -k "cfp or speaker_field" -v`
- [ ] `cd backend && venv/bin/python -m pytest tests/ -v` (full)
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] **OpenAPI drift**: `address` is a validator value, not a schema-shape
      change — confirm `pnpm gen:api:check` is clean (regen only if it reports drift).
- [ ] Handbook: note the address requirement + bio length policy in
      `sections/people.tsx`.

## Phase 5 — Ship

- [ ] Present commit message + PR title, ask once.
- [ ] On approval: commit, push, open PR (per requested merge mode).
- [ ] After merge: move `openspec/changes/034-…` → `openspec/shipped/`.
