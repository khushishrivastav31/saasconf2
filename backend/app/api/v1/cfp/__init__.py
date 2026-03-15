"""Call for Papers management endpoints (package)."""

from fastapi import APIRouter

from .applicants import router as applicants_router
from .cfp_crud import router as cfp_crud_router
from .committee import router as committee_router
from .paper_assignments import router as paper_assignments_router
from .paper_cospeakers import router as paper_cospeakers_router
from .paper_reviews import router as paper_reviews_router
from .papers import router as papers_router
from .pending_verifications import router as pending_verifications_router
from .submissions import router as submissions_router
from .topics import router as topics_router

router = APIRouter()

# NOTE: Routers with literal path segments (/committee-members, /applicants,
# /paper-assignments, /papers, /topics) must be included BEFORE routers that
# use /{cfp_id} catch-all path parameters (cfp_crud_router, submissions_router)
# to prevent the catch-all from shadowing them.
# Within the papers group, paper_assignments_router and paper_cospeakers_router
# must come BEFORE papers_router because paper_cospeakers_router contains the
# literal /papers/my-invitations path that would be shadowed by /papers/{paper_id}.
router.include_router(committee_router)
router.include_router(pending_verifications_router)
router.include_router(applicants_router)
router.include_router(paper_assignments_router)
router.include_router(paper_cospeakers_router)
router.include_router(paper_reviews_router)
router.include_router(papers_router)
router.include_router(topics_router)
router.include_router(cfp_crud_router)
router.include_router(submissions_router)
