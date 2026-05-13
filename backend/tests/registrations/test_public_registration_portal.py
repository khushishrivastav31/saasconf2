"""Regression coverage for the public registration portal GET endpoint.

Brandon's QA 1.4.2.4 reported that opening ``/{tenant}/register/{slug}``
returned a generic "Something went wrong" with only SQL queries in the
backend logs. The actual cause was ``conference.settings`` being NULL
(a brand-new conference whose settings had not been touched yet), which
exploded with ``AttributeError: 'NoneType' object has no attribute 'get'``
inside ``resolve_tenant_and_conference``.

These tests lock the fix so the endpoint:

* returns 403 "not enabled" when settings is NULL (instead of 500),
* returns 403 "not enabled" when settings exists but ``enabled`` is False,
* returns 200 when settings flips ``enabled: True``.

Logging side of the fix (``exc_info=exc`` in the catch-all handler) is
covered in ``tests/core/test_unhandled_error_handler.py``.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.conference import Conference
from app.models.tenant import Tenant


@pytest_asyncio.fixture
async def conference_with_null_settings(db_session: AsyncSession, conference: Conference) -> Conference:
    """A conference whose ``settings`` is NULL — simulates a freshly-created
    record where defaults never landed (older data + Pydantic ``settings=None``
    on update).
    """
    conference.settings = None  # type: ignore[assignment]
    flag_modified(conference, "settings")
    await db_session.commit()
    await db_session.refresh(conference)
    return conference


def _url(tenant: Tenant, conference: Conference) -> str:
    return f"/api/v1/portal/{tenant.slug}/conferences/{conference.abbreviation.lower()}"


@pytest.mark.asyncio
class TestPublicConferencePortal:
    async def test_null_settings_returns_403_not_500(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference_with_null_settings: Conference,
    ) -> None:
        """A conference with ``settings=NULL`` must not crash the portal.

        Pre-fix this exploded with AttributeError inside resolve_tenant_and_conference.
        Post-fix it falls through the ``or {}`` guard and surfaces the
        same 403 "not enabled" message users would get for a never-enabled
        portal.
        """
        resp = await client.get(_url(tenant, conference_with_null_settings))
        assert resp.status_code == 403
        assert "not enabled" in resp.json()["detail"].lower()

    async def test_settings_without_portal_section_returns_403(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        db_session: AsyncSession,
    ) -> None:
        """Settings dict exists but the registration portal key is absent → 403."""
        conference.settings = {"some_other_key": True}
        flag_modified(conference, "settings")
        await db_session.commit()

        resp = await client.get(_url(tenant, conference))
        assert resp.status_code == 403

    async def test_enabled_portal_returns_200(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        db_session: AsyncSession,
    ) -> None:
        """Sanity: flipping ``enabled: True`` makes the page reachable."""
        conference.settings = {"public_registration_portal": {"enabled": True}}
        flag_modified(conference, "settings")
        await db_session.commit()

        resp = await client.get(_url(tenant, conference))
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == conference.name
