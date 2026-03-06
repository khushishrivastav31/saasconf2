"""Invoice audit log helpers."""

from uuid import UUID

from fastapi import Request

from app.core.dependencies import get_client_ip
from app.models.audit import AuditLog
from app.models.invoice import Invoice


def create_invoice_audit_log(
    tenant_id: UUID,
    user_id: UUID,
    action: str,
    invoice: Invoice,
    details: dict,
    request: Request | None = None,
) -> AuditLog:
    """Create standardized audit log for invoice operations.

    Args:
        tenant_id: Tenant ID
        user_id: User ID performing action
        action: Action name (e.g., "invoice.sent", "invoice.cancelled")
        invoice: Invoice model
        details: Additional details dict
        request: Optional request object for IP and user agent

    Returns:
        AuditLog model (not yet added to session)
    """
    audit_details = {
        "invoice_number": invoice.invoice_number,
        **details,
    }

    return AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource_type="invoice",
        resource_id=invoice.id,
        details=audit_details,
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.headers.get("User-Agent") if request else None,
    )
