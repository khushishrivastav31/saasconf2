"""CFP Applicant Portal — paper endpoints.

Split from a single ~895-LOC module into:

    authored.py  — list / get / create / update / submit / unsubmit / delete
                   for papers the applicant owns (or accepted as co-speaker)
    assigned.py  — list / pending-count / get for papers the applicant is
                   reviewing as a committee member (anonymity-aware)
    _helpers.py  — auth helpers, response builders, co-speaker sync

External surface preserved:
    - ``router`` (aggregated) — mounted in ``cfp_portal/__init__.py``
    - ``_get_applicant_or_cospeaker_paper`` — imported by ``reviews.py``
      and ``attachments.py`` to share the portal's access-control rules.
"""

from __future__ import annotations

from fastapi import APIRouter

from ._helpers import _get_applicant_or_cospeaker_paper
from .assigned import router as _assigned_router
from .authored import router as _authored_router

router = APIRouter()
router.include_router(_authored_router)
router.include_router(_assigned_router)

__all__ = ["_get_applicant_or_cospeaker_paper", "router"]
