"""Portal messaging endpoints (package).

Originally a single ``messaging.py`` file. Split into routes-by-concern in
PR 2a so each module fits the project's 400-LOC ceiling. Pure mechanical
move — behavior is unchanged. ``cfp_portal/__init__.py`` keeps importing
``router`` from here exactly as before.

Sub-router include order matters: FastAPI picks the first match, so the
attachment-download path (``/portal/messages/attachments/{id}/download``)
and the unread-count path (``/portal/messages/unread-count``) must be
registered BEFORE the catch-all ``/portal/messages/{thread_id}`` GET in
``threads_detail`` — otherwise ``attachments`` and ``unread-count`` get
consumed as ``thread_id``.
"""

from fastapi import APIRouter

from .attachments import router as attachments_router
from .threads_detail import router as threads_detail_router
from .threads_list import router as threads_list_router

router = APIRouter()

# Specific paths first.
router.include_router(attachments_router)
# ``threads_list`` carries the static ``/portal/messages/unread-count``
# route, which must beat the dynamic ``/portal/messages/{thread_id}``
# in ``threads_detail``.
router.include_router(threads_list_router)
router.include_router(threads_detail_router)

__all__ = ["router"]
