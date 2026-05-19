# Tasks — CFP Speaker Profile & Address Fields Save

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 0 — Investigation

- [ ] Find the exact frontend component that renders the speaker edit form
  (search `CFPApplicants/` for `useMutation` + `PATCH` + `/applicants/`)
- [ ] Find the backend schema for applicant update: `app/schemas/cfp/`
- [ ] Find the user edit form in the admin (search for `address_line_1` or
  `postal_code` in frontend src)
- [ ] Find `UserUpdate` in `app/schemas/user.py` — check for address fields
- [ ] Document findings before Phase 1

---

## Phase 1 — Backend: user address fields in schema

### RED
- [ ] Write `tests/users/test_user_update_address.py`:
  - PATCH `/users/{id}` with `{ "city": "London", "postal_code": "W1A 1AA", "country": "GB" }`
  - Assert response returns updated values
  - Assert a fresh GET returns the same values
  - Run → **expect failure** if fields are absent from `UserUpdate`

### GREEN
- [ ] Add address fields to `UserUpdate` schema if missing
- [ ] Confirm PATCH handler propagates fields via `model_dump(exclude_unset=True)`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm `country` is validated as an ISO 3166-1 alpha-2 code (using
  existing `COUNTRY_OPTIONS` or validators)

---

## Phase 2 — Backend: CFP applicant profile update

### RED
- [ ] Write `tests/cfp/test_applicant_profile_update.py`:
  - PATCH applicant with `{ "bio": "New bio text", "website": "https://example.com" }`
  - Assert response reflects updated values
  - Assert a fresh GET returns same values
  - Run → **expect failure** if fields are missing from `ApplicantUpdate`

### GREEN
- [ ] Add any missing fields to `ApplicantUpdate` schema
- [ ] Confirm PATCH handler propagates all fields
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Ensure `website` is validated as a URL (existing `validators.py` pattern)

---

## Phase 3 — Frontend: form payload completeness

### RED
- [ ] Write / extend frontend test for CFP applicant edit form:
  - Change `bio` and `website` fields, submit
  - Assert the PATCH mutation body includes both fields
  - Assert `queryClient.invalidateQueries` is called after success
  - Run → **expect failure** if fields are dropped

### GREEN
- [ ] Ensure the form payload construction includes all visible fields
- [ ] Ensure `invalidateQueries` is called in `onSuccess`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm `onError` shows a toast with `parseApiError`

---

## Phase 4 — Full sweep

- [ ] `cd backend && venv/bin/python -m pytest tests/users/ tests/cfp/ -v`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: edit a CFP applicant's bio → save → reload → confirm persisted
- [ ] Manual: edit a user's city/postcode → save → reload → confirm persisted
- [ ] `pnpm gen:api` if schema changed; commit `api.generated.ts`
