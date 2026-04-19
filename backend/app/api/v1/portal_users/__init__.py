"""Tenant-level portal user admin endpoints.

Mounted at ``/api/v1/portal-users``. Provides the unified admin page at
MyCompany → Users — list, detail, profile update, the 5 admin actions
(toggle-access, resend-invite, reset-password, impersonate, merge), and a
per-user history timeline.
"""

from fastapi import APIRouter

from .access import router as access_router
from .history import router as history_router
from .listing import router as listing_router

router = APIRouter()
router.include_router(listing_router)
router.include_router(access_router)
router.include_router(history_router)

__all__ = ["router"]
