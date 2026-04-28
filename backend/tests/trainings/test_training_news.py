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
