"""Shared helpers for tenant endpoints."""

from app.models.tenant import Tenant
from app.schemas.tenant import TenantResponse


def _build_tenant_response(tenant: Tenant, user_count: int = 0, module_count: int = 0) -> TenantResponse:
    """Build a TenantResponse from a Tenant model instance."""
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        settings=tenant.settings,
        address=tenant.address,
        postal_code=tenant.postal_code,
        city=tenant.city,
        country=tenant.country,
        vat_number=tenant.vat_number,
        website=tenant.website,
        logo_url=tenant.logo_url,
        contact_persons=tenant.contact_persons or [],
        comments=tenant.comments,
        super_user_id=tenant.super_user_id,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        user_count=user_count,
        module_count=module_count,
    )
