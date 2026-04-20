"""Dual-write parity: @validates on TrainingAttendee.email + CFPApplicant.email/phone
populates encrypted + hash companions on every write, so new rows don't need a
backfill pass. Precursor to migration 208's plaintext column drop.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import decrypt_pii, hash_email, hash_phone
from app.models.cfp_applicants import CFPApplicant
from app.models.tenant import Tenant
from app.models.training_attendee import TrainingAttendee


async def _make_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="PII Dual-Write Test Tenant",
        slug=f"pii-dw-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest.mark.asyncio
async def test_training_attendee_write_populates_encrypted_and_hash(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)

    att = TrainingAttendee(
        tenant_id=tenant.id,
        first_name="Amy",
        last_name="Zero",
        email="amy@example.com",
    )
    db_session.add(att)
    await db_session.commit()
    await db_session.refresh(att)

    assert att.email_hash == hash_email("amy@example.com")
    assert att.email_encrypted is not None
    assert decrypt_pii(att.email_encrypted) == "amy@example.com"


@pytest.mark.asyncio
async def test_training_attendee_email_update_rewrites_companions(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    att = TrainingAttendee(
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="One",
        email="bob-old@example.com",
    )
    db_session.add(att)
    await db_session.commit()

    att.email = "bob-new@example.com"
    await db_session.commit()
    await db_session.refresh(att)

    assert att.email_hash == hash_email("bob-new@example.com")
    assert decrypt_pii(att.email_encrypted or "") == "bob-new@example.com"


@pytest.mark.asyncio
async def test_cfp_applicant_write_populates_email_companions(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)

    app = CFPApplicant(
        tenant_id=tenant.id,
        first_name="Cara",
        last_name="Two",
        email="cara@example.com",
        password_hash="x",
    )
    db_session.add(app)
    await db_session.commit()
    await db_session.refresh(app)

    assert app.email_hash == hash_email("cara@example.com")
    assert decrypt_pii(app.email_encrypted or "") == "cara@example.com"


@pytest.mark.asyncio
async def test_cfp_applicant_write_populates_phone_companions(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)

    app = CFPApplicant(
        tenant_id=tenant.id,
        first_name="Dave",
        last_name="Three",
        email="dave@example.com",
        phone="+1 (555) 123-4567",
        password_hash="x",
    )
    db_session.add(app)
    await db_session.commit()
    await db_session.refresh(app)

    assert app.phone_hash == hash_phone("+1 (555) 123-4567")
    assert decrypt_pii(app.phone_encrypted or "") == "+1 (555) 123-4567"


@pytest.mark.asyncio
async def test_cfp_applicant_phone_cleared_nulls_companions(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)

    app = CFPApplicant(
        tenant_id=tenant.id,
        first_name="Eve",
        last_name="Four",
        email="eve@example.com",
        phone="+49 30 12345",
        password_hash="x",
    )
    db_session.add(app)
    await db_session.commit()

    app.phone = None
    await db_session.commit()
    await db_session.refresh(app)

    assert app.phone_hash is None
    assert app.phone_encrypted is None


@pytest.mark.asyncio
async def test_query_attendee_by_email_hash(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    db_session.add(
        TrainingAttendee(
            tenant_id=tenant.id,
            first_name="Finn",
            last_name="Five",
            email="finn@example.com",
        )
    )
    await db_session.commit()

    result = await db_session.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.tenant_id == tenant.id,
            TrainingAttendee.email_hash == hash_email("finn@example.com"),
        )
    )
    found = result.scalar_one()
    assert found.email == "finn@example.com"
