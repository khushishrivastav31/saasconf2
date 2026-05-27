"""Regression test: GET /portal/news excludes unpublished articles.

Verifies that:
  - A published article appears in the portal news feed.
  - An unpublished (or re-unpublished) article does NOT appear.
"""

import os
import uuid

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

from app.core.applicant_security import create_applicant_access_token
from app.core.security import create_access_token, hash_password
from app.models.cfp import CFPApplicant, CFPCommitteeMember
from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

PORTAL_BASE = "/api/v1/portal"
ADMIN_BASE = "/api/v1"


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def portal_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="News",
        last_name="Reader",
        email=f"newsreader-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def portal_token(portal_applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(portal_applicant.id, tenant.id)


@pytest.fixture()
def news_admin_token(tenant_admin_user: User) -> str:
    """Tenant admin token with the 'news' module enabled."""
    return create_access_token(
        user_id=tenant_admin_user.id,
        tenant_id=tenant_admin_user.tenant_id,
        role=tenant_admin_user.role,
        modules=["conferences", "news"],
    )


@pytest_asyncio.fixture()
async def committee_access(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    portal_applicant: CFPApplicant,
) -> None:
    """Grant portal access to the conference via committee membership."""
    member = CFPCommitteeMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=portal_applicant.id,
        role="Reviewer",
    )
    db_session.add(member)
    await db_session.commit()


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestPortalNewsVisibility:
    async def test_published_article_appears_in_portal(
        self,
        client: AsyncClient,
        news_admin_token: str,
        conference: Conference,
        portal_token: str,
        committee_access: None,
    ) -> None:
        create_resp = await client.post(
            f"{ADMIN_BASE}/conferences/{conference.id}/news",
            json={"title": "Big News", "body_html": "<p>Hello</p>"},
            headers=auth_headers(news_admin_token),
        )
        assert create_resp.status_code == 201
        article_id = create_resp.json()["id"]

        await client.put(
            f"{ADMIN_BASE}/conferences/{conference.id}/news/{article_id}",
            json={"is_published": True},
            headers=auth_headers(news_admin_token),
        )

        resp = await client.get(
            f"{PORTAL_BASE}/news",
            headers=auth_headers(portal_token),
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["items"]]
        assert article_id in ids

    async def test_unpublished_article_absent_from_portal(
        self,
        client: AsyncClient,
        news_admin_token: str,
        conference: Conference,
        portal_token: str,
        committee_access: None,
    ) -> None:
        create_resp = await client.post(
            f"{ADMIN_BASE}/conferences/{conference.id}/news",
            json={"title": "Gone News", "body_html": "<p>Bye</p>"},
            headers=auth_headers(news_admin_token),
        )
        assert create_resp.status_code == 201
        article_id = create_resp.json()["id"]

        # Publish then immediately unpublish
        for published in (True, False):
            await client.put(
                f"{ADMIN_BASE}/conferences/{conference.id}/news/{article_id}",
                json={"is_published": published},
                headers=auth_headers(news_admin_token),
            )

        resp = await client.get(
            f"{PORTAL_BASE}/news",
            headers=auth_headers(portal_token),
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["items"]]
        assert article_id not in ids
