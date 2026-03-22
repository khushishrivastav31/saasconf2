"""Registration management endpoints (package)."""

from fastapi import APIRouter, Depends

from app.core.dependencies import require_module

# Import all endpoints to register them
from .billing import get_billing_profile, update_billing_profile  # noqa: F401
from .core import (  # noqa: F401
    create_registration,
    delete_registration,
    get_bookable_sessions,
    get_registration,
    list_registrations,
    update_registration,
    validate_vat,
)
from .deprecated import (  # noqa: F401
    create_bulk_registration,
    create_company_registration,
    create_individual_registration,
)
from .items import add_registration_item, remove_registration_item  # noqa: F401

MODULE_CODE = "registration"

router = APIRouter(dependencies=[Depends(require_module(MODULE_CODE))])

# Import route functions and register them on the main router
from . import billing, core, deprecated, items  # noqa: E402

router.routes.extend(billing.router.routes)
router.routes.extend(items.router.routes)
router.routes.extend(core.router.routes)
router.routes.extend(deprecated.router.routes)
