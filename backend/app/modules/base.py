"""Base class for pluggable modules."""

from abc import ABC, abstractmethod
from typing import Any

from fastapi import APIRouter


class BaseModule(ABC):
    """
    Base class for all platform modules.

    Each module must implement this interface to be registered
    with the module system.
    """

    @property
    @abstractmethod
    def code(self) -> str:
        """Unique module code (e.g., 'conference', 'attendees')."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable module name."""
        pass

    @property
    def description(self) -> str:
        """Module description."""
        return ""

    @property
    def version(self) -> str:
        """Module version."""
        return "1.0.0"

    @property
    def config_schema(self) -> dict[str, Any]:
        """
        JSON Schema for module configuration.

        This defines what configuration options tenants can customize.
        """
        return {}

    @abstractmethod
    def get_router(self) -> APIRouter:
        """
        Get the FastAPI router for this module's endpoints.

        Returns:
            APIRouter with module-specific endpoints
        """
        pass

    def on_enable(self, tenant_id: str, config: dict[str, Any]) -> None:
        """
        Called when the module is enabled for a tenant.

        Override to perform initialization tasks.
        """

    def on_disable(self, tenant_id: str) -> None:
        """
        Called when the module is disabled for a tenant.

        Override to perform cleanup tasks.
        """
