"""Main API router that combines all endpoint routers."""

from fastapi import APIRouter

from app.api.v1 import (
    admin_settings,
    attachments,
    audit,
    auth,
    cfp,
    cfp_portal,
    conferences,
    invoices,
    locations,
    modules,
    service_providers,
    settings,
    sponsors,
    tenants,
    user_conference_access,
    users,
    volunteers,
)
api_router = APIRouter()

# Authentication endpoints
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])

# Admin endpoints (super admin only)
api_router.include_router(tenants.router, prefix="/admin/tenants", tags=["Tenants"])
api_router.include_router(modules.router, prefix="/admin/modules", tags=["Modules"])
api_router.include_router(audit.router, prefix="/admin/audit-logs", tags=["Audit"])
api_router.include_router(admin_settings.router, prefix="/admin/settings", tags=["Admin Settings"])

# User management (tenant admin or super admin)
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(
    user_conference_access.router,
    prefix="/user-conference-access",
    tags=["User Conference Access"],
)

# Module-specific endpoints (requires module access)
api_router.include_router(conferences.router, prefix="/conferences", tags=["Conferences"])
api_router.include_router(volunteers.router, prefix="/volunteers", tags=["Volunteers"])
api_router.include_router(locations.router, prefix="/locations", tags=["Locations"])
api_router.include_router(cfp.router, prefix="/cfp", tags=["Call for Papers"])

# Conference-scoped settings (tenant admin or super admin)
api_router.include_router(settings.router, prefix="/conferences/{conference_id}/settings", tags=["Settings"])

# Service providers (nested under locations)
api_router.include_router(service_providers.router, prefix="/locations/{location_id}/service-providers", tags=["Service Providers"])

# Sponsors (conference-scoped)
api_router.include_router(sponsors.router, prefix="/conferences/{conference_id}/sponsors", tags=["Sponsors"])

# Invoices (conference-scoped)
api_router.include_router(invoices.router, prefix="/conferences/{conference_id}/invoices", tags=["Invoices"])

# File attachments
api_router.include_router(attachments.router, prefix="/attachments", tags=["Attachments"])

# CFP Applicant Portal (public + applicant-auth endpoints)
api_router.include_router(cfp_portal.router, tags=["CFP Portal"])
