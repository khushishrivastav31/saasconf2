"""Training management endpoints (package)."""

from .core import router  # core has root-level routes (GET /, POST /)

__all__ = ["router"]
