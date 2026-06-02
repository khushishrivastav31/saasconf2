"""Tests for session type CRUD guards and business-logic hooks.

Covers the gaps in test_settings_crud.py:
- Delete blocked when CFP papers reference the type.
- separately_bookable propagation to linked papers on update.
- Non-admin access guard (403).
"""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test"
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.tenant import Tenant
from tests.conftest import auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BASE = "/api/v1/conferences/{conference_id}/settings/session-types"


def _url(conference_id: uuid.UUID, suffix: str = "") -> str:
    base = _BASE.format(conference_id=conference_id)
    return f"{base}/{suffix}" if suffix else base


async def _create_session_type(
    client: AsyncClient,
    conference_id: uuid.UUID,
    token: str,
    *,
    name: str = "Talk",
    slug: str | None = None,
    separately_bookable: bool = False,
) -> dict:
    slug = slug or name.lower().replace(" ", "-")
    resp = await client.post(
        _url(conference_id),
        json={
            "name": name,
            "slug": slug,
            "duration_minutes": 30,
            "separately_bookable": separately_bookable,
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _create_cfp_with_paper(
    db: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    session_type_id: uuid.UUID,
) -> CFPPaper:
    """Create minimal CFP + applicant + paper linked to a session type."""
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Test CFP",
        status="open",
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


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSessionTypeGuards:
    """Business-logic guards and hooks on the session-types endpoint."""

    @pytest.mark.asyncio
    async def test_delete_blocked_when_paper_references_session_type(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """DELETE returns 400 when a CFP paper is using the session type."""
        st = await _create_session_type(client, conference.id, tenant_admin_token, name="Keynote", slug="keynote")
        st_id = uuid.UUID(st["id"])

        await _create_cfp_with_paper(db_session, tenant, conference, session_type_id=st_id)

        resp = await client.delete(
            _url(conference.id, st["id"]),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 400
        assert "Cannot delete" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_separately_bookable_propagates_to_linked_papers(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """Updating separately_bookable on a session type propagates to linked papers."""
        st = await _create_session_type(
            client, conference.id, tenant_admin_token, name="Workshop", slug="workshop", separately_bookable=False
        )
        st_id = uuid.UUID(st["id"])

        paper = await _create_cfp_with_paper(db_session, tenant, conference, session_type_id=st_id)
        assert paper.separately_bookable is False

        resp = await client.put(
            _url(conference.id, st["id"]),
            json={"separately_bookable": True},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200

        await db_session.refresh(paper)
        assert paper.separately_bookable is True

    @pytest.mark.asyncio
    async def test_non_admin_cannot_create_session_type(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
    ) -> None:
        """Regular (non-admin) user cannot create a session type."""
        resp = await client.post(
            _url(conference.id),
            json={"name": "Talk", "slug": "talk", "duration_minutes": 30},
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_non_admin_cannot_delete_session_type(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        regular_user_token: str,
    ) -> None:
        """Regular user cannot delete a session type."""
        st = await _create_session_type(
            client, conference.id, tenant_admin_token, name="Panel", slug="panel"
        )
        resp = await client.delete(
            _url(conference.id, st["id"]),
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403
