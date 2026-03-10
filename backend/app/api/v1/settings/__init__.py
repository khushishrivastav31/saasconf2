"""Conference-scoped settings endpoints for volunteer roles, location types, currencies, sponsor packages, booking, and discount codes."""

from fastapi import APIRouter

from .booking_matrix import router as booking_matrix_router
from .booking_options import router as booking_options_router
from .booking_packages import router as booking_packages_router
from .booking_periods import router as booking_periods_router
from .committee_roles import router as committee_roles_router
from .currencies import router as currencies_router
from .discount_codes import router as discount_codes_router
from .email_templates import router as email_templates_router
from .invoice_settings import router as invoice_settings_router
from .location_types import router as location_types_router
from .policies import router as policies_router
from .pronouns import router as pronouns_router
from .registration_questions import router as registration_questions_router
from .review_criteria import router as review_criteria_router
from .review_form_settings import router as review_form_settings_router
from .review_questions import router as review_questions_router
from .score_scales import router as score_scales_router
from .session_types import router as session_types_router
from .sponsor_packages import router as sponsor_packages_router
from .stripe_settings import router as stripe_settings_router
from .volunteer_roles import router as volunteer_roles_router

router = APIRouter()

router.include_router(volunteer_roles_router)
router.include_router(location_types_router)
router.include_router(currencies_router)
router.include_router(sponsor_packages_router)
router.include_router(booking_periods_router)
router.include_router(booking_options_router)
router.include_router(booking_packages_router)
router.include_router(booking_matrix_router)
router.include_router(discount_codes_router)
router.include_router(session_types_router)
router.include_router(committee_roles_router)
router.include_router(score_scales_router)
router.include_router(review_criteria_router)
router.include_router(review_questions_router)
router.include_router(review_form_settings_router)
router.include_router(pronouns_router)
router.include_router(email_templates_router)
router.include_router(invoice_settings_router)
router.include_router(stripe_settings_router)
router.include_router(policies_router)
router.include_router(registration_questions_router)
