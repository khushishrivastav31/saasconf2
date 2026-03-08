"""Business logic services layer.

This package contains reusable business logic extracted from API endpoints.
Service functions are pure business logic with no HTTP dependencies.

Usage:
    from app.services.invoice_service import send_invoice_with_number_assignment

    result = await send_invoice_with_number_assignment(
        db=db,
        invoice=invoice,
        conference=conference,
        tenant_id=tenant_id,
        user_id=user_id,
    )
"""
