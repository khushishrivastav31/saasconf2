"""Conference management endpoints (package)."""

from .core import router  # core has root-level routes (GET /, POST /)
from .associations import router as associations_router
from .exports import router as exports_router
from .logo import router as logo_router
from .service_providers import router as service_providers_router

# Include sub-routers into the core router (which already has root routes)
router.include_router(associations_router)
router.include_router(exports_router)
router.include_router(logo_router)
router.include_router(service_providers_router)
