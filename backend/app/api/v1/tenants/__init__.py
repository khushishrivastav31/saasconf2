"""Tenant management endpoints (package)."""

from .core import router  # core has root-level routes (GET /, POST /, etc.)
from .logo import router as logo_router
from .modules import router as modules_router
from .super_user import router as super_user_router

# Include sub-routers into the core router (which already has root routes)
router.include_router(modules_router)
router.include_router(super_user_router)
router.include_router(logo_router)
