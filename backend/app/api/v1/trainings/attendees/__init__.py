"""Training attendees — central identity, parking lot, and history endpoints."""

from fastapi import APIRouter

from ._helpers import get_or_create_central_attendee
from .core import router as core_router
from .parking import router as parking_router
from .profile import router as profile_router
from .reassignment import router as reassignment_router

# Include order matters: routers with literal-path routes
# (`/park-by-source`, `/available-placements`) must be included before
# `core_router` so they win over `GET /{attendee_id}` during path matching.
router = APIRouter()
router.include_router(parking_router)
router.include_router(reassignment_router)
router.include_router(profile_router)
router.include_router(core_router)

__all__ = ["get_or_create_central_attendee", "router"]
