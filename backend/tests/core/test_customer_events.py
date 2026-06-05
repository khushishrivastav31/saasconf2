"""Tests for the unified customer_events table + event-type enum.

This file covers the Phase 2 slice of the unified customer architecture
(see ``.claude/plans/smooth-sprouting-perlis.md``): the table + model +
enum. Service-level rejection tests and dual-write parity tests arrive
with Phase 3 (``test_customer_event_service.py``). Timeline-endpoint
tests arrive with Phase 5 once the reader flips.

The test suite uses ``Base.metadata.create_all`` (see
``conftest.py:_create_tables``) rather than Alembic, so RLS policies
are not active here — that contract is enforced separately by
``test_rls_coverage.py``, which spins up its own migrated DB and will
automatically include ``customer_events`` because the table appears in
the migration head.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import hash_email
from app.models.customer_event import (
    ACTOR_ADMIN,
    ACTOR_SYSTEM,
    VALID_ACTOR_KINDS,
    VALID_DOMAINS,
    CustomerEvent,
    CustomerEventType,
)
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant

# ── Fixtures ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_ce(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="CE Tenant",
        slug=f"ce-tenant-{uuid.uuid4().hex[:6]}",
        is_active=True,
        country="Germany",
        city="Berlin",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def portal_user_ce(db_session: AsyncSession, tenant_ce: Tenant) -> PortalUser:
    pu = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant_ce.id,
        email=f"ce-{uuid.uuid4().hex[:8]}@test.de",
        first_name="Ce",
        last_name="Test",
        is_active=True,
    )
    db_session.add(pu)
    await db_session.commit()
    return pu


# ── Enum shape ──────────────────────────────────────────────────────────


class TestCustomerEventType:
    def test_values_are_namespaced(self):
        """Every enum value must be ``<domain>.<action>``."""
        for member in CustomerEventType:
            assert "." in member.value, f"{member.name} is not namespaced"
            domain = member.value.split(".", 1)[0]
            assert domain in VALID_DOMAINS, f"{member.name} uses unknown domain {domain!r}"

    def test_portal_namespace_complete(self):
        portal_members = {m.value for m in CustomerEventType if m.value.startswith("portal.")}
        expected = {
            "portal.activated",
            "portal.deactivated",
            "portal.invite_resent",
            "portal.password_reset_sent",
            "portal.impersonated",
            "portal.merged_from",
            "portal.merged_into",
        }
        assert portal_members == expected

    def test_training_namespace_complete(self):
        training_members = {m.value for m in CustomerEventType if m.value.startswith("training.")}
        expected = {
            "training.registered",
            "training.offer_assigned",
            "training.parked",
            "training.reassigned",
            "training.cancelled",
            "training.offer_removed",
            "training.deactivated",
            "training.reactivated",
        }
        assert training_members == expected

    def test_actor_kinds_known(self):
        assert ACTOR_ADMIN in VALID_ACTOR_KINDS
        assert ACTOR_SYSTEM in VALID_ACTOR_KINDS
        assert len(VALID_ACTOR_KINDS) == 4


# ── Model persistence ───────────────────────────────────────────────────


class TestCustomerEventModel:
    @pytest.mark.asyncio
    async def test_insert_and_read(
        self,
        db_session: AsyncSession,
        tenant_ce: Tenant,
        portal_user_ce: PortalUser,
    ):
        """Basic round-trip — insert an event, read it back."""
        assert portal_user_ce.email_hash is not None
        entry = CustomerEvent(
            tenant_id=tenant_ce.id,
            portal_user_id=portal_user_ce.id,
            subject_email_hash=portal_user_ce.email_hash,
            domain="portal",
            event_type=CustomerEventType.PORTAL_ACTIVATED.value,
            actor_kind=ACTOR_ADMIN,
            notes="Activated via admin panel",
            meta={"ip": "127.0.0.1"},
        )
        db_session.add(entry)
        await db_session.commit()

        result = await db_session.execute(
            select(CustomerEvent).where(CustomerEvent.portal_user_id == portal_user_ce.id)
        )
        row = result.scalar_one()
        assert row.event_type == "portal.activated"
        assert row.domain == "portal"
        assert row.actor_kind == "admin"
        assert row.notes == "Activated via admin panel"
        assert row.meta == {"ip": "127.0.0.1"}
        assert row.subject_email_hash == portal_user_ce.email_hash
        assert row.created_at is not None

    @pytest.mark.asyncio
    async def test_email_hash_required(
        self,
        db_session: AsyncSession,
        tenant_ce: Tenant,
        portal_user_ce: PortalUser,
    ):
        """subject_email_hash is NOT NULL — the stable identity across merges."""
        entry = CustomerEvent(
            tenant_id=tenant_ce.id,
            portal_user_id=portal_user_ce.id,
            subject_email_hash=None,  # type: ignore[arg-type]
            domain="portal",
            event_type="portal.activated",
        )
        db_session.add(entry)
        with pytest.raises(IntegrityError):
            await db_session.commit()
        await db_session.rollback()

    @pytest.mark.asyncio
    async def test_portal_user_id_nullable(
        self,
        db_session: AsyncSession,
        tenant_ce: Tenant,
    ):
        """portal_user_id must be nullable so history survives deletion/merge."""
        hash_ = hash_email("orphan@test.de")
        entry = CustomerEvent(
            tenant_id=tenant_ce.id,
            portal_user_id=None,
            subject_email_hash=hash_,
            domain="portal",
            event_type="portal.merged_from",
            actor_kind=ACTOR_ADMIN,
        )
        db_session.add(entry)
        await db_session.commit()
        result = await db_session.execute(select(CustomerEvent).where(CustomerEvent.subject_email_hash == hash_))
        assert result.scalar_one().portal_user_id is None

    @pytest.mark.asyncio
    async def test_portal_user_set_null_on_delete(
        self,
        db_session: AsyncSession,
        tenant_ce: Tenant,
        portal_user_ce: PortalUser,
    ):
        """Deleting the portal_user SETs portal_user_id = NULL, does NOT cascade-delete.

        This is the core "merge-safe history" guarantee: a merged subject's
        event rows survive via subject_email_hash.
        """
        assert portal_user_ce.email_hash is not None
        entry = CustomerEvent(
            tenant_id=tenant_ce.id,
            portal_user_id=portal_user_ce.id,
            subject_email_hash=portal_user_ce.email_hash,
            domain="portal",
            event_type="portal.activated",
        )
        db_session.add(entry)
        await db_session.commit()
        event_id = entry.id

        await db_session.delete(portal_user_ce)
        await db_session.commit()

        result = await db_session.execute(select(CustomerEvent).where(CustomerEvent.id == event_id))
        row = result.scalar_one_or_none()
        assert row is not None, "event row must survive portal_user deletion"
        assert row.portal_user_id is None
        assert row.subject_email_hash == portal_user_ce.email_hash

    @pytest.mark.asyncio
    async def test_related_entity_pointer(
        self,
        db_session: AsyncSession,
        tenant_ce: Tenant,
        portal_user_ce: PortalUser,
    ):
        """Polymorphic pointer lets CFP / messaging plug in without migration."""
        attendee_id = uuid.uuid4()
        assert portal_user_ce.email_hash is not None
        entry = CustomerEvent(
            tenant_id=tenant_ce.id,
            portal_user_id=portal_user_ce.id,
            subject_email_hash=portal_user_ce.email_hash,
            domain="training",
            event_type="training.registered",
            related_entity_type="training_attendee",
            related_entity_id=attendee_id,
        )
        db_session.add(entry)
        await db_session.commit()

        result = await db_session.execute(
            select(CustomerEvent).where(
                CustomerEvent.related_entity_type == "training_attendee",
                CustomerEvent.related_entity_id == attendee_id,
            )
        )
        assert result.scalar_one().event_type == "training.registered"


# ── Index presence (smoke — catches dropped index in future migrations) ─


class TestCustomerEventIndexes:
    @pytest.mark.asyncio
    async def test_expected_indexes_exist(self, db_session: AsyncSession):
        """The four timeline/analytics indexes must be present."""
        result = await db_session.execute(
            text(
                """
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'customer_events'
                ORDER BY indexname
                """
            )
        )
        indexes = {row[0] for row in result.all()}
        expected = {
            "customer_events_pkey",
            "idx_customer_events_email_hash_created",
            "idx_customer_events_related",
            "idx_customer_events_tenant_type",
            "idx_customer_events_user_created",
        }
        assert expected.issubset(indexes), f"missing: {expected - indexes}"


# ── Merge-history continuity (integration) ──────────────────────────────


class TestMergeHistoryContinuity:
    @pytest.mark.asyncio
    async def test_lookup_by_email_hash_after_portal_user_deletion(
        self,
        db_session: AsyncSession,
        tenant_ce: Tenant,
    ):
        """Simulates a merge: user B is deleted after history rows exist.

        Readers should still find B's events via subject_email_hash when
        the same email_hash lives on the surviving target user A.
        """
        pu_a = PortalUser(
            id=uuid.uuid4(),
            tenant_id=tenant_ce.id,
            email=f"target-{uuid.uuid4().hex[:6]}@test.de",
            first_name="Target",
            last_name="User",
            is_active=True,
        )
        pu_b = PortalUser(
            id=uuid.uuid4(),
            tenant_id=tenant_ce.id,
            email=f"source-{uuid.uuid4().hex[:6]}@test.de",
            first_name="Source",
            last_name="User",
            is_active=True,
        )
        db_session.add_all([pu_a, pu_b])
        await db_session.commit()

        assert pu_b.email_hash is not None
        assert pu_a.email_hash is not None

        event_b = CustomerEvent(
            tenant_id=tenant_ce.id,
            portal_user_id=pu_b.id,
            subject_email_hash=pu_b.email_hash,
            domain="portal",
            event_type="portal.activated",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        db_session.add(event_b)
        await db_session.commit()
        event_b_id = event_b.id
        b_email_hash = pu_b.email_hash

        # Merge: A absorbs B. Delete B first to release the unique email_hash,
        # then assign B's email to A so the email can still log in.
        b_email = pu_b.email
        await db_session.delete(pu_b)
        await db_session.flush()
        pu_a.email = b_email
        await db_session.commit()

        # A reader querying "events for A" via (portal_user_id OR email_hash)
        # finds B's old event via the hash fallback.
        result = await db_session.execute(
            select(CustomerEvent).where(
                (CustomerEvent.portal_user_id == pu_a.id) | (CustomerEvent.subject_email_hash == pu_a.email_hash)
            )
        )
        rows = result.scalars().all()
        event_ids = {r.id for r in rows}
        assert event_b_id in event_ids
        surviving = next(r for r in rows if r.id == event_b_id)
        assert surviving.portal_user_id is None
        assert surviving.subject_email_hash == b_email_hash
