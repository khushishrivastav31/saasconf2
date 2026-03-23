"""Main API router that combines all endpoint routers."""

from fastapi import APIRouter

from app.api.v1 import (
    admin_settings,
    alumni,
    analytics,
    applicant_activity,
    attachments,
    audit,
    auth,
    badges,
    budgets,
    cfp,
    cfp_portal,
    conferences,
    deadlines,
    form_schema,
    invoices,
    locations,
    messaging,
    mfa,
    modules,
    news,
    payment_reminders,
    portal,
    portal_templates,
    program,
    registration_question_answers,
    registrations,
    screen_overlays,
    service_providers,
    settings,
    speaker_expenses,
    sponsor_contracts,
    sponsors,
    stripe_webhooks,
    system_email_templates,
    tenant_company,
    tenants,
    trainings,
    user_conference_access,
    users,
    vat_rates,
    volunteer_profiles,
    volunteer_tasks,
)
from app.api.v1.messaging.global_unread import router as global_unread_router

api_router = APIRouter()

# Authentication endpoints
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(mfa.router, prefix="/auth", tags=["MFA"])

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

# System email templates (tenant admin)
api_router.include_router(
    system_email_templates.router,
    prefix="/system-email-templates",
    tags=["System Email Templates"],
)

# Applicant activity logs (tenant admin)
api_router.include_router(
    applicant_activity.router,
    prefix="/applicant-activity",
    tags=["Applicant Activity"],
)

# Module-specific endpoints (requires module access)
api_router.include_router(conferences.router, prefix="/conferences", tags=["Conferences"])
api_router.include_router(trainings.router, prefix="/trainings", tags=["Trainings"])
api_router.include_router(locations.router, prefix="/locations", tags=["Locations"])
api_router.include_router(cfp.router, prefix="/cfp", tags=["Call for Papers"])

# Conference-scoped settings (tenant admin or super admin)
api_router.include_router(settings.router, prefix="/conferences/{conference_id}/settings", tags=["Settings"])

# Paper form schema (conference-scoped)
api_router.include_router(
    form_schema.router, prefix="/conferences/{conference_id}/paper-form-schema", tags=["Paper Form Schema"]
)

# Service providers (nested under locations)
api_router.include_router(
    service_providers.router, prefix="/locations/{location_id}/service-providers", tags=["Service Providers"]
)

# Alumni (conference-scoped)
api_router.include_router(alumni.router, prefix="/conferences/{conference_id}/alumni", tags=["Alumni"])

# Deadlines (conference-scoped)
api_router.include_router(deadlines.router, prefix="/conferences/{conference_id}/deadlines", tags=["Deadlines"])

# Sponsors (conference-scoped)
api_router.include_router(sponsors.router, prefix="/conferences/{conference_id}/sponsors", tags=["Sponsors"])

# Sponsor contracts (nested under sponsors)
api_router.include_router(
    sponsor_contracts.router,
    prefix="/conferences/{conference_id}/sponsors/{sponsor_id}/contract",
    tags=["Sponsor Contracts"],
)

# Screen Overlays (conference-scoped)
api_router.include_router(
    screen_overlays.router, prefix="/conferences/{conference_id}/screen-overlays", tags=["Screen Overlays"]
)

# Invoices (conference-scoped)
api_router.include_router(invoices.router, prefix="/conferences/{conference_id}/invoices", tags=["Invoices"])

# Payment reminders (conference-scoped)
api_router.include_router(
    payment_reminders.router,
    prefix="/conferences/{conference_id}/payment-reminders",
    tags=["Payment Reminders"],
)

# Badges (conference-scoped)
api_router.include_router(badges.router, prefix="/conferences/{conference_id}/badges", tags=["Badges"])

# Budget planning (conference-scoped)
api_router.include_router(
    budgets.router,
    prefix="/conferences/{conference_id}/budgets",
    tags=["Budgets"],
)

# Speaker expenses (conference-scoped, admin)
api_router.include_router(
    speaker_expenses.router,
    prefix="/conferences/{conference_id}/speaker-expenses",
    tags=["Speaker Expenses"],
)

# Analytics (conference-scoped)
api_router.include_router(
    analytics.router,
    prefix="/conferences/{conference_id}/analytics",
    tags=["Analytics"],
)

# VAT rates (global, public for reads, superadmin for updates)
api_router.include_router(vat_rates.router, tags=["VAT Rates"])

# Program design (conference-scoped)
api_router.include_router(program.router, prefix="/conferences/{conference_id}/program", tags=["Program"])

# Volunteer task assignments (conference-scoped)
api_router.include_router(
    volunteer_tasks.router,
    prefix="/conferences/{conference_id}/volunteer-tasks",
    tags=["Volunteer Tasks"],
)

# Volunteer profiles (conference-scoped)
api_router.include_router(
    volunteer_profiles.router,
    prefix="/conferences/{conference_id}/volunteer-profiles",
    tags=["Volunteer Profiles"],
)

# News (conference-scoped)
api_router.include_router(news.router, prefix="/conferences/{conference_id}/news", tags=["News"])

# Registrations (conference-scoped)
api_router.include_router(
    registrations.router, prefix="/conferences/{conference_id}/registrations", tags=["Registrations"]
)

# Registration question answers (conference-scoped, admin view)
api_router.include_router(registration_question_answers.router, tags=["Registration Questions"])

# Messaging (conference-scoped)
api_router.include_router(messaging.router, prefix="/conferences/{conference_id}/messaging", tags=["Messaging"])

# Cross-conference messaging (global unread count)
api_router.include_router(global_unread_router, prefix="/messaging", tags=["Messaging"])

# File attachments
api_router.include_router(attachments.router, prefix="/attachments", tags=["Attachments"])

# CFP Applicant Portal (public + applicant-auth endpoints)
api_router.include_router(cfp_portal.router, tags=["CFP Portal"])

# Public Registration Portal (public endpoints, no auth required)
api_router.include_router(portal.router, tags=["Public Portal"])

# Portal Templates (downloadable CSS templates)
api_router.include_router(portal_templates.router, tags=["Portal Templates"])

# Stripe webhooks (public endpoint, signature verified)
api_router.include_router(stripe_webhooks.router, tags=["Stripe"])
