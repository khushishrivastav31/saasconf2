"""Pluggable modules system."""

from app.modules.registry import ModuleRegistry
from app.modules.base import BaseModule

__all__ = ["ModuleRegistry", "BaseModule"]
