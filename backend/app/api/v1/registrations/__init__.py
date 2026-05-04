"""Registration management endpoints (package)."""

from fastapi import APIRouter, Depends

from app.core.dependencies import require_module

# Import all endpoints to register them
from .billing import get_billing_profile, update_billing_profile  # noqa: F401
from .core import (  # noqa: F401
    create_registration,
    delete_registration,
    get_bookable_sessions,
    get_booking_history_by_email,
    get_registration,
    list_registrations,
    update_registration,
    validate_vat,
)
from .items import add_registration_item, remove_registration_item  # noqa: F401

MODULE_CODE = "registration"

router = APIRouter(dependencies=[Depends(require_module(MODULE_CODE))])

# Import route functions and register them on the main router
from . import billing, bulk_cancel, core, items  # noqa: E402

router.routes.extend(billing.router.routes)
router.routes.extend(items.router.routes)
router.routes.extend(core.router.routes)
# Bulk-cancel sits at /bulk-cancel/preview + /bulk-cancel/confirm — kept
# in its own module so the file stays focused on the bulk flow + its tests.
router.routes.extend(bulk_cancel.router.routes)
