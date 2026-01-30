"""CFP Applicant Portal API package."""

from fastapi import APIRouter

from .auth import router as auth_router
from .papers import router as papers_router
from .reviews import router as reviews_router

router = APIRouter()
# papers and reviews must be included before auth because auth contains
# the catch-all landing page route /portal/{tenant_slug}/{abbreviation}
# which would otherwise match paths like /portal/papers/{id}.
router.include_router(papers_router)
router.include_router(reviews_router)
router.include_router(auth_router)
