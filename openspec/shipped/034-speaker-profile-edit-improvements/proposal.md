# Change 034 — Improve the speaker profile edit page (address required-config, bio limits, phone country code)

## Status
`planned` · Branch: `feat/speaker-profile-edit-improvements`

## Methodology
TDD — Red → Green → Refactor.

## Problem

The CFP applicant portal **My Profile** page (`ProfilePage` → `/portal/profile`,
`PUT /portal/me`) has three usability gaps surfaced during staging review
(screenshots attached to the task):

1. **Address can't be made mandatory.** The *Address* block (Address Line 1 /
   Line 2 / City / Postal Code / Country) is always optional. An admin who needs
   a speaker's postal address (e.g. to ship badges, contracts, or swag) has **no
   way to require it** — the CFP admin screen
   (`CFPsTab` → *Required Speaker Profile Fields*) only offers
   bio / picture / video / phone / title / company. The backend allow-list
   `VALID_SPEAKER_FIELDS` likewise has no `address` entry.

2. **Short Bio has no guidance or length bounds.** The bio rich-text editor
   shows no help text and accepts any length. The desired policy is a
   **minimum of 300 and a maximum of 2,000 characters**, with a visible hint and
   a live character counter, so speakers write a usable bio (not one word, not an
   essay).

3. **Phone has no country code affordance.** The phone field is a bare
   `type="tel"` input, but `validatePhone` (frontend `libphonenumber-js`) and the
   backend both expect **international E.164 format** (e.g. `+49176…`). Speakers
   type local numbers like `017621151336`, which are ambiguous and fail
   validation. We need a **country-code dropdown** beside the number so the
   stored value is a valid international number.

## Proposed Change

All three are scoped to the speaker profile surface; only #1 touches the backend
(a one-line allow-list addition + the admin UI), and no migration is required.

### 1. Make *Address* an admin-configurable required speaker field

- **Backend:** add `"address"` to `VALID_SPEAKER_FIELDS` in
  `backend/app/schemas/cfp.py` (used by both `CFPBase` and `CFPUpdate`
  validators). `required_speaker_fields` is a JSONB list — **no migration**.
- **Admin UI:** add `{ key: 'address', label: 'Address' }` to the *Required
  Speaker Profile Fields* checkbox list in
  `frontend/src/pages/ConferenceDetail/tabs/CFPsTab.tsx`.
- **Portal profile:** when any open CFP requires `address`, mark **Address Line
  1, City, Postal Code, and Country** as required (`*`); **Address Line 2 stays
  optional**. Add `address` to the missing-required-fields guard in
  `ProfilePage.handleSubmit` (label `"Address"`), and thread a `requiredFields`
  prop into `AddressFields` so the asterisks render. This reuses the existing
  `requiredSpeakerFields` / `requiredFieldErrors` machinery already used for
  bio/title/company/phone/picture/video.

### 2. Short Bio — help text + 300/2,000 character bounds

- Pass `minLength={300}` and `maxLength={2000}` to the Short Bio `RichTextEditor`
  (the component already renders a live, colour-coded character counter for these
  props — see `RichTextEditor.tsx:450`).
- Add help text under the label: e.g. *"Write 300–2,000 characters about
  yourself and your experience."*
- Enforce on save in `handleSubmit`: using the existing HTML-stripped text length
  (`bio.replace(/<[^>]*>/g, '').trim()`), block the save when the bio is
  **over 2,000** characters always, and when it is **under 300** characters if
  the bio is non-empty or `bio` is a required field. Surface via the existing
  `requiredFieldErrors`/error banner pattern.
- Limits live as named constants (`BIO_MIN_CHARS = 300`, `BIO_MAX_CHARS = 2000`)
  so they are easy to find / change later.

### 3. Phone — country-code dropdown

- Introduce a small `PhoneNumberInput` component (portal/profile) that pairs a
  **country/dial-code `<select>`** (built from `COUNTRY_OPTIONS` +
  `getCountryCallingCode` from `libphonenumber-js`) with the national-number
  input, and emits a single **E.164 string** (via `libphonenumber-js`
  `AsYouType` / `parsePhoneNumber`) into the existing `phone` state.
- The stored value remains the **existing single `phone` field** (PII-encrypted
  `phone_encrypted` on `CFPApplicant`) — **no schema/DB change**. On load, the
  saved E.164 number is parsed back to pre-select the dial code and populate the
  national part.
- Default the dial code from the applicant's profile `country` when set,
  otherwise leave unselected (placeholder) and require a choice before a number
  validates. `validatePhone` continues to gate the value.
- Wire it into `IdentityFields` in place of the bare phone `<input>`.

## Out of Scope

- Storing a separate phone country-code column (we keep one E.164 string).
- Making the bio length limits per-CFP configurable (fixed 300/2,000 for now;
  noted as a possible follow-up alongside the paper-field `min_chars/max_chars`
  pattern).
- The attendee-only profile variant's bio editor (no length policy requested
  there) — may be aligned in a follow-up.
- Address validation beyond presence (no postal-format checks per country).
- Any change to how `phone`/`address` are encrypted or stored.

## Affected Code

- `backend/app/schemas/cfp.py` — add `"address"` to `VALID_SPEAKER_FIELDS`.
- `frontend/src/pages/ConferenceDetail/tabs/CFPsTab.tsx` — `address` checkbox.
- `frontend/src/pages/portal/ProfilePage.tsx` — required-field guard for
  `address`; bio min/max enforcement + help text; pass `requiredFields` to
  `AddressFields`.
- `frontend/src/pages/portal/profile/AddressFields.tsx` — required asterisks +
  `requiredFields` prop.
- `frontend/src/pages/portal/profile/IdentityFields.tsx` — use `PhoneNumberInput`.
- `frontend/src/pages/portal/profile/PhoneNumberInput.tsx` — **new** component.
- `frontend/src/components/common/RichTextEditor` — reused as-is (min/max props).
- Tests: `ProfilePage.test.tsx`, `CFPsTab` tests (if present), new
  `PhoneNumberInput` test; backend `tests/` for the `address` allow-list value.
- `frontend/src/pages/Handbook/sections/people.tsx` — note address requirement +
  bio length policy.

## Open Questions (decide before/at implementation)

1. **Bio minimum** — enforce the 300-char minimum only when the bio is required
   or non-empty (proposed), or always block any save with <300 chars? Proposed:
   only when required or non-empty.
2. **Phone default dial code** — derive from profile `country`, or a fixed
   tenant default (e.g. `DE`) when country is blank? Proposed: derive from
   country, else placeholder.
3. **Address granularity** — require Line 1 + City + Postal + Country
   (proposed), or also accept Country-only? Proposed: the four, Line 2 optional.

## Spec

See `openspec/specs/` once implementation lands.
