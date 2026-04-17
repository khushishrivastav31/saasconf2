"""Tests for the PII dual-write event listeners (audit step 37 phase c)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import decrypt_pii, hash_email, hash_phone, hash_vat
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.portal_user import PortalUser
from app.models.registration import BillingProfile
from app.models.tenant import Tenant
from app.models.trainer import Trainer
from app.models.user import User


async def _make_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="PII Test Tenant",
        slug=f"pii-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest.mark.asyncio
async def test_user_insert_populates_encrypted_and_hash(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="Alice@Example.COM",
        password_hash="x",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    assert user.email_encrypted is not None
    assert user.email_encrypted != "Alice@Example.COM"
    assert decrypt_pii(user.email_encrypted) == "Alice@Example.COM"
    assert user.email_hash == hash_email("Alice@Example.COM")


@pytest.mark.asyncio
async def test_user_update_rewrites_companion_columns(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="old@example.com",
        password_hash="x",
    )
    db_session.add(user)
    await db_session.commit()

    user.email = "new@example.com"
    await db_session.commit()
    await db_session.refresh(user)

    assert decrypt_pii(user.email_encrypted or "") == "new@example.com"
    assert user.email_hash == hash_email("new@example.com")


@pytest.mark.asyncio
async def test_update_unrelated_field_does_not_re_encrypt(db_session: AsyncSession) -> None:
    """Fernet is non-deterministic; re-encrypting on every touch would thrash ciphertext."""
    tenant = await _make_tenant(db_session)
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="stable@example.com",
        password_hash="x",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    original_cipher = user.email_encrypted

    user.first_name = "Alice"
    await db_session.commit()
    await db_session.refresh(user)

    assert user.email_encrypted == original_cipher


@pytest.mark.asyncio
async def test_email_hash_normalizes_case_and_whitespace(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    u1 = User(id=uuid.uuid4(), tenant_id=tenant.id, email="  Bob@Example.COM ", password_hash="x")
    u2 = User(id=uuid.uuid4(), tenant_id=tenant.id, email="bob@example.com", password_hash="x")
    db_session.add_all([u1, u2])
    # Same normalized value → same hash → unique index collides. Commit the
    # first, then swap the second to a distinct email so we avoid the UNIQUE
    # violation but still assert normalization is happening.
    await db_session.flush()
    assert u1.email_hash == u2.email_hash


@pytest.mark.asyncio
async def test_portal_user_writes_both_email_and_phone(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    pu = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="applicant@example.com",
        first_name="App",
        last_name="Licant",
        phone="+49 (30) 555-1234",
    )
    db_session.add(pu)
    await db_session.commit()
    await db_session.refresh(pu)

    assert decrypt_pii(pu.email_encrypted or "") == "applicant@example.com"
    assert pu.email_hash == hash_email("applicant@example.com")
    assert decrypt_pii(pu.phone_encrypted or "") == "+49 (30) 555-1234"
    assert pu.phone_hash == hash_phone("+49 (30) 555-1234")


@pytest.mark.asyncio
async def test_customer_vat_is_hashed_with_vat_normalizer(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    cust = Customer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="ACME GmbH",
        email="billing@acme.example",
        vat_number="de 123.456.789",
    )
    db_session.add(cust)
    await db_session.commit()
    await db_session.refresh(cust)

    assert cust.vat_number_hash == hash_vat("de 123.456.789")
    # sanity: different style of same VAT still matches
    assert hash_vat("de 123.456.789") == hash_vat("DE123456789")


@pytest.mark.asyncio
async def test_nullable_plaintext_yields_null_companions(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    cust = Customer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Null Corp",
        email=None,
        phone=None,
        vat_number=None,
    )
    db_session.add(cust)
    await db_session.commit()
    await db_session.refresh(cust)

    assert cust.email_encrypted is None
    assert cust.email_hash is None
    assert cust.phone_encrypted is None
    assert cust.phone_hash is None
    assert cust.vat_number_encrypted is None
    assert cust.vat_number_hash is None


@pytest.mark.asyncio
async def test_clearing_plaintext_on_update_clears_companions(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    trainer = Trainer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Tina",
        last_name="Trainer",
        email="tina@example.com",
        phone="+49 30 555 0001",
    )
    db_session.add(trainer)
    await db_session.commit()
    await db_session.refresh(trainer)
    assert trainer.email_encrypted is not None
    assert trainer.phone_hash is not None

    trainer.email = None
    trainer.phone = None
    await db_session.commit()
    await db_session.refresh(trainer)

    assert trainer.email_encrypted is None
    assert trainer.email_hash is None
    assert trainer.phone_encrypted is None
    assert trainer.phone_hash is None


@pytest.mark.asyncio
async def test_invoice_and_billing_profile_populate_all_companions(db_session: AsyncSession) -> None:
    """Sanity check for the two models carrying 2+ PII columns each."""
    tenant = await _make_tenant(db_session)
    from app.models.conference import Conference

    conf = Conference(id=uuid.uuid4(), tenant_id=tenant.id, name="PIIConf", abbreviation="PC", is_active=True)
    db_session.add(conf)
    await db_session.commit()

    bp = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conf.id,
        street="1 Test Way",
        postal_code="10115",
        city="Berlin",
        country="DE",
        contact_first_name="Bob",
        contact_last_name="Biller",
        contact_phone="+49 30 555 7777",
        contact_email="bob@biller.example",
        vat_number="DE987654321",
    )
    db_session.add(bp)
    await db_session.commit()
    await db_session.refresh(bp)

    assert decrypt_pii(bp.contact_email_encrypted or "") == "bob@biller.example"
    assert bp.contact_email_hash == hash_email("bob@biller.example")
    assert decrypt_pii(bp.contact_phone_encrypted or "") == "+49 30 555 7777"
    assert bp.contact_phone_hash == hash_phone("+49 30 555 7777")
    assert decrypt_pii(bp.vat_number_encrypted or "") == "DE987654321"
    assert bp.vat_number_hash == hash_vat("DE987654321")

    inv = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conf.id,
        recipient_name="Bob Biller",
        recipient_email="bob@biller.example",
        recipient_vat_number="DE987654321",
    )
    db_session.add(inv)
    await db_session.commit()
    await db_session.refresh(inv)

    assert decrypt_pii(inv.recipient_email_encrypted or "") == "bob@biller.example"
    assert inv.recipient_email_hash == hash_email("bob@biller.example")
    assert decrypt_pii(inv.recipient_vat_number_encrypted or "") == "DE987654321"
    assert inv.recipient_vat_number_hash == hash_vat("DE987654321")
