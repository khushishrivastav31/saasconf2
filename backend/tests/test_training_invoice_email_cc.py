"""CC wiring for training invoice emails.

Mirrors ``test_invoice_email_cc.py`` for the separate training-invoice path
at ``app/core/email/trainings.py``. Both paths must refuse to send without
a tenant ``accounting_email`` configured, and both must CC the accounting
address alongside the scope-specific contact email (for trainings, the
Training Company email stored in ``tenant.settings.training_finance``).
"""

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email.trainings import send_training_invoice_email
from app.core.exceptions import InvoiceSendConfigurationError
from app.models.tenant import Tenant
from app.models.training_invoice import TrainingInvoice


@pytest_asyncio.fixture
async def t_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="Training Corp",
        slug=f"training-{uuid.uuid4().hex[:8]}",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def t_invoice(db_session: AsyncSession, t_tenant: Tenant) -> TrainingInvoice:
    inv = TrainingInvoice(
        id=uuid.uuid4(),
        tenant_id=t_tenant.id,
        invoice_number="TR-CC-001",
        template_type="bank_transfer",
        status="draft",
        recipient_name="Acme Training Client",
        recipient_email="client@acme.example.com",
        line_items=[{"description": "Course", "quantity": 1, "unit_price": "500.00", "total": "500.00"}],
        subtotal=Decimal("500.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("95.00"),
        total=Decimal("595.00"),
        currency="EUR",
    )
    db_session.add(inv)
    await db_session.commit()
    await db_session.refresh(inv)
    return inv


def _set_training_company_email(tenant: Tenant, email: str | None) -> None:
    """Mirror how ``finance.py`` stores the Training Company email."""
    settings = dict(tenant.settings or {})
    finance = dict(settings.get("training_finance", {}))
    company = dict(finance.get("company_info", {}))
    if email is None:
        company.pop("email", None)
    else:
        company["email"] = email
    finance["company_info"] = company
    settings["training_finance"] = finance
    tenant.settings = settings


@pytest.mark.asyncio
async def test_training_invoice_cc_includes_accounting_and_scope(
    db_session: AsyncSession,
    t_tenant: Tenant,
    t_invoice: TrainingInvoice,
) -> None:
    """Both tenant accounting_email and Training Company email make the CC list."""
    t_tenant.accounting_email = "finance@example.com"
    _set_training_company_email(t_tenant, "backoffice@example.com")
    await db_session.commit()
    await db_session.refresh(t_tenant)

    captured: dict = {}

    async def fake_send_email(*args: object, **kwargs: object) -> bool:
        captured["cc"] = kwargs.get("cc")
        return True

    with (
        patch("app.core.email.trainings.generate_training_invoice_pdf", AsyncMock(return_value=b"pdf")),
        patch("app.core.email.trainings._get_template", return_value=("Subject", "<p>Body</p>", "Body")),
        patch("app.core.email.trainings.send_email", side_effect=fake_send_email),
    ):
        result = await send_training_invoice_email(db=db_session, invoice=t_invoice, registration=None, tenant=t_tenant)

    assert result is True
    assert captured["cc"] == ["finance@example.com", "backoffice@example.com"]


@pytest.mark.asyncio
async def test_training_invoice_cc_only_accounting_when_company_email_missing(
    db_session: AsyncSession,
    t_tenant: Tenant,
    t_invoice: TrainingInvoice,
) -> None:
    """When the Training Company has no configured email, CC holds only the accounting."""
    t_tenant.accounting_email = "finance@example.com"
    _set_training_company_email(t_tenant, None)
    await db_session.commit()
    await db_session.refresh(t_tenant)

    captured: dict = {}

    async def fake_send_email(*args: object, **kwargs: object) -> bool:
        captured["cc"] = kwargs.get("cc")
        return True

    with (
        patch("app.core.email.trainings.generate_training_invoice_pdf", AsyncMock(return_value=b"pdf")),
        patch("app.core.email.trainings._get_template", return_value=("Subject", "<p>Body</p>", "Body")),
        patch("app.core.email.trainings.send_email", side_effect=fake_send_email),
    ):
        await send_training_invoice_email(db=db_session, invoice=t_invoice, registration=None, tenant=t_tenant)

    assert captured["cc"] == ["finance@example.com"]


@pytest.mark.asyncio
async def test_training_invoice_missing_accounting_email_raises(
    db_session: AsyncSession,
    t_tenant: Tenant,
    t_invoice: TrainingInvoice,
) -> None:
    """Without accounting_email configured, the send raises 422-mapped error."""
    # tenant.accounting_email deliberately unset
    with pytest.raises(InvoiceSendConfigurationError):
        await send_training_invoice_email(db=db_session, invoice=t_invoice, registration=None, tenant=t_tenant)
