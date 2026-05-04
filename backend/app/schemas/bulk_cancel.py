"""Pydantic schemas for the bulk-cancel-with-credit-note flow.

Shared between the conference and training surfaces — both implement the
same filter shape (so the frontend can use one ``BulkCancelDialog``
component) and the same preview/confirm response.

The actual application of the filter happens in the surface-specific
endpoints (``app/api/v1/registrations/bulk_cancel.py`` for conference,
``app/api/v1/trainings/registrations/bulk_cancel.py`` for training)
because the underlying SQL touches different tables.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Bound on a single bulk operation. Past this we ask the admin to narrow
# the filter — keeps the transaction bounded and the email burst manageable.
MAX_BULK_CANCEL = 500


class RegistrationBulkCancelFilter(BaseModel):
    """Filter for selecting registrations to bulk-cancel.

    All fields are AND-combined; each ``None``/empty field is a wildcard.
    The endpoint ALWAYS additionally constrains by tenant + the
    surface-specific scope (conference_id for conference reg, tenant for
    training).
    """

    created_after: datetime | None = Field(
        None, description="Only registrations created at or after this UTC datetime."
    )
    created_before: datetime | None = Field(
        None, description="Only registrations created at or before this UTC datetime."
    )
    originating_ip: str | None = Field(
        None,
        description=(
            "Exact-match on the IP captured at registration creation time. "
            "Existing rows from before the originating_ip column was added "
            "are NULL and will not match."
        ),
        max_length=45,
    )
    booking_option_ids: list[UUID] | None = Field(
        None,
        description=(
            "Conference reg only: limit to registrations for these booking options. Ignored on the training endpoint."
        ),
    )
    placement_ids: list[UUID] | None = Field(
        None,
        description=(
            "Training reg only: limit to registrations for these training "
            "placements. Ignored on the conference endpoint."
        ),
    )
    billing_email_pattern: str | None = Field(
        None,
        description=(
            "Postgres ILIKE pattern against the billing contact email, e.g. "
            "``%@spam.com`` to match any throwaway from spam.com. Anchored "
            "patterns (no leading ``%``) match by prefix."
        ),
        max_length=255,
    )
    payment_status: Literal["any", "unpaid", "paid"] = Field(
        "any",
        description=(
            "``unpaid`` matches registrations whose linked invoice is not yet "
            "marked paid; ``paid`` is its inverse; ``any`` skips the filter."
        ),
    )
    reason: str = Field(
        ...,
        description=(
            "Human-readable reason for the bulk cancellation. Recorded on "
            "the audit log, on each per-registration history row, and "
            "appended to each generated credit note's notes field."
        ),
        min_length=10,
        max_length=500,
    )
    registration_ids: list[UUID] | None = Field(
        None,
        description=(
            "Optional explicit ID subset, used by the preview's per-row "
            "checkboxes. When set, the endpoint cancels ONLY rows that are "
            "both in this list AND in the filter result — the filter is "
            "still applied as a safety net, so an admin cannot trick the "
            "endpoint into cancelling a row outside the previewed scope. "
            "Leave NULL to cancel every matching row (the default before "
            "per-row deselection was added)."
        ),
    )


class BulkCancelGroupCount(BaseModel):
    """One row of a 'top N' grouping in the preview response."""

    key: str
    count: int


class RegistrationBulkCancelPreviewItem(BaseModel):
    """A single registration row surfaced in the preview list."""

    model_config = ConfigDict(from_attributes=True)

    registration_id: UUID
    created_at: datetime
    billing_email: str
    originating_ip: str | None
    invoice_total: str  # decimal as string (Pydantic + Decimal preservation)
    invoice_status: str | None
    label: str  # e.g. booking option name (conference) or placement title (training)


class RegistrationBulkCancelPreview(BaseModel):
    """Read-only preview of which rows the filter currently matches."""

    total: int = Field(
        ...,
        description=(
            "Total matching rows. May exceed MAX_BULK_CANCEL — confirm will "
            "reject in that case and the admin must narrow the filter."
        ),
    )
    truncated: bool = Field(
        ...,
        description=(
            "True if total > MAX_BULK_CANCEL. The ``items`` list is still "
            "populated up to MAX_BULK_CANCEL so the admin can see what "
            "would be cancelled if they narrowed."
        ),
    )
    total_credit_note_value: str = Field(
        ...,
        description=(
            "Sum of the original invoice totals (positive number; the credit notes will be the negation of this)."
        ),
    )
    by_originating_ip: list[BulkCancelGroupCount] = Field(
        default_factory=list,
        description="Top 10 groups by originating IP, descending count.",
    )
    by_billing_email: list[BulkCancelGroupCount] = Field(
        default_factory=list,
        description="Top 10 groups by billing email, descending count.",
    )
    items: list[RegistrationBulkCancelPreviewItem] = Field(
        default_factory=list,
        description="Per-row preview, capped at MAX_BULK_CANCEL.",
    )


class BulkCancelError(BaseModel):
    """Per-row error from the confirm path (e.g. failed Stripe refund)."""

    registration_id: UUID
    error: str


class RegistrationBulkCancelResult(BaseModel):
    """Response from the confirm endpoint."""

    cancelled: int = Field(..., description="Registrations whose status flipped to cancelled.")
    credit_notes_created: int = Field(..., description="New credit-note invoice rows persisted.")
    emails_sent: int = Field(..., description="Credit-note emails dispatched (best-effort).")
    refunds_initiated: int = Field(..., description="Stripe refunds requested (best-effort).")
    errors: list[BulkCancelError] = Field(
        default_factory=list,
        description=(
            "Best-effort side-effect failures. The cancellation itself is "
            "always durable — these only signal that an email or refund "
            "didn't go through and may need manual follow-up."
        ),
    )
