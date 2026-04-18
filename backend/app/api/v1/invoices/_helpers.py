"""Shared helpers for invoice API endpoints."""

from uuid import UUID

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import AuthorizationError
from app.models.invoice import Invoice
from app.schemas.invoice import InvoiceResponse


async def require_invoice_admin(
    db: DbSessionDep,
    current_user: CurrentUserDep,
    conference_id: UUID,
) -> None:
    """Check admin access: super admin, tenant admin, OR conference-specific admin.

    Validates conference exists and belongs to the user's tenant (raises 404 if not).
    """
    from app.core.dependencies import check_conference_admin_access

    # Validate conference exists and belongs to tenant (raises 404 if not found)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Super admins and tenant admins have automatic access
    if current_user.is_super_admin or current_user.is_tenant_admin:
        return

    # For regular users, check conference-specific admin access
    has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
    if not has_access:
        raise AuthorizationError("Admin access to this conference required")


def build_invoice_response(
    invoice: Invoice,
    vat_warnings: list | None = None,
    vat_requirement: dict | None = None,
    related_invoice_number: str | None = None,
) -> InvoiceResponse:
    """Build invoice response with events and optional metadata.

    Args:
        invoice: Invoice model instance (with events loaded)
        vat_warnings: Optional VAT validation warnings
        vat_requirement: Optional VAT requirement details
        related_invoice_number: Optional related invoice number (for credit notes)

    Returns:
        InvoiceResponse with all data populated
    """
    response_data = {
        **invoice.__dict__,
        "events": [event.__dict__ for event in invoice.events] if invoice.events else [],
        "vat_auto_calculated": invoice.vat_auto_calculated,
        # @property accessors must be spelled out — __dict__ only has Mapped columns
        "recipient_email": invoice.recipient_email,
        "recipient_vat_number": invoice.recipient_vat_number,
        # Ensure list fields are not None (Pydantic v2 requirement)
        "line_items": invoice.line_items or [],
        "contact_persons": invoice.contact_persons or [],
    }

    # Add optional fields only if provided
    if vat_warnings is not None:
        response_data["vat_warnings"] = vat_warnings
    if vat_requirement is not None:
        response_data["vat_requirement"] = vat_requirement
    if related_invoice_number is not None:
        response_data["related_invoice_number"] = related_invoice_number

    return InvoiceResponse(**response_data)
