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


def create_bulk_invoice_audit_logs(
    tenant_id: UUID,
    user_id: UUID,
    logs: list[dict],
    request: Request | None = None,
) -> list[AuditLog]:
    """Create multiple audit logs at once (for operations like replace/cancel).

    Use this helper to reduce code duplication when creating multiple audit logs
    for a single operation (e.g., invoice replacement creates 3-4 logs).

    Args:
        tenant_id: Tenant ID
        user_id: User ID performing action
        logs: List of dicts with keys: action, resource_id, details
        request: Optional request object for IP and user agent

    Returns:
        List of AuditLog models (not yet added to session)

    Example:
        logs = [
            {"action": "invoice.cancelled", "resource_id": old_invoice_id, "details": {...}},
            {"action": "invoice.credit_note_created", "resource_id": credit_note_id, "details": {...}},
            {"action": "invoice.replacement_created", "resource_id": new_invoice_id, "details": {...}},
        ]
        audit_logs = create_bulk_invoice_audit_logs(tenant_id, user_id, logs, request)
        db.add_all(audit_logs)
    """
    ip_address = get_client_ip(request) if request else None
    user_agent = request.headers.get("User-Agent") if request else None

    return [
        AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=log["action"],
            resource_type="invoice",
            resource_id=log["resource_id"],
            details=log["details"],
            ip_address=ip_address,
            user_agent=user_agent,
        )
        for log in logs
    ]
