"""Admin messaging sub-package."""

from fastapi import APIRouter

from .attachments import router as attachments_router
from .bulk import router as bulk_router
from .recipient_lists import router as recipient_lists_router
from .templates import router as templates_router
from .threads import router as threads_router

router = APIRouter()
router.include_router(attachments_router)
router.include_router(threads_router)
router.include_router(bulk_router)
router.include_router(templates_router)
router.include_router(recipient_lists_router)
