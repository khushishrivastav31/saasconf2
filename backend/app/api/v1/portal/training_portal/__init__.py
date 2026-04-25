"""Public Training Portal API — no authentication required.

Split from a single ~975-LOC module into domain-cohesive submodules:

    catalog.py       — browse + filters + config + detail (4 read endpoints)
    registration.py  — the big public-registration submit (VAT + invoice + email)
    payments.py      — Stripe PaymentIntent create/update
    _helpers.py      — tenant resolution, placement query builder, serializer
    _texts.py        — default UI strings (en/de)

External surface is unchanged: the aggregated ``router`` and the
``DEFAULT_PORTAL_TEXTS`` constant are the only two names other modules
import. Preserved here so downstream imports keep working.
"""

from __future__ import annotations

from fastapi import APIRouter

from ._texts import DEFAULT_PORTAL_TEXTS
from .catalog import router as _catalog_router
from .payments import router as _payments_router
from .registration import router as _registration_router

router = APIRouter()
router.include_router(_catalog_router)
router.include_router(_registration_router)
router.include_router(_payments_router)

__all__ = ["DEFAULT_PORTAL_TEXTS", "router"]
