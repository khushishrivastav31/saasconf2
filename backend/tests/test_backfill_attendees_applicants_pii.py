"""Tests for the training_attendees + cfp_applicants PII backfill script."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import decrypt_pii, hash_email, hash_phone
from app.models.tenant import Tenant
from app.models.training_attendee import TrainingAttendee
from scripts.backfill_attendees_applicants_pii import backfill_column


async def _make_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="PII Backfill Test Tenant",
        slug=f"pii-ext-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


async def _insert_raw_attendee(db_session: AsyncSession, tenant_id: uuid.UUID, email: str) -> uuid.UUID:
    """Insert attendee with NULL email_encrypted (simulates a pre-migration row)."""
    attendee_id = uuid.uuid4()
    await db_session.execute(
        text(
            "INSERT INTO training_attendees "
            "(id, tenant_id, first_name, last_name, email, email_encrypted, email_hash, status) "
            "VALUES (:id, :tid, 'F', 'L', :email, NULL, NULL, 'active')"
        ),
        {"id": attendee_id, "tid": tenant_id, "email": email},
    )
    await db_session.commit()
    return attendee_id


async def _insert_raw_applicant(
    db_session: AsyncSession,
    tenant_id: uuid.UUID,
    email: str,
    phone: str | None,
) -> uuid.UUID:
    applicant_id = uuid.uuid4()
    await db_session.execute(
        text(
            "INSERT INTO cfp_applicants "
            "(id, tenant_id, first_name, last_name, email, email_encrypted, email_hash, "
            " phone, phone_encrypted, phone_hash, password_hash) "
            "VALUES (:id, :tid, 'F', 'L', :email, NULL, NULL, :phone, NULL, NULL, 'x')"
        ),
        {"id": applicant_id, "tid": tenant_id, "email": email, "phone": phone},
    )
    await db_session.commit()
    return applicant_id


@pytest.mark.asyncio
async def test_backfill_populates_attendee_email(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    await _insert_raw_attendee(db_session, tenant.id, "legacy@example.com")

    written = await backfill_column(
        db_session, "training_attendees", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    assert written == 1

    enc, hashed = (
        await db_session.execute(
            text("SELECT email_encrypted, email_hash FROM training_attendees WHERE email = :e"),
            {"e": "legacy@example.com"},
        )
    ).one()
    assert enc is not None
    assert decrypt_pii(enc) == "legacy@example.com"
    assert hashed == hash_email("legacy@example.com")


@pytest.mark.asyncio
async def test_backfill_populates_applicant_email_and_phone(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    await _insert_raw_applicant(db_session, tenant.id, "speaker@example.com", "+49 30 555-0099")

    for col, kind in (("email", "email"), ("phone", "phone")):
        written = await backfill_column(
            db_session,
            "cfp_applicants",
            col,
            kind,  # type: ignore[arg-type]
            batch_size=100,
            sleep_secs=0.0,
            dry_run=False,
        )
        assert written == 1

    row = (
        await db_session.execute(
            text(
                "SELECT email_encrypted, email_hash, phone_encrypted, phone_hash FROM cfp_applicants WHERE email = :e"
            ),
            {"e": "speaker@example.com"},
        )
    ).one()
    email_enc, email_hash, phone_enc, phone_hash = row
    assert decrypt_pii(email_enc) == "speaker@example.com"
    assert email_hash == hash_email("speaker@example.com")
    assert decrypt_pii(phone_enc) == "+49 30 555-0099"
    assert phone_hash == hash_phone("+49 30 555-0099")


@pytest.mark.asyncio
async def test_backfill_preserves_existing_email_hash(db_session: AsyncSession) -> None:
    """@validates already sets email_hash on insert — backfill must not overwrite it."""
    tenant = await _make_tenant(db_session)
    # ORM insert: @validates("email") populates email_hash, email_encrypted stays NULL
    # (only the future property setter would populate it).
    attendee = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="F",
        last_name="L",
        email="orm@example.com",
    )
    db_session.add(attendee)
    await db_session.commit()
    await db_session.refresh(attendee)
    assert attendee.email_hash == hash_email("orm@example.com")
    assert attendee.email_encrypted is None

    written = await backfill_column(
        db_session, "training_attendees", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    assert written == 1

    await db_session.refresh(attendee)
    assert attendee.email_encrypted is not None
    assert decrypt_pii(attendee.email_encrypted) == "orm@example.com"
    # hash unchanged (COALESCE guard).
    assert attendee.email_hash == hash_email("orm@example.com")


@pytest.mark.asyncio
async def test_backfill_is_idempotent(db_session: AsyncSession) -> None:
    """Second run must write zero rows once companions are populated."""
    tenant = await _make_tenant(db_session)
    await _insert_raw_attendee(db_session, tenant.id, "idem@example.com")

    first = await backfill_column(
        db_session, "training_attendees", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    second = await backfill_column(
        db_session, "training_attendees", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    assert first == 1
    assert second == 0


@pytest.mark.asyncio
async def test_backfill_dry_run_writes_nothing(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    await _insert_raw_attendee(db_session, tenant.id, "dryrun@example.com")

    written = await backfill_column(
        db_session, "training_attendees", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=True
    )
    assert written == 0

    enc = (
        await db_session.execute(
            text("SELECT email_encrypted FROM training_attendees WHERE email = :e"),
            {"e": "dryrun@example.com"},
        )
    ).scalar_one()
    assert enc is None


@pytest.mark.asyncio
async def test_backfill_skips_rows_with_null_plaintext(db_session: AsyncSession) -> None:
    """cfp_applicants.phone is nullable — rows without a phone must not be touched."""
    tenant = await _make_tenant(db_session)
    await _insert_raw_applicant(db_session, tenant.id, "no-phone@example.com", phone=None)

    written = await backfill_column(
        db_session, "cfp_applicants", "phone", "phone", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    assert written == 0


@pytest.mark.asyncio
async def test_backfill_respects_batch_size(db_session: AsyncSession) -> None:
    tenant = await _make_tenant(db_session)
    for i in range(3):
        await _insert_raw_attendee(db_session, tenant.id, f"batch{i}@example.com")

    written = await backfill_column(
        db_session, "training_attendees", "email", "email", batch_size=1, sleep_secs=0.0, dry_run=False
    )
    assert written == 3

    filled = (
        await db_session.execute(
            text("SELECT COUNT(*) FROM training_attendees WHERE email LIKE 'batch%' AND email_encrypted IS NOT NULL")
        )
    ).scalar_one()
    assert filled == 3


@pytest.mark.asyncio
async def test_applicant_without_phone_after_email_backfill(db_session: AsyncSession) -> None:
    """Phone-backfill leaves phone_encrypted NULL when plaintext is NULL,
    independently of email-backfill on the same row."""
    tenant = await _make_tenant(db_session)
    _ = await _insert_raw_applicant(db_session, tenant.id, "solo@example.com", phone=None)

    email_written = await backfill_column(
        db_session, "cfp_applicants", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    phone_written = await backfill_column(
        db_session, "cfp_applicants", "phone", "phone", batch_size=100, sleep_secs=0.0, dry_run=False
    )
    assert email_written == 1
    assert phone_written == 0

    row = (
        await db_session.execute(
            text("SELECT email_encrypted, phone_encrypted, phone_hash FROM cfp_applicants WHERE email = :e"),
            {"e": "solo@example.com"},
        )
    ).one()
    email_enc, phone_enc, phone_hash = row
    assert email_enc is not None
    assert phone_enc is None
    assert phone_hash is None


@pytest.mark.asyncio
async def test_backfill_applicant_phone_hash_uses_phone_hasher(db_session: AsyncSession) -> None:
    """Normalisation: phone hashes strip non-digits, so formatted and unformatted
    numbers that normalise to the same digits must share a hash."""
    tenant = await _make_tenant(db_session)
    await _insert_raw_applicant(db_session, tenant.id, "fmt@example.com", "+49 (30) 555-12 34")

    await backfill_column(db_session, "cfp_applicants", "phone", "phone", batch_size=100, sleep_secs=0.0, dry_run=False)

    phone_hash = (
        await db_session.execute(
            text("SELECT phone_hash FROM cfp_applicants WHERE email = :e"),
            {"e": "fmt@example.com"},
        )
    ).scalar_one()
    assert phone_hash == hash_phone("+493055512 34")
    assert phone_hash == hash_phone("+49-30-555-1234")


@pytest.mark.asyncio
async def test_backfill_applicant_does_not_touch_training_attendees(db_session: AsyncSession) -> None:
    """Per-table isolation: running cfp_applicants backfill leaves training rows alone."""
    tenant = await _make_tenant(db_session)
    await _insert_raw_attendee(db_session, tenant.id, "att@example.com")
    await _insert_raw_applicant(db_session, tenant.id, "app@example.com", "+4900000000")

    await backfill_column(db_session, "cfp_applicants", "email", "email", batch_size=100, sleep_secs=0.0, dry_run=False)

    att_enc = (
        await db_session.execute(
            text("SELECT email_encrypted FROM training_attendees WHERE email = :e"),
            {"e": "att@example.com"},
        )
    ).scalar_one()
    app_enc = (
        await db_session.execute(
            text("SELECT email_encrypted FROM cfp_applicants WHERE email = :e"),
            {"e": "app@example.com"},
        )
    ).scalar_one()
    assert att_enc is None
    assert app_enc is not None


@pytest.mark.asyncio
async def test_backfill_gracefully_skips_missing_plaintext_column(db_session: AsyncSession) -> None:
    """After migration 208 drops ``email``, the script must become a no-op
    instead of raising — deploy.sh calls it on every release."""
    written = await backfill_column(
        db_session,
        "training_attendees",
        "nonexistent_col",
        "email",
        batch_size=100,
        sleep_secs=0.0,
        dry_run=False,
    )
    assert written == 0
