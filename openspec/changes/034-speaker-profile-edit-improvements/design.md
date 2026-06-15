# Design notes — Change 034

## Address required field

`required_speaker_fields` is a free-form JSONB list guarded by the
`VALID_SPEAKER_FIELDS` set, so the entire mechanism — admin config, portal
aggregation, save-time validation — already exists. Adding `address` is purely
additive:

- No DB migration (JSONB list).
- No OpenAPI shape change (the value set is enforced in a Pydantic
  `field_validator`, not the schema type), so `api.generated.ts` should be
  unchanged — verify with `pnpm gen:api:check`.
- "Address present" = Address Line 1 **and** City **and** Postal Code **and**
  Country are non-empty. Address Line 2 remains optional (it is explicitly
  labelled "optional" in the UI).

## Bio length enforcement

`RichTextEditor` already accepts `minLength`/`maxLength` and renders a
colour-coded counter, so the UI affordance is free. Enforcement at save reuses
the page's existing HTML-stripped measure:

```ts
const bioTextLen = bio.replace(/<[^>]*>/g, '').trim().length;
```

Rules:
- `bioTextLen > BIO_MAX_CHARS (2000)` → always block.
- `bioTextLen > 0 && bioTextLen < BIO_MIN_CHARS (300)` → block.
- `address`/`bio` required handling stays in the existing
  `requiredSpeakerFields` guard; a required-but-empty bio already errors as
  "Short Bio". The min-300 rule then applies to the entered content.

Counting on stripped text (not raw HTML) keeps the limit meaningful — markup
characters don't inflate the count. This matches how the page already measures
bio presence.

## Phone country-code dropdown — keep one E.164 string

The phone is stored as a single PII-encrypted value (`phone_encrypted`), and
both `validatePhone` (frontend) and the backend assume **E.164**
(`+<calling code><national number>`). Rather than add a country-code column
(new migration, new schema field, more PII surface), the dropdown is a **pure UI
composer**:

- The `<select>` lists `COUNTRY_OPTIONS` with their dial code from
  `getCountryCallingCode(code)` (e.g. `Germany (+49)`).
- As the user types the national part, `AsYouType(country)` / `parsePhoneNumber`
  produces the E.164 string written into the existing `phone` state.
- On mount, an existing stored E.164 number is parsed back
  (`parsePhoneNumber(phone)`) to pre-select the country and fill the national
  field. If the stored value is a legacy local number that can't be parsed, fall
  back to showing it raw in the national input with no country pre-selected, so
  nothing is lost.

Net result: no backend or DB change for phone — the improvement is entirely a
frontend input that guarantees a valid international number.

### Why not a separate country-code field?
A separate column would require a migration, schema + generated-type changes,
backfill from existing numbers, and double the places that must agree on
formatting. The single-E.164 approach is lossless, validates with the existing
library, and is what the rest of the system already expects.

## Risk / blast radius

- Backend change is one set member; lowest possible risk.
- Frontend changes are confined to the profile surface + one admin checkbox.
- The phone parser must degrade gracefully on unparseable legacy values (covered
  by a test) so existing speakers' saved numbers are never dropped.
