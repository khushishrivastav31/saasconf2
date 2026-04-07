"""
Public Portal Router

Aggregates all public portal endpoints (no authentication required).
"""

from fastapi import APIRouter

from app.api.v1.portal import checkout_validation, css, payment_handling, registration, training_portal

router = APIRouter(prefix="/portal", tags=["portal"])

# Include sub-routers
router.include_router(registration.router)
router.include_router(checkout_validation.router)
router.include_router(payment_handling.router)
router.include_router(css.router)
router.include_router(training_portal.router)
