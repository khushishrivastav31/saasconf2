"""Tests for parking-lot reassignment edge cases.

The happy path (parked → reassigned with full history) is covered in
``test_training_invoice_no_refund.py``. This file focuses on edge cases
that broke in production — e.g. parked attendees whose park history is
missing or unrecoverable (source_id points nowhere), where the old
registration cannot be located.

Historical bug (2026-04-17): when ``find_old_registration`` returned
None, ``create_new_registration`` passed ``None`` for ``street`` /
``postal_code`` / ``city`` / ``country``, which are NOT NULL on
``training_registrations`` — the request 500'd with a
``NotNullViolationError``. The fix makes those fields fall back to the
empty string so the admin can fill them in after reassignment.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration
from app.models.user import User
from tests.conftest import _make_token, auth_headers

BASE = "/api/v1/trainings"


@pytest_asyncio.fixture()
async def parked_without_history(
    db_session: AsyncSession, tenant: Tenant, tenant_admin_user: User
) -> dict:
    """A parked attendee with no recoverable park history + a target placement."""
    db = db_session

    m = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="", is_active=True)
    db.add(m)
    await db.flush()
    db.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db.flush()

    training = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Orphan Training",
        slug=f"orphan-training-{uuid.uuid4().hex[:6]}",
        regular_price=Decimal("500.00"),
    )
    db.add(training)
    await db.flush()

    year = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant.id, year=2026)
    db.add(year)
    await db.flush()

    placement = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=year.id,
        training_id=training.id,
        start_date=date(2026, 10, 1),
        placement_type="open",
    )
    db.add(placement)
    await db.flush()

    # Parked central attendee with NO history rows — simulates attendees
    # parked before park-history tracking existed, or corrupted history.
    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Orphan",
        last_name="Attendee",
        email="orphan@test.com",
        status="parked",
    )
    db.add(att)
    await db.commit()
    await db.close()

    token = _make_token(tenant_admin_user, modules=["trainings"])
    return {"attendee": att, "placement": placement, "tenant": tenant, "token": token}


@pytest.mark.asyncio
async def test_reassign_parked_attendee_without_park_history(
    client: AsyncClient,
    parked_without_history: dict,
    db_session: AsyncSession,
) -> None:
    """Reassigning a parked attendee with no recoverable park history must not 500.

    Regression guard for the NotNullViolationError on
    ``training_registrations.street`` that occurred when
    ``old_registration`` was None.
    """
    data = parked_without_history

    with patch(
        "app.core.training_registration_emails.send_training_invoice_email",
        new_callable=AsyncMock,
    ):
        response = await client.post(
            f"{BASE}/attendees/{data['attendee'].id}/reassign",
            json={"placement_id": str(data["placement"].id)},
            headers=auth_headers(data["token"]),
        )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "active"

    new_reg_id = uuid.UUID(result["new_registration_id"])
    new_reg = (
        await db_session.execute(select(TrainingRegistration).where(TrainingRegistration.id == new_reg_id))
    ).scalar_one()

    # NOT NULL columns must be populated (empty string is fine — admin fills in later).
    assert new_reg.street is not None
    assert new_reg.postal_code is not None
    assert new_reg.city is not None
    assert new_reg.country is not None
    # Contact info falls back to the attendee's own details.
    assert new_reg.contact_first_name == "Orphan"
    assert new_reg.contact_last_name == "Attendee"
    assert new_reg.contact_email == "orphan@test.com"
