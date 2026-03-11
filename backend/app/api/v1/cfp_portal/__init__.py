"""CFP Applicant Portal API package."""

from fastapi import APIRouter

from .auth import router as auth_router
from .currencies import router as currencies_router
from .form_schema import router as form_schema_router
from .invoices import router as invoices_router
from .messaging import router as messaging_router
from .my_registrations import router as my_registrations_router
from .news import router as news_router
from .papers import router as papers_router
from .registration import router as registration_router
from .registration_questions import router as registration_questions_router
from .reviews import router as reviews_router
from .screen_overlays import router as screen_overlays_router
from .speaker_expenses import router as speaker_expenses_router

router = APIRouter()
# papers, reviews, messaging, and form_schema must be included before auth because
# auth contains the catch-all landing page route /portal/{tenant_slug}/{abbreviation}
# which would otherwise match paths like /portal/papers/{id} or /portal/messages/{id}.
router.include_router(papers_router)
router.include_router(reviews_router)
router.include_router(messaging_router)
router.include_router(news_router)
router.include_router(screen_overlays_router)
router.include_router(invoices_router)
router.include_router(speaker_expenses_router)
router.include_router(currencies_router)
router.include_router(my_registrations_router)
router.include_router(registration_router)
router.include_router(registration_questions_router)
router.include_router(form_schema_router)
router.include_router(auth_router)
