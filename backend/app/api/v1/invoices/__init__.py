"""Invoice API endpoints - modular organization.

This module combines routers from:
- crud.py - CRUD operations (list, create, get, update, delete)
- operations.py - Business operations (send, cancel, replace, mark paid, reopen, convert)
- stripe.py - Stripe integration (refund, sync payments, debug)
- pdf.py - PDF operations (download, preview, validate ZUGFeRD)

All routers use conference-scoped paths (/conferences/{conference_id}/invoices/...)

Note: Individual routes have `require_module("invoices")` dependencies.
The routes.extend() pattern is used to avoid FastAPI prefix/path conflicts.
"""

from fastapi import APIRouter

# Create main router
router = APIRouter()

# Import route modules and extend with their routes
# Using routes.extend() pattern to avoid prefix/path conflicts
# Each sub-router already has module dependencies on individual routes
from . import crud, operations, pdf, stripe  # noqa: E402

# Order matters: more specific routes before general ones
router.routes.extend(operations.router.routes)
router.routes.extend(stripe.router.routes)
router.routes.extend(pdf.router.routes)
router.routes.extend(crud.router.routes)

__all__ = ["router"]
