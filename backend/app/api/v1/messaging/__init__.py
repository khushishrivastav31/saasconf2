"""Admin messaging sub-package."""

from fastapi import APIRouter

from .attachments import router as attachments_router
from .threads import router as threads_router
from .bulk import router as bulk_router

router = APIRouter()
router.include_router(attachments_router)
router.include_router(threads_router)
router.include_router(bulk_router)
