"""Phase 1 RED — PATCH /portal/unified/me extended profile fields.

Tests confirm the endpoint accepts and persists the full PortalUser profile
field set. Before the backend changes, all non-theme fields are silently
ignored, so all assertions against persisted values will fail.

Scenarios:
  1. PATCH first_name → persisted on PortalUser
  2. PATCH phone → encrypted + hashed correctly
  3. PATCH address fields → persisted
  4. PATCH unknown fields → ignored (no 422)
  5. PATCH multiple fields at once → all persisted
  6. PATCH with None-valued fields → treated as "omit" (no overwrite)
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import encrypt_pii, hash_email, hash_phone
from app.core.security.portal import create_portal_access_token
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_portal_user(db: AsyncSession, tenant: Tenant) -> PortalUser:
    email = f"profile-{uuid.uuid4().hex[:8]}@example.com"
    user = PortalUser(
        tenant_id=tenant.id,
        email_encrypted=encrypt_pii(email),
        email_hash=hash_email(email),
        first_name="Original",
        last_name="Name",
    )
    db.add(user)
    await db.flush()
    return user


def _portal_headers(user: PortalUser) -> dict[str, str]:
    token = create_portal_access_token(user.id, user.tenant_id)
    return {"Authorization": f"Bearer {token}"}


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_first_name(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """PATCH first_name is persisted on PortalUser."""
    user = await _make_portal_user(db_session, tenant)
    await db_session.commit()

    resp = await client.patch(
        "/api/v1/portal/unified/me",
        json={"first_name": "Updated"},
        headers=_portal_headers(user),
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.first_name == "Updated"


@pytest.mark.asyncio
async def test_patch_phone_encrypted_and_hashed(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """PATCH phone → stored as encrypted ciphertext + hash."""
    user = await _make_portal_user(db_session, tenant)
    await db_session.commit()

    resp = await client.patch(
        "/api/v1/portal/unified/me",
        json={"phone": "+1-555-0100"},
        headers=_portal_headers(user),
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.phone_hash == hash_phone("+1-555-0100")
    assert user.phone_encrypted is not None
    assert user.phone_encrypted != "+1-555-0100", "phone must not be stored in plaintext"


@pytest.mark.asyncio
async def test_patch_address_fields(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """PATCH address_line_1, city, postal_code, country are all persisted."""
    user = await _make_portal_user(db_session, tenant)
    await db_session.commit()

    payload = {
        "address_line_1": "123 Main St",
        "address_line_2": "Apt 4B",
        "city": "Springfield",
        "postal_code": "12345",
        "country": "US",
    }
    resp = await client.patch(
        "/api/v1/portal/unified/me",
        json=payload,
        headers=_portal_headers(user),
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.address_line_1 == "123 Main St"
    assert user.address_line_2 == "Apt 4B"
    assert user.city == "Springfield"
    assert user.postal_code == "12345"
    assert user.country == "US"


@pytest.mark.asyncio
async def test_patch_unknown_fields_ignored(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """Extra / unknown fields in the request body must not cause a 422."""
    user = await _make_portal_user(db_session, tenant)
    await db_session.commit()

    resp = await client.patch(
        "/api/v1/portal/unified/me",
        json={"first_name": "Valid", "nonexistent_field": "ignored"},
        headers=_portal_headers(user),
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_patch_multiple_fields_at_once(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """All profile fields can be updated in a single PATCH request."""
    user = await _make_portal_user(db_session, tenant)
    await db_session.commit()

    payload = {
        "first_name": "Alice",
        "last_name": "Wonder",
        "pronouns": "she/her",
        "title": "Engineer",
        "company": "Acme",
        "bio": "Building cool things.",
        "city": "Portland",
        "country": "US",
    }
    resp = await client.patch(
        "/api/v1/portal/unified/me",
        json=payload,
        headers=_portal_headers(user),
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.first_name == "Alice"
    assert user.last_name == "Wonder"
    assert user.pronouns == "she/her"
    assert user.title == "Engineer"
    assert user.company == "Acme"
    assert user.bio == "Building cool things."
    assert user.city == "Portland"
    assert user.country == "US"


@pytest.mark.asyncio
async def test_patch_omitted_fields_not_overwritten(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """Fields absent from the request body are not overwritten with None."""
    user = await _make_portal_user(db_session, tenant)
    user.city = "Denver"
    await db_session.commit()

    resp = await client.patch(
        "/api/v1/portal/unified/me",
        json={"first_name": "Bob"},
        headers=_portal_headers(user),
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.first_name == "Bob"
    assert user.city == "Denver", "city must not be cleared by a PATCH that omits it"
