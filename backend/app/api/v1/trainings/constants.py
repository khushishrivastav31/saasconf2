"""Shared constants for training invoice and attendee endpoints."""

INVOICE_STATUSES = {"draft", "sent", "paid", "overdue", "cancelled"}
TEMPLATE_TYPES = {"bank_transfer", "credit_card", "credit_note"}
CANCELLABLE_STATUSES = {"sent", "overdue", "paid"}
ATTENDEE_STATUSES = {"active", "parked"}
ATTENDEE_EVENT_TYPES = {
    "registered",
    "offer_assigned",
    "parked",
    "reassigned",
    "cancelled",
    "offer_removed",
}
