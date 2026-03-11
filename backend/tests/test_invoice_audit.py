"""Tests for app/core/invoice_audit.py — audit log creation helpers."""

from unittest.mock import MagicMock
from uuid import uuid4

from app.core.invoice_audit import create_bulk_invoice_audit_logs, create_invoice_audit_log


def _mock_invoice(invoice_number="INV-001"):
    inv = MagicMock()
    inv.id = uuid4()
    inv.invoice_number = invoice_number
    inv.tenant_id = uuid4()
    return inv


def _mock_request(ip="1.2.3.4", user_agent="TestAgent"):
    """Create a mock Request with X-Forwarded-For and User-Agent headers."""
    req = MagicMock()
    req.client.host = ip
    # get_client_ip checks X-Forwarded-For first, then request.client.host.
    # We set headers as a real-ish dict so both .get() calls work.
    req.headers = {"User-Agent": user_agent}
    return req


class TestCreateInvoiceAuditLog:
    def test_create_audit_log_basic_fields(self):
        """Returned AuditLog has the correct tenant_id, user_id, action, and resource_type."""
        tenant_id = uuid4()
        user_id = uuid4()
        invoice = _mock_invoice()
        log = create_invoice_audit_log(
            tenant_id=tenant_id,
            user_id=user_id,
            action="invoice.sent",
            invoice=invoice,
            details={"note": "sent via email"},
        )
        assert log.tenant_id == tenant_id
        assert log.user_id == user_id
        assert log.action == "invoice.sent"
        assert log.resource_type == "invoice"
        assert log.resource_id == invoice.id

    def test_create_audit_log_includes_invoice_number(self):
        """The details dict contains the invoice_number from the invoice."""
        invoice = _mock_invoice(invoice_number="INV-2026-042")
        log = create_invoice_audit_log(
            tenant_id=uuid4(),
            user_id=uuid4(),
            action="invoice.created",
            invoice=invoice,
            details={},
        )
        assert log.details["invoice_number"] == "INV-2026-042"

    def test_create_audit_log_with_request_captures_ip_and_ua(self):
        """When a request is provided, ip_address and user_agent are captured."""
        request = _mock_request(ip="10.0.0.1", user_agent="Mozilla/5.0")
        invoice = _mock_invoice()
        log = create_invoice_audit_log(
            tenant_id=uuid4(),
            user_id=uuid4(),
            action="invoice.cancelled",
            invoice=invoice,
            details={},
            request=request,
        )
        # get_client_ip reads X-Forwarded-For first; our mock doesn't set it,
        # so it falls back to request.client.host
        assert log.ip_address == "10.0.0.1"
        assert log.user_agent == "Mozilla/5.0"

    def test_create_audit_log_without_request(self):
        """When request is None, ip_address and user_agent are None."""
        invoice = _mock_invoice()
        log = create_invoice_audit_log(
            tenant_id=uuid4(),
            user_id=uuid4(),
            action="invoice.updated",
            invoice=invoice,
            details={},
            request=None,
        )
        assert log.ip_address is None
        assert log.user_agent is None


class TestCreateBulkInvoiceAuditLogs:
    def test_create_bulk_logs_returns_correct_count(self):
        """Number of returned AuditLog objects matches input list length."""
        logs_input = [
            {"action": "invoice.cancelled", "resource_id": uuid4(), "details": {"reason": "replacement"}},
            {"action": "invoice.credit_note_created", "resource_id": uuid4(), "details": {}},
            {"action": "invoice.replacement_created", "resource_id": uuid4(), "details": {}},
        ]
        result = create_bulk_invoice_audit_logs(
            tenant_id=uuid4(),
            user_id=uuid4(),
            logs=logs_input,
        )
        assert len(result) == 3

    def test_create_bulk_logs_each_has_correct_action(self):
        """Each AuditLog in the list has the action from the corresponding input dict."""
        actions = ["invoice.cancelled", "invoice.replacement_created"]
        logs_input = [
            {"action": a, "resource_id": uuid4(), "details": {}}
            for a in actions
        ]
        result = create_bulk_invoice_audit_logs(
            tenant_id=uuid4(),
            user_id=uuid4(),
            logs=logs_input,
        )
        for audit_log, expected_action in zip(result, actions, strict=True):
            assert audit_log.action == expected_action
            assert audit_log.resource_type == "invoice"
