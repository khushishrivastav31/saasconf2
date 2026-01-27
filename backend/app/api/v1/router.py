"""Main API router that combines all endpoint routers."""

from fastapi import APIRouter

from app.api.v1 import auth, tenants, modules, audit, volunteers, locations, cfp, users, conferences, settings, attachments, service_providers

api_router = APIRouter()

# Authentication endpoints
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])

# Admin endpoints (super admin only)
api_router.include_router(tenants.router, prefix="/admin/tenants", tags=["Tenants"])
api_router.include_router(modules.router, prefix="/admin/modules", tags=["Modules"])
api_router.include_router(audit.router, prefix="/admin/audit-logs", tags=["Audit"])

# User management (tenant admin or super admin)
api_router.include_router(users.router, prefix="/users", tags=["Users"])

# Module-specific endpoints (requires module access)
api_router.include_router(conferences.router, prefix="/conferences", tags=["Conferences"])
api_router.include_router(volunteers.router, prefix="/volunteers", tags=["Volunteers"])
api_router.include_router(locations.router, prefix="/locations", tags=["Locations"])
api_router.include_router(cfp.router, prefix="/cfp", tags=["Call for Papers"])

# Tenant settings (tenant admin or super admin)
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"])

# Service providers (nested under locations)
api_router.include_router(service_providers.router, prefix="/locations/{location_id}/service-providers", tags=["Service Providers"])

# File attachments
api_router.include_router(attachments.router, prefix="/attachments", tags=["Attachments"])
