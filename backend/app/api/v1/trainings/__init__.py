"""Training management endpoints (package)."""

from .attendees import router as attendees_router
from .certification_bodies import router as certification_bodies_router
from .core import detail_router, router  # core has root-level routes (GET /, POST /)
from .customers import router as customers_router
from .email_settings import router as email_settings_router
from .finance import router as finance_router
from .holidays import router as holidays_router
from .inhouse import router as inhouse_router
from .invoice_operations import router as invoice_operations_router
from .invoice_replace import router as invoice_replace_router
from .invoice_sync import router as invoice_sync_router
from .invoices import router as invoices_router
from .languages import router as languages_router
from .location_types import router as location_types_router
from .offer_attendees import router as offer_attendees_router
from .offer_documents import router as offer_documents_router
from .offer_invoicing import router as offer_invoicing_router
from .offer_templates import router as offer_templates_router
from .offers import router as offers_router
from .policies import router as policies_router
from .portal_settings import router as portal_settings_router
from .program_placements import router as program_placements_router
from .program_publishing import router as program_publishing_router
from .program_trainers import router as program_trainers_router
from .programs import router as programs_router
from .registration_questions import router as registration_questions_router
from .registrations import router as registrations_router
from .syllabi import router as syllabi_router
from .themes import router as themes_router
from .trainers import router as trainers_router

# Include sub-routers BEFORE detail_router so /themes, /languages,
# /certification-bodies, /syllabi, /trainers, /programs are matched before the /{training_id} catch-all.
router.include_router(attendees_router)
router.include_router(themes_router)
router.include_router(languages_router)
router.include_router(certification_bodies_router)
router.include_router(syllabi_router)
router.include_router(trainers_router)
router.include_router(programs_router)
router.include_router(program_publishing_router)
router.include_router(program_placements_router)
router.include_router(program_trainers_router)
router.include_router(holidays_router)
router.include_router(policies_router)
router.include_router(registration_questions_router)
router.include_router(email_settings_router)
router.include_router(finance_router)
router.include_router(customers_router)
router.include_router(inhouse_router)
router.include_router(offers_router)
router.include_router(offer_attendees_router)
router.include_router(offer_documents_router)
router.include_router(offer_invoicing_router)
router.include_router(offer_templates_router)
router.include_router(portal_settings_router)
router.include_router(registrations_router)
router.include_router(invoices_router)
router.include_router(invoice_operations_router)
router.include_router(invoice_replace_router)
router.include_router(invoice_sync_router)
router.include_router(location_types_router)
router.include_router(detail_router)

__all__ = ["router"]
