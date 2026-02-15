"""Program design endpoints (conference-scoped).

Endpoints for managing conference program design:
- Days: Conference days
- Time Slots: Time slots per day
- Tracks: Parallel session columns
- Sessions: Sessions placed in the grid
- Grid: Combined view for rendering
"""

from fastapi import APIRouter

from .days import router as days_router
from .grid import router as grid_router
from .publish import router as publish_router
from .sessions import router as sessions_router
from .slots import router as slots_router
from .tracks import router as tracks_router

router = APIRouter()
router.include_router(days_router)
router.include_router(slots_router)
router.include_router(tracks_router)
router.include_router(sessions_router)
router.include_router(grid_router)
router.include_router(publish_router)
