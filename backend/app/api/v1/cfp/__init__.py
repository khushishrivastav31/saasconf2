"""Call for Papers management endpoints (package)."""

from fastapi import APIRouter

from .applicants import router as applicants_router
from .committee import router as committee_router
from .papers import router as papers_router
from .topics import router as topics_router

router = APIRouter()

# NOTE: papers_router and applicants_router must be included BEFORE
# topics_router because topics_router contains /{cfp_id} catch-all routes
# that would shadow /papers, /applicants, /committee-members, etc.
router.include_router(committee_router)
router.include_router(applicants_router)
router.include_router(papers_router)
router.include_router(topics_router)
