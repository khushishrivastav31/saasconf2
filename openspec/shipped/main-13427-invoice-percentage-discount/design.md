# MAIN-13427: Design

## Schema shape

```python
class InvoiceLineItem(BaseModel):
    description: str
    quantity: float
    unit_price: float
    discount: float = 0.0                      # existing: fixed amount, ge=0
    discount_percentage: float | None = None    # new: ge=0, le=100
    total: float

    @model_validator(mode="after")
    def _one_discount_kind(self):
        if self.discount and self.discount_percentage:
            raise ValueError("Set either discount or discount_percentage, not both")
        return self
```

Rejected alternative: replacing `discount` entirely with a `booking.py`-style
`discount_type` + `discount_value` pair. That's cleaner long-term but is a
breaking schema change for every existing invoice with `discount` set (every
historical invoice would need a migration/backfill of `discount_type="fixed"`).
Additive field keeps existing invoices valid with no backfill. Confirmed with
user (2026-07-02) — keep the additive two-field shape rather than unifying
into `discount_type`/`discount_value`.

Both discount modes are first-class going forward: `discount` for an
amount-based reduction, `discount_percentage` for a percentage-based one. UI
copy should make the amount field's mode explicit (relabel "Discount" →
"Discount (amount)") now that a second mode exists alongside it.

## Total calculation

```
if discount_percentage:
    total = quantity * unit_price * (1 - discount_percentage / 100)
else:
    total = quantity * unit_price - discount
total = max(total, 0)  # existing clamp, unchanged — except credit notes,
                        # which already bypass this per current code (total
                        # allowed negative there); preserve that carve-out.
```

## Server-side trust boundary — new territory

Recon found the server does **not** currently recompute line-item totals from
qty/unit_price/discount; it trusts `subtotal`/`total` from the request body
outright (`crud.py:137-141`). Introducing server-side validation for the new
`discount_percentage` field only (leaving the existing `discount` path
untouched) would create an inconsistent trust model — one field validated,
one not. Two options for review:

1. **Minimal**: validate only that `discount`/`discount_percentage` aren't both
   set; keep trusting client-computed `total` for both, matching current
   behavior. Lowest risk, keeps scope tight to this ticket.
2. **Broader**: add a server-side recompute of every line item's `total` from
   its inputs (both existing `discount` and new `discount_percentage`),
   rejecting a request whose submitted `total` doesn't match. Closes a
   pre-existing gap but touches all invoice creation/update paths, not just
   this feature.

Recommend (1) for this ticket to keep it scoped; file the trust-boundary gap
as a follow-up ticket if wanted. Flag explicitly in review.

## ZUGFeRD (EN16931) impact

`app/core/zugferd/xml.py:147-166,588-651` serializes per-line discounts into
the e-invoicing XML. Needs a branch: if `discount_percentage` is set, serialize
the *derived* absolute discount amount (`quantity * unit_price *
discount_percentage / 100`) into the same XML fields currently populated by
`discount`, so downstream EN16931 consumers see no schema difference — only
the source field differs.

## Frontend

`InvoiceLineItemsEditor.tsx` and the Trainings `LineItemsEditor.tsx` both need:
- A new "Discount %" numeric input alongside the existing amount-based
  "Discount" input (relabeled "Discount (amount)").
- Selecting one clears the other (mutually exclusive), enforced client-side to
  match the API's `model_validator`.
- `useInvoiceCreateForm.ts:103-110`'s total calculation updated per the formula
  above; same change needed in the Trainings hook equivalent.
