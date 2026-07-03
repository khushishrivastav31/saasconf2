# MAIN-13427: Amount- and percentage-based discount on invoice line items

## Status
`shipped` · Branch: `feat/invoice-line-item-percentage-discount`

## Methodology
TDD — Red → Green → Refactor.

## Problem

GitHub issue #265. Invoice line items only support a fixed-amount discount
(`InvoiceLineItem.discount: float`, `backend/app/schemas/invoice.py:18-25`) —
admins wanting a percentage discount must calculate the discounted amount by hand
and enter it as a fixed value. This change keeps that existing amount-based
`discount` field as-is and adds a percentage-based alternative, so an admin can
pick either mode per line item.

### Recon findings (2026-07-02)

- Line items are **not** a separate DB table — `Invoice.line_items` is a JSONB
  column (`backend/app/models/invoice.py:78`). Adding a per-line-item field is a
  schema change, not a migration.
- `Invoice` already has `discount_code`/`discount_amount` columns
  (invoice.py:74-75), but these are informational (subtotal already reflects any
  discount — `app/core/vat/calculation.py:239-241` explicitly warns not to
  subtract `discount_amount` again). Not the mechanism this ticket targets.
- The server currently **trusts client-computed totals**:
  `backend/app/api/v1/invoices/crud.py:137-141` assigns `invoice.subtotal` and
  `invoice.total` directly from the request body; only `tax_amount`/final `total`
  get recomputed via `calculate_vat_for_invoice`. There is no existing
  server-side recompute of line-item totals from qty/unit_price/discount.
- Frontend editor: `frontend/src/pages/ConferenceDetail/tabs/InvoicesTab/
  InvoiceLineItemsEditor.tsx:47-107` renders Description/Qty/Unit Price/Discount/
  Total columns; calculation lives in `useInvoiceCreateForm.ts:103-110`
  (`total = quantity * unit_price - discount`, clamped at 0). A training-invoice
  analog exists at `frontend/src/pages/Trainings/tabs/InvoicesTab/
  LineItemsEditor.tsx`.
- Naming precedent: `backend/app/models/booking.py:211-212` uses a two-field
  `discount_type` ("percentage"/"fixed") + `discount_value` pattern for booking
  discount codes — worth following for consistency rather than inventing a new
  shape.
- ZUGFeRD e-invoicing XML generation (`app/core/zugferd/xml.py:147-166,588-651`)
  serializes per-line discounts for EN16931 compliance and will need updating if
  the line-item discount representation changes.

## Proposed Change

1. Add an optional `discount_percentage: float | None` field (`ge=0, le=100`) to
   `InvoiceLineItem` (`backend/app/schemas/invoice.py:18-25`), alongside the
   existing fixed-amount `discount` field — both discount modes remain
   available side by side (amount-based via `discount`, percentage-based via
   `discount_percentage`); an admin picks one per line item (frontend enforces
   "only one at a time" via UI, backend validates via a
   `validator`/`model_validator` rejecting both set simultaneously). No change
   to the existing `discount` field's behavior or name — kept additive and
   backward-compatible with every invoice already stored in the JSONB
   `line_items` column (rejected the alternative of unifying both into a
   `discount_type`/`discount_value` pair, per `design.md`, since that would
   require backfilling every existing invoice).
2. When `discount_percentage` is set, the line item total is
   `quantity * unit_price * (1 - discount_percentage / 100)`. Apply this both in
   the frontend calculation (`useInvoiceCreateForm.ts` and the training
   equivalent) and add a server-side recompute/validation of line-item totals in
   `crud.py` (currently absent — see recon) so a client can't send a mismatched
   total. This is new server-side behavior, not present today for the existing
   fixed-discount field either — flag for discussion in review since it changes
   trust behavior beyond just this ticket's field.
3. Update `InvoiceLineItemsEditor.tsx` (and the training `LineItemsEditor.tsx`)
   to add a "Discount %" input next to the existing amount-based "Discount"
   input (relabel to "Discount (amount)" for clarity now that two modes
   exist), with mutually-exclusive UI (selecting one clears the other).
4. Update `app/core/zugferd/xml.py` line-item discount serialization to derive
   the absolute discount amount from whichever field (fixed or percentage) is
   set, so EN16931 output stays correct either way.
5. Update `frontend/src/types/invoice.ts` and the duplicated Trainings
   `types.ts` line-item type.

## Out of Scope

- Invoice-level (as opposed to line-item-level) percentage discounts.
- Changing the existing `discount_code`/`discount_amount` invoice-level fields.
- Retroactively recomputing totals on already-issued invoices.

## Acceptance Criteria

- An admin can enter either an amount-based discount (existing `discount`
  field, unchanged) or a percentage discount (`discount_percentage`) on a
  line item; the line total, invoice subtotal, and invoice total reflect
  whichever mode is used correctly.
- A line item with both `discount` and `discount_percentage` set is rejected by
  the API with a clear validation error.
- ZUGFeRD-exported invoices with a percentage-discounted line item still pass
  EN16931 schema validation (existing ZUGFeRD tests continue to pass, plus a new
  case).
- Training invoices get the same capability via the shared line-item shape.

## Spec

See `openspec/specs/` once implementation lands.
