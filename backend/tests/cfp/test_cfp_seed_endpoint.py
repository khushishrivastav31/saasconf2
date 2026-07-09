"""Tests for the admin-triggered CFP review-data seeding endpoint.

The endpoint (POST /api/v1/cfp/conferences/{conference_id}/seed-review-data)
lets a tenant admin populate a conference with review test data on dev/staging.
It is inert in production: the environment gate makes it return 404 there.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.user import User
from app.services.cfp_review_seed import is_seeding_allowed
from tests.conftest import _make_token, auth_headers


# ── Environment gate (unit) ──────────────────────────────────────────────
@pytest.mark.parametrize(
    ("env", "allowed"),
    [
        ("development", True),
        ("staging", True),
        ("Development", True),
        ("STAGING", True),
        ("production", False),
        ("prod", False),
        ("test", False),
        ("", False),
        ("anything-else", False),
    ],
)
def test_is_seeding_allowed(env: str, allowed: bool) -> None:
    """Closed-by-default allow-list: only development/staging permit seeding."""
    from types import SimpleNamespace

    assert is_seeding_allowed(SimpleNamespace(SENTRY_ENVIRONMENT=env)) is allowed


# ── Fixtures ─────────────────────────────────────────────────────────────
def _admin_headers(user: User) -> dict[str, str]:
    return auth_headers(_make_token(user, modules=["cfp", "conferences"]))


def _url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/cfp/conferences/{conference_id}/seed-review-data"


async def _final_paper_count(db: AsyncSession) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(CFPPaper).where(CFPPaper.status == PaperStatus.FINAL_CONSIDERATION.value)
        )
    ).scalar() or 0


# ── Endpoint ─────────────────────────────────────────────────────────────
async def test_returns_404_in_production(
    client: AsyncClient,
    conference: Conference,
    tenant_admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Production must not expose the endpoint, even to a valid tenant admin."""
    monkeypatch.setattr(get_settings(), "SENTRY_ENVIRONMENT", "production")
    resp = await client.post(_url(conference.id), headers=_admin_headers(tenant_admin_user), json={})
    assert resp.status_code == 404


async def test_requires_tenant_admin(
    client: AsyncClient,
    conference: Conference,
    regular_user: User,
) -> None:
    resp = await client.post(_url(conference.id), headers=_admin_headers(regular_user), json={})
    assert resp.status_code == 403


async def test_unknown_conference_returns_404(
    client: AsyncClient,
    tenant_admin_user: User,
) -> None:
    resp = await client.post(_url(uuid.uuid4()), headers=_admin_headers(tenant_admin_user), json={})
    assert resp.status_code == 404


async def test_happy_path_seeds_data(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Default env is development → seeding is allowed and returns a summary."""
    resp = await client.post(
        _url(conference.id),
        headers=_admin_headers(tenant_admin_user),
        json={"papers": 4, "reviewers": 2, "must_have": 1},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["evaluated_papers"] >= 4
    assert body["reviewers"] >= 2
    assert body["must_have_papers"] >= 1
    assert body["default_password"]

    assert await _final_paper_count(db_session) >= 4


async def test_idempotent_second_call_creates_no_new_papers(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    headers = _admin_headers(tenant_admin_user)
    payload = {"papers": 3, "reviewers": 2, "must_have": 1}
    first = await client.post(_url(conference.id), headers=headers, json=payload)
    assert first.status_code == 200, first.text

    after_first = await _final_paper_count(db_session)
    second = await client.post(_url(conference.id), headers=headers, json=payload)
    assert second.status_code == 200, second.text
    assert await _final_paper_count(db_session) == after_first


async def test_seeding_creates_no_auth_users(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Seeded speakers/reviewers are CFP applicants only — never auth Users."""
    before = (await db_session.execute(select(func.count()).select_from(User))).scalar() or 0
    resp = await client.post(
        _url(conference.id),
        headers=_admin_headers(tenant_admin_user),
        json={"papers": 3, "reviewers": 2, "must_have": 1},
    )
    assert resp.status_code == 200, resp.text
    after = (await db_session.execute(select(func.count()).select_from(User))).scalar() or 0
    assert after == before


@pytest.mark.parametrize(
    "payload",
    [
        {"papers": 0},
        {"papers": 101},
        {"reviewers": 0},
        {"reviewers": 11},
        {"papers": 3, "must_have": 4},
    ],
)
async def test_rejects_out_of_bounds_input(
    client: AsyncClient,
    conference: Conference,
    tenant_admin_user: User,
    payload: dict,
) -> None:
    resp = await client.post(_url(conference.id), headers=_admin_headers(tenant_admin_user), json=payload)
    assert resp.status_code == 422
