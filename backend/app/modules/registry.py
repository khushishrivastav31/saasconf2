"""Module registry for managing pluggable modules."""

from typing import Dict, Type

from fastapi import FastAPI

from app.modules.base import BaseModule


class ModuleRegistry:
    """
    Registry for managing platform modules.

    Modules can be registered and their routers will be included
    in the FastAPI application.
    """

    _modules: Dict[str, BaseModule] = {}
    _initialized: bool = False

    @classmethod
    def register(cls, module_class: Type[BaseModule]) -> None:
        """
        Register a module with the registry.

        Args:
            module_class: The module class to register
        """
        module = module_class()
        if module.code in cls._modules:
            raise ValueError(f"Module with code '{module.code}' is already registered")

        cls._modules[module.code] = module
        print(f"Registered module: {module.code} ({module.name})")

    @classmethod
    def get_module(cls, code: str) -> BaseModule | None:
        """
        Get a module by its code.

        Args:
            code: The module code

        Returns:
            The module instance or None if not found
        """
        return cls._modules.get(code)

    @classmethod
    def get_all_modules(cls) -> Dict[str, BaseModule]:
        """Get all registered modules."""
        return cls._modules.copy()

    @classmethod
    def include_routers(cls, app: FastAPI, prefix: str = "/api/v1/modules") -> None:
        """
        Include all module routers in the FastAPI app.

        Args:
            app: FastAPI application
            prefix: URL prefix for module endpoints
        """
        if cls._initialized:
            return

        for code, module in cls._modules.items():
            router = module.get_router()
            app.include_router(
                router,
                prefix=f"{prefix}/{code}",
                tags=[f"Module: {module.name}"],
            )
            print(f"Included router for module: {code}")

        cls._initialized = True

    @classmethod
    def reset(cls) -> None:
        """Reset the registry (useful for testing)."""
        cls._modules = {}
        cls._initialized = False
