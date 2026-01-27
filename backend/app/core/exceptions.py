"""Custom exceptions for the application."""

from typing import Any


class SaaSConfException(Exception):
    """Base exception for the application."""

    def __init__(self, message: str, details: Any = None):
        self.message = message
        self.details = details
        super().__init__(self.message)


class AuthenticationError(SaaSConfException):
    """Raised when authentication fails."""

    pass


class AuthorizationError(SaaSConfException):
    """Raised when user lacks permission for an action."""

    pass


class NotFoundError(SaaSConfException):
    """Raised when a resource is not found."""

    pass


class ValidationError(SaaSConfException):
    """Raised when validation fails."""

    pass


class TenantNotFoundError(NotFoundError):
    """Raised when a tenant is not found."""

    pass


class UserNotFoundError(NotFoundError):
    """Raised when a user is not found."""

    pass


class ModuleNotFoundError(NotFoundError):
    """Raised when a module is not found."""

    pass


class ModuleNotAssignedError(AuthorizationError):
    """Raised when a tenant tries to access an unassigned module."""

    pass
