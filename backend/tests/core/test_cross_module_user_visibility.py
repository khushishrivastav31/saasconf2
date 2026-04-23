"""Cross-module user visibility.

Rules being verified:
- The conference users list (``GET /cfp/applicants?conference_id=X``) shows a
  person who appears ONLY on a CFP paper AND a person who appears on BOTH a
  CFP paper and as a training attendee, but NOT a training-only person.
- The training users list (``GET /trainings/attendees``) shows a training-only
  person AND a both-sides person, but NOT a conference-only person.

Three seeded actors per test: conf-only, train-only, both.
"""

from __future__ import annotations

import os
import uuid
from datetime import date, timedelta

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.training_attendee import TrainingAttendee
from app.models.user import User, UserRole
from tests.conftest import auth_headers


def _token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["cfp", "trainings", "conferences"],
    )


@pytest_asyncio.fixture
async def xm_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="XM Tenant",
        slug=f"xm-{uuid.uuid4().hex[:6]}",
        is_active=True,
        country="Germany",
        city="Berlin",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def xm_admin(db_session: AsyncSession, xm_tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=xm_tenant.id,
        email=f"xm-admin-{uuid.uuid4().hex[:6]}@test.com",
        first_name="Admin",
        last_name="X",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def xm_conference_with_cfp(db_session: AsyncSession, xm_tenant: Tenant) -> tuple[Conference, CallForPapers]:
    conf = Conference(
        id=uuid.uuid4(),
        tenant_id=xm_tenant.id,
        name="XM Conf",
        abbreviation="XMC",
        start_date=date.today() + timedelta(days=30),
        end_date=date.today() + timedelta(days=32),
        is_active=True,
    )
    db_session.add(conf)
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=xm_tenant.id,
        title="XM CFP",
        status="open",
    )
    db_session.add(cfp)
    await db_session.flush()
    db_session.add(ConferenceCFP(id=uuid.uuid4(), conference_id=conf.id, cfp_id=cfp.id))
    await db_session.commit()
    return conf, cfp


async def _make_applicant_on_paper(
    db_session: AsyncSession,
    tenant: Tenant,
    cfp: CallForPapers,
    *,
    first_name: str,
    last_name: str,
    email: str,
) -> CFPApplicant:
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        password_hash=hash_password("Password123!"),
    )
    db_session.add(applicant)
    await db_session.flush()
    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title=f"Paper by {first_name}",
        abstract_short="abs",
        status=PaperStatus.SUBMITTED.value,
    )
    db_session.add(paper)
    await db_session.commit()
    return applicant


async def _make_training_attendee(
    db_session: AsyncSession,
    tenant: Tenant,
    *,
    first_name: str,
    last_name: str,
    email: str,
) -> TrainingAttendee:
    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        status="active",
    )
    db_session.add(att)
    await db_session.commit()
    return att


class TestCrossModuleUserVisibility:
    @pytest.mark.asyncio
    async def test_conference_users_list_shows_cfp_only_and_both_not_training_only(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        xm_admin: User,
        xm_tenant: Tenant,
        xm_conference_with_cfp: tuple[Conference, CallForPapers],
    ):
        conf, cfp = xm_conference_with_cfp

        conf_only = await _make_applicant_on_paper(
            db_session,
            xm_tenant,
            cfp,
            first_name="Carla",
            last_name="ConfOnly",
            email="carla.confonly@test.de",
        )
        both = await _make_applicant_on_paper(
            db_session,
            xm_tenant,
            cfp,
            first_name="Bruno",
            last_name="Both",
            email="bruno.both@test.de",
        )
        await _make_training_attendee(
            db_session,
            xm_tenant,
            first_name=both.first_name,
            last_name=both.last_name,
            email=both.email,
        )
        await _make_training_attendee(
            db_session,
            xm_tenant,
            first_name="Tilda",
            last_name="TrainOnly",
            email="tilda.trainonly@test.de",
        )

        res = await client.get(
            f"/api/v1/cfp/applicants?conference_id={conf.id}",
            headers=auth_headers(_token(xm_admin)),
        )
        assert res.status_code == 200
        emails = {item["email"] for item in res.json()["items"]}

        assert conf_only.email in emails, "conference-only applicant must be listed"
        assert both.email in emails, "cfp+training applicant must be listed"
        assert "tilda.trainonly@test.de" not in emails, (
            "training-only attendee must not appear in conference users list"
        )

    @pytest.mark.asyncio
    async def test_training_users_list_shows_training_only_and_both_not_cfp_only(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        xm_admin: User,
        xm_tenant: Tenant,
        xm_conference_with_cfp: tuple[Conference, CallForPapers],
    ):
        _conf, cfp = xm_conference_with_cfp

        await _make_applicant_on_paper(
            db_session,
            xm_tenant,
            cfp,
            first_name="Carla",
            last_name="ConfOnly",
            email="carla.confonly@test.de",
        )
        both_applicant = await _make_applicant_on_paper(
            db_session,
            xm_tenant,
            cfp,
            first_name="Bruno",
            last_name="Both",
            email="bruno.both@test.de",
        )
        await _make_training_attendee(
            db_session,
            xm_tenant,
            first_name=both_applicant.first_name,
            last_name=both_applicant.last_name,
            email=both_applicant.email,
        )
        await _make_training_attendee(
            db_session,
            xm_tenant,
            first_name="Tilda",
            last_name="TrainOnly",
            email="tilda.trainonly@test.de",
        )

        res = await client.get(
            "/api/v1/trainings/attendees",
            headers=auth_headers(_token(xm_admin)),
        )
        assert res.status_code == 200
        emails = {item["email"] for item in res.json()["items"]}

        assert "tilda.trainonly@test.de" in emails, "training-only attendee must be listed"
        assert both_applicant.email in emails, "cfp+training attendee must be listed"
        assert "carla.confonly@test.de" not in emails, (
            "conference-only applicant must not appear in training users list"
        )
