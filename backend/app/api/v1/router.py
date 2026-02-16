"""Main API router that combines all endpoint routers."""

from fastapi import APIRouter

from app.api.v1 import (
    admin_settings,
    applicant_activity,
    attachments,
    audit,
    auth,
    cfp,
    cfp_portal,
    conferences,
    form_schema,
    invoices,
    locations,
    messaging,
    modules,
    news,
    program,
    service_providers,
    settings,
    sponsors,
    tenant_company,
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

# Tenant company management (tenant admin)
api_router.include_router(tenant_company.router, prefix="/my-company", tags=["My Company"])

# Applicant activity logs (tenant admin)
api_router.include_router(
    applicant_activity.router,
    prefix="/applicant-activity",
    tags=["Applicant Activity"],
)

# Module-specific endpoints (requires module access)
api_router.include_router(conferences.router, prefix="/conferences", tags=["Conferences"])
api_router.include_router(volunteers.router, prefix="/volunteers", tags=["Volunteers"])
api_router.include_router(locations.router, prefix="/locations", tags=["Locations"])
api_router.include_router(cfp.router, prefix="/cfp", tags=["Call for Papers"])

# Conference-scoped settings (tenant admin or super admin)
api_router.include_router(settings.router, prefix="/conferences/{conference_id}/settings", tags=["Settings"])

# Paper form schema (conference-scoped)
api_router.include_router(form_schema.router, prefix="/conferences/{conference_id}/paper-form-schema", tags=["Paper Form Schema"])

# Service providers (nested under locations)
api_router.include_router(service_providers.router, prefix="/locations/{location_id}/service-providers", tags=["Service Providers"])

# Sponsors (conference-scoped)
api_router.include_router(sponsors.router, prefix="/conferences/{conference_id}/sponsors", tags=["Sponsors"])

# Invoices (conference-scoped)
api_router.include_router(invoices.router, prefix="/conferences/{conference_id}/invoices", tags=["Invoices"])

# Program design (conference-scoped)
api_router.include_router(program.router, prefix="/conferences/{conference_id}/program", tags=["Program"])

# News (conference-scoped)
api_router.include_router(news.router, prefix="/conferences/{conference_id}/news", tags=["News"])

# Messaging (conference-scoped)
api_router.include_router(messaging.router, prefix="/conferences/{conference_id}/messaging", tags=["Messaging"])

# Cross-conference messaging (global unread count)
from app.api.v1.messaging.global_unread import router as global_unread_router
api_router.include_router(global_unread_router, prefix="/messaging", tags=["Messaging"])

# File attachments
api_router.include_router(attachments.router, prefix="/attachments", tags=["Attachments"])

# CFP Applicant Portal (public + applicant-auth endpoints)
api_router.include_router(cfp_portal.router, tags=["CFP Portal"])
