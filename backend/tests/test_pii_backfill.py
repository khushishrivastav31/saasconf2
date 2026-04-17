"""Tests for the PII backfill script (audit step 37 phase d)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import decrypt_pii, hash_email, hash_phone, hash_vat
from app.models.customer import Customer
from app.models.tenant import Tenant
from app.models.user import User
from scripts.backfill_pii_encryption import backfill_column


async def _make_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="Backfill Test Tenant",
        slug=f"backfill-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


async def _insert_raw_user(db_session: AsyncSession, tenant_id: uuid.UUID, email: str) -> uuid.UUID:
    """Insert a user row with NULL companions (bypasses the dual-write listener)."""
    user_id = uuid.uuid4()
    await db_session.execute(
        text(
            "INSERT INTO users "
            "(id, tenant_id, email, password_hash, role, is_active, "
            "email_encrypted, email_hash, has_all_conference_access) "
            "VALUES (:id, :tid, :email, 'x', 'user', true, NULL, NULL, true)"
        ),
        {"id": user_id, "tid": tenant_id, "email": email},
    )
    await db_session.commit()
    return user_id


async def _insert_raw_customer(
    db_session: AsyncSession,
    tenant_id: uuid.UUID,
    name: str,
    email: str | None,
    phone: str | None,
    vat: str | None,
) -> uuid.UUID:
    cust_id = uuid.uuid4()
    await db_session.execute(
        text(
            "INSERT INTO customers "
            "(id, tenant_id, name, email, phone, vat_number, "
            "email_encrypted, email_hash, phone_encrypted, phone_hash, "
            "vat_number_encrypted, vat_number_hash, is_active) "
            "VALUES (:id, :tid, :name, :email, :phone, :vat, "
            "NULL, NULL, NULL, NULL, NULL, NULL, true)"
        ),
        {"id": cust_id, "tid": tenant_id, "name": name, "email": email, "phone": phone, "vat": vat},
    )
    await db_session.commit()
    return cust_id


@pytest.mark.asyncio
async def test_backfill_populates_missing_companions(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    await _insert_raw_user(db_session, tenant.id, "legacy@example.com")

    written = await backfill_column(
        db_session, "users", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    assert written == 1

    row = (
        await db_session.execute(
            text("SELECT email_encrypted, email_hash FROM users WHERE email = :e"),
            {"e": "legacy@example.com"},
        )
    ).one()
    enc, hashed = row
    assert enc is not None
    assert decrypt_pii(enc) == "legacy@example.com"
    assert hashed == hash_email("legacy@example.com")


@pytest.mark.asyncio
async def test_backfill_is_idempotent(db_session: AsyncSession) -> None:
    """Rows that already have companions (ORM-written) must not be re-encrypted."""
    tenant = await _make_tenant(db_session)
    user = User(id=uuid.uuid4(), tenant_id=tenant.id, email="already@example.com", password_hash="x")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    original_cipher = user.email_encrypted

    written = await backfill_column(
        db_session, "users", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    assert written == 0

    await db_session.refresh(user)
    assert user.email_encrypted == original_cipher


@pytest.mark.asyncio
async def test_backfill_dry_run_writes_nothing(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    await _insert_raw_user(db_session, tenant.id, "dryrun@example.com")

    written = await backfill_column(db_session, "users", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=True)
    assert written == 0

    enc, hashed = (
        await db_session.execute(
            text("SELECT email_encrypted, email_hash FROM users WHERE email = :e"),
            {"e": "dryrun@example.com"},
        )
    ).one()
    assert enc is None
    assert hashed is None


@pytest.mark.asyncio
async def test_backfill_handles_phone_and_vat_kinds(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    cust_id = await _insert_raw_customer(
        db_session,
        tenant.id,
        "Legacy GmbH",
        email="legacy@acme.example",
        phone="+49 (30) 555-0001",
        vat="de 111 222 333",
    )

    for col, kind in (("email", "email"), ("phone", "phone"), ("vat_number", "vat")):
        written = await backfill_column(
            db_session,
            "customers",
            col,
            kind,  # type: ignore[arg-type]
            batch_size=100,
            sleep_secs=0.0,
            dry_run=False,
        )
        assert written == 1

    from sqlalchemy import select

    reloaded = (await db_session.execute(select(Customer).where(Customer.id == cust_id))).scalar_one()
    assert reloaded.email_hash == hash_email("legacy@acme.example")
    assert reloaded.phone_hash == hash_phone("+49 (30) 555-0001")
    assert reloaded.vat_number_hash == hash_vat("de 111 222 333")
    assert decrypt_pii(reloaded.email_encrypted or "") == "legacy@acme.example"
    assert decrypt_pii(reloaded.phone_encrypted or "") == "+49 (30) 555-0001"
    assert decrypt_pii(reloaded.vat_number_encrypted or "") == "de 111 222 333"


@pytest.mark.asyncio
async def test_backfill_respects_batch_size(db_session: AsyncSession) -> None:
    """With batch_size=1, N rows → N batches, all filled."""
    tenant = await _make_tenant(db_session)
    for i in range(3):
        await _insert_raw_user(db_session, tenant.id, f"batched{i}@example.com")

    written = await backfill_column(db_session, "users", "email", "email", batch_size=1, sleep_secs=0.0, dry_run=False)
    assert written == 3

    row = (
        await db_session.execute(
            text(
                "SELECT COUNT(*) FROM users "
                "WHERE email LIKE 'batched%' AND email_encrypted IS NOT NULL AND email_hash IS NOT NULL"
            )
        )
    ).scalar_one()
    assert row == 3


@pytest.mark.asyncio
async def test_backfill_skips_rows_with_null_plaintext(db_session: AsyncSession) -> None:
    """Rows where the plaintext column itself is NULL must not be touched."""
    tenant = await _make_tenant(db_session)
    await _insert_raw_customer(db_session, tenant.id, "No Email Corp", email=None, phone=None, vat=None)

    written = await backfill_column(
        db_session, "customers", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    assert written == 0
