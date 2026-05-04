"""Side-effect import: registers SQLAlchemy event listeners.

Each module in this package decorates listeners at import time. The
listeners need to be loaded ONCE before any session opens — importing
this package from ``app.db.session`` (or app startup) is enough.
"""

from app.db.listeners import originating_ip_retention  # noqa: F401
