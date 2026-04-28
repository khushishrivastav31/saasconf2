"""Trainings-side news article CRUD + send + portal access.

Mirrors the per-conference news tests but checks tenant-wide,
training-domain rows (migration 217 + the new ``/trainings/news``
router). Also exercises the portal endpoint to confirm training-portal
identities surface training-domain articles.
"""

import os
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

from datetime import date

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import create_access_token, hash_password
from app.models.cfp import CFPApplicant
from app.models.location import Location
from app.models.module import Module, TenantModule
from app.models.news import NEWS_DOMAIN_TRAINING, NewsArticle
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User, UserRole
from tests.conftest import auth_headers


def _admin_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings"],
    )


@pytest_asyncio.fixture
async def tn_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="TN Tenant", slug=f"tn-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def tn_admin(db_session: AsyncSession, tn_tenant: Tenant) -> User:
    mod = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="T", is_active=True)
    db_session.add(mod)
    await db_session.flush()
    db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tn_tenant.id, module_id=mod.id, is_enabled=True))
    u = User(
        id=uuid.uuid4(),
        tenant_id=tn_tenant.id,
        email=f"tn-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="TN",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


URL = "/api/v1/trainings/news"


class TestTrainingNewsCRUD:
    @pytest.mark.asyncio
    async def test_list_empty(self, client: AsyncClient, tn_tenant: Tenant, tn_admin: User) -> None:
        resp = await client.get(URL, headers=auth_headers(_admin_token(tn_admin)))
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"items": [], "total": 0}

    @pytest.mark.asyncio
    async def test_create_persists_with_training_domain(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        resp = await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={"title": "First training news", "body_html": "<p>Hello</p>"},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["title"] == "First training news"
        assert body["domain"] == NEWS_DOMAIN_TRAINING
        assert body["conference_id"] is None
        assert body["is_published"] is False
        assert body["author_first_name"] == "TN"

        # The row exists with domain='training' and conference_id NULL.
        from sqlalchemy import select

        row = (
            await db_session.execute(select(NewsArticle).where(NewsArticle.id == uuid.UUID(body["id"])))
        ).scalar_one()
        assert row.domain == NEWS_DOMAIN_TRAINING
        assert row.conference_id is None

    @pytest.mark.asyncio
    async def test_publish_sets_published_at(
        self,
        client: AsyncClient,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        created = await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={"title": "Drafty", "body_html": "<p>Body</p>"},
        )
        oid = created.json()["id"]
        resp = await client.put(
            f"{URL}/{oid}",
            headers=auth_headers(_admin_token(tn_admin)),
            json={"is_published": True},
        )
        assert resp.status_code == 200
        assert resp.json()["is_published"] is True
        assert resp.json()["published_at"] is not None

        # Unpublish clears published_at.
        resp2 = await client.put(
            f"{URL}/{oid}",
            headers=auth_headers(_admin_token(tn_admin)),
            json={"is_published": False},
        )
        assert resp2.json()["is_published"] is False
        assert resp2.json()["published_at"] is None

    @pytest.mark.asyncio
    async def test_delete(self, client: AsyncClient, tn_tenant: Tenant, tn_admin: User) -> None:
        created = await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={"title": "Doomed", "body_html": "<p>Body</p>"},
        )
        oid = created.json()["id"]
        resp = await client.delete(f"{URL}/{oid}", headers=auth_headers(_admin_token(tn_admin)))
        assert resp.status_code == 200
        get_resp = await client.get(f"{URL}/{oid}", headers=auth_headers(_admin_token(tn_admin)))
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_with_training_overlay_persists_link(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        """A training-domain news article can attach a training-scope overlay
        via ``screen_overlay_id`` (same FK conferences use)."""
        from app.models.screen_overlay import OVERLAY_DOMAIN_TRAINING, ScreenOverlay

        overlay = ScreenOverlay(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            conference_id=None,
            domain=OVERLAY_DOMAIN_TRAINING,
            trigger_type="always",
            title="Welcome overlay",
            animation_style="confetti",
            duration_seconds=5,
            is_active=True,
            display_order=0,
        )
        db_session.add(overlay)
        await db_session.commit()

        resp = await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={
                "title": "Article with overlay",
                "body_html": "<p>x</p>",
                "screen_overlay_id": str(overlay.id),
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["screen_overlay_id"] == str(overlay.id)

    @pytest.mark.asyncio
    async def test_other_tenant_cannot_see(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={"title": "Tenant-A news", "body_html": "<p>x</p>"},
        )
        other = Tenant(id=uuid.uuid4(), name="Other", slug=f"other-{uuid.uuid4().hex[:6]}")
        db_session.add(other)
        await db_session.flush()
        mod = Module(id=uuid.uuid4(), name="T", code=f"t-{uuid.uuid4().hex[:6]}", description="T", is_active=True)
        db_session.add(mod)
        await db_session.flush()
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=other.id, module_id=mod.id, is_enabled=True))
        other_admin = User(
            id=uuid.uuid4(),
            tenant_id=other.id,
            email=f"other-{uuid.uuid4().hex[:8]}@example.com",
            first_name="Other",
            last_name="Admin",
            role=UserRole.TENANT_ADMIN.value,
            password_hash=hash_password("Password123!"),
            is_active=True,
        )
        db_session.add(other_admin)
        await db_session.commit()

        resp = await client.get(URL, headers=auth_headers(_admin_token(other_admin)))
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


async def _seed_two_placements(
    db_session: AsyncSession,
    tn_tenant: Tenant,
) -> tuple[ProgramYearTraining, ProgramYearTraining, TrainingRegistration, TrainingRegistration]:
    """Build two placements in different program years, one registration each.

    Returns ``(placement_a, placement_b, registration_a, registration_b)``.
    Used by the filter tests below to exercise per-placement / per-year /
    per-status filtering against a tiny fixture.
    """
    training = Training(
        id=uuid.uuid4(), tenant_id=tn_tenant.id, name="ITIL", slug=f"itil-{uuid.uuid4().hex[:6]}", duration=2
    )
    location = Location(id=uuid.uuid4(), tenant_id=tn_tenant.id, name="Berlin", code=f"BER{uuid.uuid4().hex[:2]}")
    year_a = 2030 + (uuid.uuid4().int % 50)
    year_b = year_a + 1
    py_a = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tn_tenant.id, year=year_a)
    py_b = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tn_tenant.id, year=year_b)
    db_session.add_all([training, location, py_a, py_b])
    await db_session.flush()
    placement_a = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tn_tenant.id,
        program_year_id=py_a.id,
        training_id=training.id,
        start_date=date(year_a, 5, 10),
        placement_type="open",
        location_id=location.id,
        is_active=True,
    )
    placement_b = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tn_tenant.id,
        program_year_id=py_b.id,
        training_id=training.id,
        start_date=date(year_b, 5, 10),
        placement_type="open",
        location_id=location.id,
        is_active=True,
    )
    db_session.add_all([placement_a, placement_b])
    await db_session.flush()
    reg_a = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tn_tenant.id,
        placement_id=placement_a.id,
        status="paid",
        language="en",
        company_name="Acme",
        street="Main",
        postal_code="1",
        city="Berlin",
        country="DE",
        contact_first_name="C",
        contact_last_name="C",
        contact_email=f"a-{uuid.uuid4().hex[:6]}@x.test",
        payment_method="bank_transfer",
    )
    reg_b = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tn_tenant.id,
        placement_id=placement_b.id,
        status="pending",
        language="en",
        company_name="Globex",
        street="Side",
        postal_code="1",
        city="Berlin",
        country="DE",
        contact_first_name="C",
        contact_last_name="C",
        contact_email=f"b-{uuid.uuid4().hex[:6]}@x.test",
        payment_method="bank_transfer",
    )
    db_session.add_all([reg_a, reg_b])
    await db_session.flush()
    db_session.add(
        TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            registration_id=reg_a.id,
            first_name="Alice",
            last_name="A",
            email="alice@example.com",
            language="en",
        )
    )
    db_session.add(
        TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            registration_id=reg_b.id,
            first_name="Bob",
            last_name="B",
            email="bob@example.com",
            language="en",
        )
    )
    await db_session.commit()
    return placement_a, placement_b, reg_a, reg_b


async def _publish_news(client: AsyncClient, admin: User, title: str = "Big news") -> str:
    created = await client.post(
        URL,
        headers=auth_headers(_admin_token(admin)),
        json={"title": title, "body_html": "<p>x</p>"},
    )
    oid = created.json()["id"]
    await client.put(
        f"{URL}/{oid}",
        headers=auth_headers(_admin_token(admin)),
        json={"is_published": True},
    )
    return oid


class TestTrainingNewsSend:
    @pytest.mark.asyncio
    async def test_send_only_works_when_published(
        self,
        client: AsyncClient,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        created = await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={"title": "Draft", "body_html": "<p>x</p>"},
        )
        oid = created.json()["id"]
        resp = await client.post(f"{URL}/{oid}/send", headers=auth_headers(_admin_token(tn_admin)))
        assert resp.status_code == 404  # NotFoundError("Only published articles can be sent")

    @pytest.mark.asyncio
    async def test_send_emails_each_unique_attendee(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        # Build a minimal placement + registration + 2 attendees (one
        # duplicated by email to verify the dedupe).
        training = Training(
            id=uuid.uuid4(), tenant_id=tn_tenant.id, name="ITIL", slug=f"itil-{uuid.uuid4().hex[:6]}", duration=2
        )
        location = Location(id=uuid.uuid4(), tenant_id=tn_tenant.id, name="Berlin", code=f"BER{uuid.uuid4().hex[:2]}")
        year = 2030 + (uuid.uuid4().int % 50)
        program_year = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tn_tenant.id, year=year)
        db_session.add_all([training, location, program_year])
        await db_session.flush()
        placement = ProgramYearTraining(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            program_year_id=program_year.id,
            training_id=training.id,
            start_date=date(year, 5, 10),
            placement_type="open",
            location_id=location.id,
            is_active=True,
        )
        db_session.add(placement)
        await db_session.flush()
        registration = TrainingRegistration(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            placement_id=placement.id,
            status="paid",
            language="en",
            company_name="Acme",
            street="Main",
            postal_code="1",
            city="Berlin",
            country="DE",
            contact_first_name="C",
            contact_last_name="C",
            contact_email=f"c-{uuid.uuid4().hex[:6]}@x.test",
            payment_method="bank_transfer",
        )
        db_session.add(registration)
        await db_session.flush()
        for first, email in [
            ("Alice", "alice@example.com"),
            ("Bob", "bob@example.com"),
            ("AliceDup", "alice@example.com"),
        ]:
            db_session.add(
                TrainingRegistrationAttendee(
                    id=uuid.uuid4(),
                    tenant_id=tn_tenant.id,
                    registration_id=registration.id,
                    first_name=first,
                    last_name="Last",
                    email=email,
                    language="en",
                )
            )
        await db_session.commit()

        # Create + publish + send.
        created = await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={"title": "Big news", "body_html": "<p>Hello</p>"},
        )
        oid = created.json()["id"]
        await client.put(
            f"{URL}/{oid}",
            headers=auth_headers(_admin_token(tn_admin)),
            json={"is_published": True},
        )

        with patch(
            "app.api.v1.trainings.news.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as mock_send:
            resp = await client.post(f"{URL}/{oid}/send", headers=auth_headers(_admin_token(tn_admin)))
        assert resp.status_code == 200, resp.text
        # Two unique emails, not three (alice was duplicated).
        assert resp.json()["emails_sent"] == 2
        assert mock_send.await_count == 2

    @pytest.mark.asyncio
    async def test_send_filtered_by_placement_ids(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        """``placement_ids`` narrows the recipient pool to attendees on the
        listed placements."""
        placement_a, _placement_b, _reg_a, _reg_b = await _seed_two_placements(db_session, tn_tenant)
        oid = await _publish_news(client, tn_admin)

        with patch(
            "app.api.v1.trainings.news.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as mock_send:
            resp = await client.post(
                f"{URL}/{oid}/send",
                headers=auth_headers(_admin_token(tn_admin)),
                json={"placement_ids": [str(placement_a.id)]},
            )
        assert resp.status_code == 200, resp.text
        # Only Alice (placement A); Bob (placement B) is filtered out.
        assert resp.json()["emails_sent"] == 1
        assert mock_send.await_args.kwargs["email"] == "alice@example.com"

    @pytest.mark.asyncio
    async def test_send_filtered_by_program_year(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        """``program_year_id`` narrows the pool to attendees on placements
        in that program year."""
        placement_a, _placement_b, _reg_a, _reg_b = await _seed_two_placements(db_session, tn_tenant)
        # Resolve the year-A program-year id from placement_a.
        program_year_id = placement_a.program_year_id
        oid = await _publish_news(client, tn_admin)

        with patch(
            "app.api.v1.trainings.news.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as mock_send:
            resp = await client.post(
                f"{URL}/{oid}/send",
                headers=auth_headers(_admin_token(tn_admin)),
                json={"program_year_id": str(program_year_id)},
            )
        assert resp.status_code == 200, resp.text
        assert resp.json()["emails_sent"] == 1
        assert mock_send.await_args.kwargs["email"] == "alice@example.com"

    @pytest.mark.asyncio
    async def test_send_filtered_by_registration_status(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        """``registration_status`` narrows the pool to attendees on
        registrations matching that status."""
        await _seed_two_placements(db_session, tn_tenant)  # reg_a is "paid", reg_b is "pending"
        oid = await _publish_news(client, tn_admin)

        with patch(
            "app.api.v1.trainings.news.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as mock_send:
            resp = await client.post(
                f"{URL}/{oid}/send",
                headers=auth_headers(_admin_token(tn_admin)),
                json={"registration_status": "paid"},
            )
        assert resp.status_code == 200, resp.text
        # Only Alice (paid); Bob (pending) is filtered out.
        assert resp.json()["emails_sent"] == 1
        assert mock_send.await_args.kwargs["email"] == "alice@example.com"


class TestTrainingNewsPortalAccess:
    @pytest.mark.asyncio
    async def test_portal_user_with_training_attendee_sees_training_news(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        """An applicant whose email matches a TrainingRegistrationAttendee
        in the same tenant gets training-domain news in the portal feed."""
        # Wire up a portal user (CFPApplicant) + a training-attendee row
        # with the SAME email so the email_hash join finds it.
        shared_email = f"port-{uuid.uuid4().hex[:6]}@example.com"
        applicant = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            first_name="Port",
            last_name="User",
            email=shared_email,
            password_hash=hash_password("Password123!"),
            email_verified_at=datetime.now(UTC),
        )
        db_session.add(applicant)
        await db_session.flush()
        # Minimal placement + reg so the attendee row passes FK constraints.
        training = Training(
            id=uuid.uuid4(), tenant_id=tn_tenant.id, name="PSM", slug=f"psm-{uuid.uuid4().hex[:6]}", duration=2
        )
        location = Location(id=uuid.uuid4(), tenant_id=tn_tenant.id, name="Berlin", code=f"BER{uuid.uuid4().hex[:2]}")
        year = 2030 + (uuid.uuid4().int % 50)
        program_year = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tn_tenant.id, year=year)
        db_session.add_all([training, location, program_year])
        await db_session.flush()
        placement = ProgramYearTraining(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            program_year_id=program_year.id,
            training_id=training.id,
            start_date=date(year, 5, 10),
            placement_type="open",
            location_id=location.id,
            is_active=True,
        )
        db_session.add(placement)
        await db_session.flush()
        registration = TrainingRegistration(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            placement_id=placement.id,
            status="paid",
            language="en",
            company_name="Acme",
            street="x",
            postal_code="1",
            city="Berlin",
            country="DE",
            contact_first_name="C",
            contact_last_name="C",
            contact_email=f"c-{uuid.uuid4().hex[:6]}@x.test",
            payment_method="bank_transfer",
        )
        db_session.add(registration)
        await db_session.flush()
        db_session.add(
            TrainingRegistrationAttendee(
                id=uuid.uuid4(),
                tenant_id=tn_tenant.id,
                registration_id=registration.id,
                first_name="Port",
                last_name="User",
                email=shared_email,
                language="en",
            )
        )
        await db_session.commit()

        # Admin creates + publishes a training news article.
        created = await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={"title": "Welcome to trainings", "body_html": "<p>Hi</p>"},
        )
        oid = created.json()["id"]
        await client.put(
            f"{URL}/{oid}",
            headers=auth_headers(_admin_token(tn_admin)),
            json={"is_published": True},
        )

        # Portal user fetches news — sees the training article.
        token = create_applicant_access_token(applicant.id, tn_tenant.id)
        portal_resp = await client.get(
            "/api/v1/portal/news",
            headers=auth_headers(token),
        )
        assert portal_resp.status_code == 200
        ids = {item["id"] for item in portal_resp.json()["items"]}
        assert oid in ids
        # And the article carries domain='training' on the wire.
        match = next(item for item in portal_resp.json()["items"] if item["id"] == oid)
        assert match["domain"] == NEWS_DOMAIN_TRAINING
        assert match["conference_id"] is None

    @pytest.mark.asyncio
    async def test_portal_user_without_training_attendee_does_not_see_training_news(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tn_tenant: Tenant,
        tn_admin: User,
    ) -> None:
        """An applicant with no matching training-attendee row must NOT see
        training-domain news (even if they're in the same tenant)."""
        applicant = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tn_tenant.id,
            first_name="NoTraining",
            last_name="User",
            email=f"notrain-{uuid.uuid4().hex[:6]}@example.com",
            password_hash=hash_password("Password123!"),
            email_verified_at=datetime.now(UTC),
        )
        db_session.add(applicant)
        await db_session.commit()

        # Admin creates + publishes a training news article.
        created = await client.post(
            URL,
            headers=auth_headers(_admin_token(tn_admin)),
            json={"title": "Trainings only", "body_html": "<p>x</p>"},
        )
        oid = created.json()["id"]
        await client.put(
            f"{URL}/{oid}",
            headers=auth_headers(_admin_token(tn_admin)),
            json={"is_published": True},
        )

        token = create_applicant_access_token(applicant.id, tn_tenant.id)
        portal_resp = await client.get(
            "/api/v1/portal/news",
            headers=auth_headers(token),
        )
        assert portal_resp.status_code == 200
        ids = {item["id"] for item in portal_resp.json()["items"]}
        assert oid not in ids
