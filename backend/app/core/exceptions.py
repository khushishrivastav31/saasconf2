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


class ConflictError(SaaSConfException):
    """Raised when a resource conflict occurs (e.g. duplicate assignment)."""

    pass


class InvoiceSendConfigurationError(ValidationError):
    """Raised when an invoice/credit-note send is attempted with incomplete tenant config.

    Today this fires when ``tenants.accounting_email`` is unset: every invoice or credit
    note must CC the accounting address, so the send is refused until an operator
    configures it on *My Company*. Handled as HTTP 422 by the API layer.
    """

    pass


class SubmissionValidationError(SaaSConfException):
    """Raised when paper submission validation fails with structured details."""

    def __init__(
        self,
        message: str,
        missing_fields: list[str] | None = None,
        char_errors: list[str] | None = None,
    ):
        self.missing_fields = missing_fields or []
        self.char_errors = char_errors or []
        super().__init__(
            message,
            details={
                "missing_fields": self.missing_fields,
                "char_errors": self.char_errors,
            },
        )
