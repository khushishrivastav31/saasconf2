"""Pluggable modules system."""

from app.modules.base import BaseModule
from app.modules.registry import ModuleRegistry

__all__ = ["BaseModule", "ModuleRegistry"]
