"""Training user management endpoints — enable/disable, resend invite, reset password, media."""

from fastapi import APIRouter

from .access import router as access_router
from .core import router as core_router
from .media import router as media_router

router = APIRouter()
router.include_router(core_router)
router.include_router(access_router)
router.include_router(media_router)

__all__ = ["router"]
