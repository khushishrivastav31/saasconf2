"""Analytics endpoints: revenue tracking, financial reporting, and statistics."""

from fastapi import APIRouter

from .attendance import router as attendance_router
from .exports import router as exports_router
from .revenue import router as revenue_router
from .tutorials import router as tutorials_router

router = APIRouter()
router.include_router(revenue_router)
router.include_router(exports_router)
router.include_router(attendance_router)
router.include_router(tutorials_router)
