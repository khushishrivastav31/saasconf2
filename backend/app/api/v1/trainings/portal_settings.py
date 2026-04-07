"""Training portal settings — admin endpoints for configuring the public training portal."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy.orm import attributes

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.models.tenant import Tenant

router = APIRouter(prefix="/portal-settings", tags=["training-portal-settings"])

SETTINGS_KEY = "training_portal"


async def _get_tenant(db: DbSessionDep, current_user: TenantAdminDep) -> Tenant:
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.get("")
async def get_portal_settings(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get training portal settings."""
    tenant = await _get_tenant(db, current_user)
    settings = (tenant.settings or {}).get(SETTINGS_KEY, {})

    return {
        "enabled": settings.get("enabled", False),
        "registration_start_date": settings.get("registration_start_date"),
        "registration_end_date": settings.get("registration_end_date"),
        "success_message": settings.get("success_message", ""),
        "theme": settings.get(
            "theme",
            {
                "primary": "#2563eb",
                "background": "#f9fafb",
                "card": "#ffffff",
                "text": "#111827",
                "border": "#e5e7eb",
                "headerBg": "#ffffff",
            },
        ),
    }


@router.put("")
async def update_portal_settings(
    data: dict,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Update training portal settings."""
    tenant = await _get_tenant(db, current_user)

    settings = tenant.settings or {}
    portal = settings.get(SETTINGS_KEY, {})

    if "enabled" in data:
        portal["enabled"] = bool(data["enabled"])
    if "registration_start_date" in data:
        portal["registration_start_date"] = data["registration_start_date"] or None
    if "registration_end_date" in data:
        portal["registration_end_date"] = data["registration_end_date"] or None
    if "success_message" in data:
        portal["success_message"] = data["success_message"] or ""
    if "theme" in data and isinstance(data["theme"], dict):
        portal["theme"] = data["theme"]

    settings[SETTINGS_KEY] = portal
    tenant.settings = settings
    attributes.flag_modified(tenant, "settings")
    await db.commit()
    await db.refresh(tenant)

    return {
        "enabled": portal.get("enabled", False),
        "registration_start_date": portal.get("registration_start_date"),
        "registration_end_date": portal.get("registration_end_date"),
        "success_message": portal.get("success_message", ""),
        "theme": portal.get("theme", {}),
    }
