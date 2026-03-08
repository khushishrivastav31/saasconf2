"""
Public Portal Router

Aggregates all public portal endpoints (no authentication required).
"""

from fastapi import APIRouter

from app.api.v1.portal import css, registration

router = APIRouter(prefix="/portal", tags=["portal"])

# Include sub-routers
router.include_router(registration.router)
router.include_router(css.router)
