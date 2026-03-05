"""Comprehensive tests for the news/newsletter feature.

Covers:
- Admin CRUD endpoints (list, create, get, update, delete)
- Publish / unpublish transitions
- Send article as email
- Access control (unauthenticated, cross-tenant)
- Portal endpoints (list published, get published)
- Pending assignment count (portal)
"""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import create_access_token, hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.news import NewsArticle
from app.models.review import PaperReview, ReviewStatus
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _news_url(conference_id: uuid.UUID, path: str = "") -> str:
    """Build a news endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/news"
    if path:
        return f"{base}/{path}"
    return base


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    """Create the 'cfp' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Call for Papers",
        code="cfp",
        description="Call for Papers management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def news_module(db_session: AsyncSession) -> Module:
    """Create the 'news' module."""
    m = Module(
        id=uuid.uuid4(),
        name="News",
        code="news",
        description="News and newsletter management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_cfp(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
    news_module: Module,
) -> Tenant:
    """Associate conferences, cfp, and news modules with the test tenant."""
    for mod in (conferences_module, cfp_module, news_module):
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def news_admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token that includes conferences, cfp, and news modules."""
    return _make_token(tenant_admin_user, modules=["conferences", "cfp", "news"])


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create a CFP applicant for news tests."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def second_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create a second CFP applicant."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="John",
        last_name="Presenter",
        email=f"john-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def draft_article(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> NewsArticle:
    """Create a draft (unpublished) news article."""
    article = NewsArticle(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        title="Draft Article Title",
        body_html="<p>This is a draft article body.</p>",
        is_published=False,
        created_by=tenant_admin_user.id,
    )
    db_session.add(article)
    await db_session.commit()
    await db_session.refresh(article)
    return article


@pytest_asyncio.fixture()
async def published_article(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> NewsArticle:
    """Create a published news article."""
    article = NewsArticle(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        title="Published Article Title",
        body_html="<p>This is a published article body.</p>",
        is_published=True,
        published_at=datetime.now(UTC),
        created_by=tenant_admin_user.id,
    )
    db_session.add(article)
    await db_session.commit()
    await db_session.refresh(article)
    return article


@pytest_asyncio.fixture()
async def cfp_with_paper(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    applicant: CFPApplicant,
) -> CFPPaper:
    """Create a CallForPapers linked to the conference, plus a paper from the applicant."""
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="TestConf CFP 2026",
        status="open",
    )
    db_session.add(cfp)
    await db_session.flush()

    # Link CFP to conference
    db_session.add(
        ConferenceCFP(
            id=uuid.uuid4(),
            conference_id=conference.id,
            cfp_id=cfp.id,
        )
    )

    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Building Async APIs with Python",
        status=PaperStatus.SUBMITTED.value,
    )
    db_session.add(paper)
    await db_session.commit()
    return paper


@pytest_asyncio.fixture()
async def committee_member(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    applicant: CFPApplicant,
) -> CFPCommitteeMember:
    """Create a committee member for the conference."""
    cm = CFPCommitteeMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=applicant.id,
        role="reviewer",
    )
    db_session.add(cm)
    await db_session.commit()
    return cm


# ── Second tenant fixtures for cross-tenant tests ──────────────────────


@pytest_asyncio.fixture()
async def tenant_b(db_session: AsyncSession) -> Tenant:
    """Create a second tenant for cross-tenant isolation tests."""
    t = Tenant(
        id=uuid.uuid4(),
        name="Other Corp",
        slug=f"other-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def tenant_b_admin(db_session: AsyncSession, tenant_b: Tenant) -> User:
    """Create an admin user for tenant B."""
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_b.id,
        email=f"admin-b-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Other",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
async def tenant_b_conference(db_session: AsyncSession, tenant_b: Tenant) -> Conference:
    """Create a conference under tenant B."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant_b.id,
        name="OtherConf 2026",
        abbreviation="OC26",
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def tenant_b_modules(
    db_session: AsyncSession,
    tenant_b: Tenant,
    conferences_module: Module,
    cfp_module: Module,
    news_module: Module,
) -> Tenant:
    """Associate modules with tenant B."""
    for mod in (conferences_module, cfp_module, news_module):
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant_b.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return tenant_b


@pytest_asyncio.fixture()
async def tenant_b_token(tenant_b_admin: User) -> str:
    """Return a valid access token for tenant B's admin."""
    return _make_token(tenant_b_admin, modules=["conferences", "cfp", "news"])


# ═══════════════════════════════════════════════════════════════════════
# 1. ADMIN CRUD TESTS
# ═══════════════════════════════════════════════════════════════════════


class TestCreateArticle:
    """POST /conferences/{id}/news"""

    async def test_create_article(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
    ) -> None:
        """Creates a draft article and returns 201 with all expected fields."""
        url = _news_url(conference.id)
        payload = {
            "title": "Conference Update",
            "body_html": "<p>We have exciting news!</p>",
        }
        response = await client.post(url, json=payload, headers=auth_headers(news_admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Conference Update"
        assert data["body_html"] == "<p>We have exciting news!</p>"
        assert data["is_published"] is False
        assert data["published_at"] is None
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(tenant_with_cfp.id)
        assert data["author_first_name"] == tenant_admin_user.first_name
        assert data["author_last_name"] == tenant_admin_user.last_name
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    async def test_create_article_validates_empty_title(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
    ) -> None:
        """Empty title returns 422 validation error."""
        url = _news_url(conference.id)
        payload = {
            "title": "",
            "body_html": "<p>Some body.</p>",
        }
        response = await client.post(url, json=payload, headers=auth_headers(news_admin_token))

        assert response.status_code == 422


class TestListArticles:
    """GET /conferences/{id}/news"""

    async def test_list_articles(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        draft_article: NewsArticle,
        published_article: NewsArticle,
    ) -> None:
        """Admin sees both draft and published articles. Total reflects count."""
        url = _news_url(conference.id)
        response = await client.get(url, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

        # Verify both articles are in the response
        ids = {item["id"] for item in data["items"]}
        assert str(draft_article.id) in ids
        assert str(published_article.id) in ids

    async def test_list_articles_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
    ) -> None:
        """Returns empty list for conference with no articles."""
        url = _news_url(conference.id)
        response = await client.get(url, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0


class TestGetArticle:
    """GET /conferences/{id}/news/{article_id}"""

    async def test_get_article(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        draft_article: NewsArticle,
    ) -> None:
        """Get by id returns all fields including author names."""
        url = _news_url(conference.id, str(draft_article.id))
        response = await client.get(url, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(draft_article.id)
        assert data["title"] == "Draft Article Title"
        assert data["body_html"] == "<p>This is a draft article body.</p>"
        assert data["is_published"] is False
        assert data["published_at"] is None
        assert data["author_first_name"] == tenant_admin_user.first_name
        assert data["author_last_name"] == tenant_admin_user.last_name
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(tenant_with_cfp.id)
        assert "created_at" in data
        assert "updated_at" in data

    async def test_get_article_not_found(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
    ) -> None:
        """404 for non-existent UUID."""
        fake_id = uuid.uuid4()
        url = _news_url(conference.id, str(fake_id))
        response = await client.get(url, headers=auth_headers(news_admin_token))

        assert response.status_code == 404


class TestUpdateArticle:
    """PUT /conferences/{id}/news/{article_id}"""

    async def test_update_article_title(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        draft_article: NewsArticle,
    ) -> None:
        """Update just the title."""
        url = _news_url(conference.id, str(draft_article.id))
        payload = {"title": "Updated Title"}
        response = await client.put(url, json=payload, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        # Body should remain unchanged
        assert data["body_html"] == draft_article.body_html

    async def test_update_article_body(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        draft_article: NewsArticle,
    ) -> None:
        """Update just the body."""
        url = _news_url(conference.id, str(draft_article.id))
        payload = {"body_html": "<p>New body content.</p>"}
        response = await client.put(url, json=payload, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["body_html"] == "<p>New body content.</p>"
        # Title should remain unchanged
        assert data["title"] == draft_article.title

    async def test_publish_article(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        draft_article: NewsArticle,
    ) -> None:
        """Setting is_published=True sets published_at."""
        url = _news_url(conference.id, str(draft_article.id))
        payload = {"is_published": True}
        response = await client.put(url, json=payload, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["is_published"] is True
        assert data["published_at"] is not None

    async def test_unpublish_article(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        published_article: NewsArticle,
    ) -> None:
        """Setting is_published=False clears published_at."""
        url = _news_url(conference.id, str(published_article.id))
        payload = {"is_published": False}
        response = await client.put(url, json=payload, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["is_published"] is False
        assert data["published_at"] is None


class TestDeleteArticle:
    """DELETE /conferences/{id}/news/{article_id}"""

    async def test_delete_article(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        draft_article: NewsArticle,
    ) -> None:
        """Returns success message."""
        url = _news_url(conference.id, str(draft_article.id))
        response = await client.delete(url, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "deleted" in data["message"].lower()

    async def test_delete_article_not_found(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
    ) -> None:
        """404 for non-existent UUID."""
        fake_id = uuid.uuid4()
        url = _news_url(conference.id, str(fake_id))
        response = await client.delete(url, headers=auth_headers(news_admin_token))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 2. ACCESS CONTROL TESTS
# ═══════════════════════════════════════════════════════════════════════


class TestAccessControl:
    """Access control for news endpoints."""

    async def test_create_article_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        """No token returns 401."""
        url = _news_url(conference.id)
        payload = {
            "title": "Should Fail",
            "body_html": "<p>No auth.</p>",
        }
        response = await client.post(url, json=payload)

        assert response.status_code == 401

    async def test_cross_tenant_article_not_visible(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        draft_article: NewsArticle,
        tenant_b: Tenant,
        tenant_b_admin: User,
        tenant_b_conference: Conference,
        tenant_b_modules: Tenant,
        tenant_b_token: str,
    ) -> None:
        """Article from tenant A is not accessible from tenant B's conference."""
        # Try to get tenant A's article using tenant B's admin and tenant B's conference
        url = _news_url(tenant_b_conference.id, str(draft_article.id))
        response = await client.get(url, headers=auth_headers(tenant_b_token))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 3. SEND TESTS
# ═══════════════════════════════════════════════════════════════════════


class TestSendArticle:
    """POST /conferences/{id}/news/{article_id}/send"""

    async def test_send_article_to_all_applicants(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        published_article: NewsArticle,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
    ) -> None:
        """Sending article to all applicants returns emails_sent count."""
        url = _news_url(conference.id, f"{published_article.id}/send")
        payload = {"all_applicants": True}

        with patch(
            "app.api.v1.news.send_direct_message_email",
            new_callable=AsyncMock,
            return_value=True,
        ):
            response = await client.post(url, json=payload, headers=auth_headers(news_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["emails_sent"] >= 1

    async def test_send_unpublished_article_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        news_admin_token: str,
        conference: Conference,
        draft_article: NewsArticle,
        applicant: CFPApplicant,
    ) -> None:
        """Sending an unpublished article returns 404."""
        url = _news_url(conference.id, f"{draft_article.id}/send")
        payload = {"applicant_ids": [str(applicant.id)]}

        response = await client.post(url, json=payload, headers=auth_headers(news_admin_token))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 4. PORTAL TESTS
# ═══════════════════════════════════════════════════════════════════════


class TestPortalListNews:
    """GET /portal/news"""

    async def test_portal_list_news(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        conference: Conference,
        applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
        published_article: NewsArticle,
    ) -> None:
        """Applicant who submitted a paper sees published articles."""
        token = create_applicant_access_token(applicant.id, tenant_with_cfp.id)
        url = "/api/v1/portal/news"
        response = await client.get(url, headers=auth_headers(token))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

        # The published article should be in the list
        ids = {item["id"] for item in data["items"]}
        assert str(published_article.id) in ids

        # Verify portal response fields
        article_data = next(item for item in data["items"] if item["id"] == str(published_article.id))
        assert article_data["title"] == published_article.title
        assert article_data["body_html"] == published_article.body_html
        assert article_data["conference_id"] == str(conference.id)
        assert article_data["conference_name"] == conference.name
        assert article_data["published_at"] is not None

    async def test_portal_list_news_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        applicant: CFPApplicant,
    ) -> None:
        """Applicant with no papers or memberships sees empty list."""
        token = create_applicant_access_token(applicant.id, tenant_with_cfp.id)
        url = "/api/v1/portal/news"
        response = await client.get(url, headers=auth_headers(token))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0


class TestPortalGetArticle:
    """GET /portal/news/{article_id}"""

    async def test_portal_get_article(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        conference: Conference,
        applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
        published_article: NewsArticle,
    ) -> None:
        """Get single published article by id."""
        token = create_applicant_access_token(applicant.id, tenant_with_cfp.id)
        url = f"/api/v1/portal/news/{published_article.id}"
        response = await client.get(url, headers=auth_headers(token))

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(published_article.id)
        assert data["title"] == published_article.title
        assert data["body_html"] == published_article.body_html
        assert data["conference_id"] == str(conference.id)
        assert data["conference_name"] == conference.name
        assert data["published_at"] is not None

    async def test_portal_get_unpublished_article(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        conference: Conference,
        applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
        draft_article: NewsArticle,
    ) -> None:
        """Unpublished article returns 404 for portal users."""
        token = create_applicant_access_token(applicant.id, tenant_with_cfp.id)
        url = f"/api/v1/portal/news/{draft_article.id}"
        response = await client.get(url, headers=auth_headers(token))

        assert response.status_code == 404

    async def test_portal_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
    ) -> None:
        """No token returns 401 for portal news endpoints."""
        url = "/api/v1/portal/news"
        response = await client.get(url)

        assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════════════
# 5. PENDING ASSIGNMENT COUNT TESTS
# ═══════════════════════════════════════════════════════════════════════


class TestPendingAssignmentCount:
    """GET /portal/assigned-papers/pending-count"""

    async def test_pending_assignment_count_no_memberships(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        applicant: CFPApplicant,
    ) -> None:
        """Applicant with no committee memberships gets pending_count=0."""
        token = create_applicant_access_token(applicant.id, tenant_with_cfp.id)
        url = "/api/v1/portal/assigned-papers/pending-count"
        response = await client.get(url, headers=auth_headers(token))

        assert response.status_code == 200
        data = response.json()
        assert data["pending_count"] == 0

    async def test_pending_assignment_count_with_assignments(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        conference: Conference,
        applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Applicant with unreviewed assignments gets correct pending count."""
        # Create an assignment for the committee member
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant_with_cfp.id,
            paper_id=cfp_with_paper.id,
            committee_member_id=committee_member.id,
        )
        db_session.add(assignment)
        await db_session.commit()

        token = create_applicant_access_token(applicant.id, tenant_with_cfp.id)
        url = "/api/v1/portal/assigned-papers/pending-count"
        response = await client.get(url, headers=auth_headers(token))

        assert response.status_code == 200
        data = response.json()
        assert data["pending_count"] == 1

    async def test_pending_assignment_count_excludes_submitted_reviews(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        conference: Conference,
        applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Assignments with submitted reviews are not counted as pending."""
        # Create an assignment
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant_with_cfp.id,
            paper_id=cfp_with_paper.id,
            committee_member_id=committee_member.id,
        )
        db_session.add(assignment)
        await db_session.flush()

        # Create a submitted review for the assignment
        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant_with_cfp.id,
            assignment_id=assignment.id,
            paper_id=cfp_with_paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            submitted_at=datetime.now(UTC),
        )
        db_session.add(review)
        await db_session.commit()

        token = create_applicant_access_token(applicant.id, tenant_with_cfp.id)
        url = "/api/v1/portal/assigned-papers/pending-count"
        response = await client.get(url, headers=auth_headers(token))

        assert response.status_code == 200
        data = response.json()
        assert data["pending_count"] == 0
