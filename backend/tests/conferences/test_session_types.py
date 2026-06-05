"""Tests for session types CRUD endpoints (QA 2.3.1-2.3.2).

Endpoint prefix: /api/v1/conferences/{conference_id}/settings/session-types
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.settings import SessionType
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers


# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _url(conference_id: uuid.UUID, suffix: str = "") -> str:
    base = f"/api/v1/conferences/{conference_id}/settings/session-types"
    return f"{base}{suffix}" if suffix else base


async def _create_cfp_with_paper(
    db: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    session_type_id: uuid.UUID,
) -> CFPPaper:
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Test CFP",
    )
    db.add(cfp)
    await db.flush()

    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane-{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db.add(applicant)
    await db.flush()

    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Test Paper",
        session_type_id=session_type_id,
        status=PaperStatus.DRAFT.value,
    )
    db.add(paper)
    await db.commit()
    return paper


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences"])


@pytest.fixture()
def user_token(regular_user: User) -> str:
    return _make_token(regular_user, modules=["conferences"])


@pytest_asyncio.fixture()
async def session_type(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> SessionType:
    st = SessionType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Talk",
        slug="talk",
        duration_minutes=30,
        cfp_eligible=True,
        separately_bookable=False,
        is_active=True,
    )
    db_session.add(st)
    await db_session.commit()
    await db_session.refresh(st)
    return st


# ═══════════════════════════════════════════════════════════════════════
# 1. LIST
# ═══════════════════════════════════════════════════════════════════════


class TestListSessionTypes:
    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        response = await client.get(_url(conference.id), headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_returns_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        session_type: SessionType,
    ) -> None:
        response = await client.get(_url(conference.id), headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "Talk"
        assert data["items"][0]["slug"] == "talk"
        assert data["items"][0]["duration_minutes"] == 30

    async def test_list_requires_auth(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        response = await client.get(_url(conference.id))
        assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════════════
# 2. CREATE
# ═══════════════════════════════════════════════════════════════════════


class TestCreateSessionType:
    async def test_create_minimal(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        payload = {
            "name": "Workshop",
            "slug": "workshop",
            "duration_minutes": 90,
        }
        response = await client.post(_url(conference.id), json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Workshop"
        assert data["slug"] == "workshop"
        assert data["duration_minutes"] == 90
        assert data["cfp_eligible"] is True
        assert data["separately_bookable"] is False
        assert data["is_active"] is True

    async def test_create_with_all_fields(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        payload = {
            "name": "Keynote",
            "slug": "keynote",
            "duration_minutes": 60,
            "cfp_eligible": False,
            "separately_bookable": True,
            "max_attendees": 500,
            "is_active": True,
        }
        response = await client.post(_url(conference.id), json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["cfp_eligible"] is False
        assert data["separately_bookable"] is True
        assert data["max_attendees"] == 500

    async def test_create_duplicate_slug_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        session_type: SessionType,
    ) -> None:
        payload = {"name": "Talk 2", "slug": "talk", "duration_minutes": 45}
        response = await client.post(_url(conference.id), json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 400

    async def test_create_requires_tenant_admin(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        user_token: str,
    ) -> None:
        payload = {"name": "X", "slug": "x", "duration_minutes": 30}
        response = await client.post(_url(conference.id), json=payload, headers=auth_headers(user_token))

        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 3. UPDATE (PATCH)
# ═══════════════════════════════════════════════════════════════════════


class TestUpdateSessionType:
    async def test_put_name(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        session_type: SessionType,
    ) -> None:
        payload = {
            "name": "Lightning Talk",
            "slug": session_type.slug,
            "duration_minutes": session_type.duration_minutes,
        }
        response = await client.put(
            _url(conference.id, f"/{session_type.id}"),
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Lightning Talk"

    async def test_put_duration(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        session_type: SessionType,
    ) -> None:
        payload = {
            "name": session_type.name,
            "slug": session_type.slug,
            "duration_minutes": 45,
        }
        response = await client.put(
            _url(conference.id, f"/{session_type.id}"),
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        assert response.json()["duration_minutes"] == 45

    async def test_put_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        response = await client.put(
            _url(conference.id, f"/{uuid.uuid4()}"),
            json={"name": "Ghost", "slug": "ghost", "duration_minutes": 30},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_separately_bookable_propagates_to_linked_papers(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        admin_token: str,
        session_type: SessionType,
    ) -> None:
        """Updating separately_bookable on a session type propagates to linked papers."""
        paper = await _create_cfp_with_paper(db_session, tenant, conference, session_type_id=session_type.id)
        assert paper.separately_bookable is False

        response = await client.put(
            _url(conference.id, f"/{session_type.id}"),
            json={
                "name": session_type.name,
                "slug": session_type.slug,
                "duration_minutes": session_type.duration_minutes,
                "separately_bookable": True,
            },
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200

        await db_session.refresh(paper)
        assert paper.separately_bookable is True


# ═══════════════════════════════════════════════════════════════════════
# 4. DELETE
# ═══════════════════════════════════════════════════════════════════════


class TestDeleteSessionType:
    async def test_delete_succeeds(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        session_type: SessionType,
    ) -> None:
        response = await client.delete(
            _url(conference.id, f"/{session_type.id}"),
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200

        list_response = await client.get(_url(conference.id), headers=auth_headers(admin_token))
        assert list_response.json()["total"] == 0

    async def test_delete_blocked_when_paper_uses_it(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        admin_token: str,
        session_type: SessionType,
    ) -> None:
        """409 when a CFPPaper references the session type."""
        await _create_cfp_with_paper(db_session, tenant, conference, session_type_id=session_type.id)

        response = await client.delete(
            _url(conference.id, f"/{session_type.id}"),
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 400
        assert "paper" in response.json()["detail"].lower()

    async def test_delete_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        response = await client.delete(
            _url(conference.id, f"/{uuid.uuid4()}"),
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404

    async def test_delete_requires_tenant_admin(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        user_token: str,
        session_type: SessionType,
    ) -> None:
        response = await client.delete(
            _url(conference.id, f"/{session_type.id}"),
            headers=auth_headers(user_token),
        )

        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 5. TENANT ISOLATION
# ═══════════════════════════════════════════════════════════════════════


class TestTenantIsolation:
    async def test_other_tenant_session_type_not_visible(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        session_type: SessionType,
    ) -> None:
        """Session type created for tenant_a must not appear for tenant_b."""
        from app.models.module import Module, TenantModule

        tenant_b = Tenant(
            id=uuid.uuid4(),
            name="Other Corp",
            slug=f"other-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(tenant_b)
        await db_session.flush()

        user_b = User(
            id=uuid.uuid4(),
            tenant_id=tenant_b.id,
            email=f"admin-b-{uuid.uuid4().hex[:8]}@test.com",
            password_hash=hash_password("Password123!"),
            first_name="B",
            last_name="Admin",
            role="tenant_admin",
            is_active=True,
        )
        db_session.add(user_b)

        mod = Module(
            id=uuid.uuid4(),
            name="Conferences",
            code=f"conferences-{uuid.uuid4().hex[:4]}",
            description="",
            is_active=True,
        )
        db_session.add(mod)
        await db_session.flush()

        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant_b.id, module_id=mod.id, is_enabled=True))
        await db_session.flush()

        conf_b = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant_b.id,
            name="Other Conf",
            is_active=True,
        )
        db_session.add(conf_b)
        await db_session.commit()

        token_b = create_access_token(
            user_id=user_b.id,
            tenant_id=user_b.tenant_id,
            role=user_b.role,
            modules=["conferences"],
        )

        response = await client.get(_url(conf_b.id), headers=auth_headers(token_b))
        assert response.status_code == 200
        assert response.json()["total"] == 0
