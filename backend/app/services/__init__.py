"""Services layer -- encapsulates reusable DB / business logic.

Import the base class and domain services from here::

    from app.services import BaseService
    from app.services.conference import ConferenceService
"""

from app.services.base import BaseService

__all__ = ["BaseService"]
