"""Integration tests for paper form variant API endpoints."""

import uuid

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import RLS_BYPASS, auth_headers


def _base_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/paper-form-schema"


def _variants_url(conference_id: uuid.UUID) -> str:
    return f"{_base_url(conference_id)}/variants"


def _variant_url(conference_id: uuid.UUID, variant_id: str) -> str:
    return f"{_variants_url(conference_id)}/{variant_id}"


def _variant_fields_url(conference_id: uuid.UUID, variant_id: str) -> str:
    return f"{_variant_url(conference_id, variant_id)}/fields"


FIELD_PAYLOAD = {
    "field_key": "custom_bio",
    "field_type": "textarea",
    "label": "Short Bio",
    "display_order": 0,
    "is_visible": True,
    "is_required": False,
}


async def _create_user_role(
    db: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    name: str = "Keynote",
) -> str:
    """Create a UserRole and return its id as string."""
    role_id = uuid.uuid4()
    await db.execute(RLS_BYPASS)
    await db.execute(
        text(
            "INSERT INTO user_roles (id, tenant_id, conference_id, name, is_active) "
            "VALUES (:id, :tid, :cid, :name, true)"
        ),
        {"id": role_id, "tid": tenant.id, "cid": conference.id, "name": name},
    )
    await db.commit()
    return str(role_id)


async def _create_variant(
    client: AsyncClient,
    conference: Conference,
    token: str,
    role_id: str,
    name: str = "Keynote Form",
) -> dict:
    """Helper to create a variant and return response data."""
    resp = await client.post(
        _variants_url(conference.id),
        json={"user_role_id": role_id, "name": name},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Schema GET includes variants ─────────────────────────────────────


async def test_schema_includes_variants_key(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """GET schema includes a variants array."""
    resp = await client.get(
        _base_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "variants" in data
    assert isinstance(data["variants"], list)
    assert len(data["variants"]) == 0


# ── Create variant ───────────────────────────────────────────────────


async def test_create_variant(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admin can create a form variant linked to a user role."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)

    data = await _create_variant(client, conference, tenant_admin_token, role_id)

    assert data["name"] == "Keynote Form"
    assert data["user_role_id"] == role_id
    assert data["role_name"] == "Keynote"
    assert data["is_active"] is True
    assert "builtin_fields_config" in data
    assert "title" in data["builtin_fields_config"]
    assert isinstance(data["fields"], list)


async def test_create_variant_duplicate_role_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Creating two variants for the same role is rejected."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)

    await _create_variant(client, conference, tenant_admin_token, role_id)

    resp = await client.post(
        _variants_url(conference.id),
        json={"user_role_id": role_id, "name": "Duplicate"},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 400


# ── List variants ────────────────────────────────────────────────────


async def test_list_variants(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Listing variants returns all created variants."""
    role1 = await _create_user_role(db_session, tenant_with_modules, conference, "Speaker")
    role2 = await _create_user_role(db_session, tenant_with_modules, conference, "Tutorial")

    await _create_variant(client, conference, tenant_admin_token, role1, "Speaker Form")
    await _create_variant(client, conference, tenant_admin_token, role2, "Tutorial Form")

    resp = await client.get(
        _variants_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    names = {v["name"] for v in data["items"]}
    assert names == {"Speaker Form", "Tutorial Form"}


# ── Update variant ───────────────────────────────────────────────────


async def test_update_variant_metadata(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admin can update variant name, description, and active state."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)
    variant = await _create_variant(client, conference, tenant_admin_token, role_id)

    resp = await client.put(
        _variant_url(conference.id, variant["id"]),
        json={"name": "Updated Form", "description": "For keynote speakers", "is_active": False},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated Form"
    assert data["description"] == "For keynote speakers"
    assert data["is_active"] is False


async def test_update_variant_builtin_config(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admin can update variant builtin fields config (e.g. hide abstract_long)."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)
    variant = await _create_variant(client, conference, tenant_admin_token, role_id)

    resp = await client.put(
        _variant_url(conference.id, variant["id"]),
        json={
            "builtin_fields_config": {
                "title": {"visible": True, "required": True},
                "abstract_long": {"visible": False, "required": False},
            }
        },
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    config = resp.json()["builtin_fields_config"]
    # Title always required
    assert config["title"]["required"] is True
    assert config["abstract_long"]["visible"] is False


# ── Delete variant ───────────────────────────────────────────────────


async def test_delete_variant(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admin can delete a variant."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)
    variant = await _create_variant(client, conference, tenant_admin_token, role_id)

    resp = await client.delete(
        _variant_url(conference.id, variant["id"]),
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    assert "deleted" in resp.json()["message"].lower()

    # Verify gone from list
    list_resp = await client.get(
        _variants_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert list_resp.json()["total"] == 0


# ── Variant field CRUD ───────────────────────────────────────────────


async def test_create_variant_field(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admin can add a custom field to a variant."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)
    variant = await _create_variant(client, conference, tenant_admin_token, role_id)

    resp = await client.post(
        _variant_fields_url(conference.id, variant["id"]),
        json=FIELD_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["field_key"] == "custom_bio"
    assert data["label"] == "Short Bio"
    assert data["variant_id"] == variant["id"]


async def test_update_variant_field(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admin can update a variant field."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)
    variant = await _create_variant(client, conference, tenant_admin_token, role_id)

    create_resp = await client.post(
        _variant_fields_url(conference.id, variant["id"]),
        json=FIELD_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    field_id = create_resp.json()["id"]

    resp = await client.put(
        f"{_variant_fields_url(conference.id, variant['id'])}/{field_id}",
        json={"label": "Updated Bio", "is_required": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["label"] == "Updated Bio"
    assert resp.json()["is_required"] is True


async def test_delete_variant_field(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admin can delete a variant field."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)
    variant = await _create_variant(client, conference, tenant_admin_token, role_id)

    create_resp = await client.post(
        _variant_fields_url(conference.id, variant["id"]),
        json=FIELD_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    field_id = create_resp.json()["id"]

    resp = await client.delete(
        f"{_variant_fields_url(conference.id, variant['id'])}/{field_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    assert "deleted" in resp.json()["message"].lower()


async def test_reorder_variant_fields(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admin can reorder variant fields."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)
    variant = await _create_variant(client, conference, tenant_admin_token, role_id)

    fields_url = _variant_fields_url(conference.id, variant["id"])

    f1 = await client.post(
        fields_url,
        json={**FIELD_PAYLOAD, "field_key": "field_a", "label": "Field A", "display_order": 0},
        headers=auth_headers(tenant_admin_token),
    )
    f2 = await client.post(
        fields_url,
        json={**FIELD_PAYLOAD, "field_key": "field_b", "label": "Field B", "display_order": 1},
        headers=auth_headers(tenant_admin_token),
    )

    resp = await client.put(
        f"{fields_url}/reorder",
        json={
            "fields": [
                {"id": f1.json()["id"], "display_order": 1},
                {"id": f2.json()["id"], "display_order": 0},
            ]
        },
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    assert "reordered" in resp.json()["message"].lower()


# ── Variant appears in schema GET ────────────────────────────────────


async def test_variant_in_schema_response(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Variants are included in the GET schema response."""
    role_id = await _create_user_role(db_session, tenant_with_modules, conference)
    await _create_variant(client, conference, tenant_admin_token, role_id)

    resp = await client.get(
        _base_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["variants"]) == 1
    assert data["variants"][0]["role_name"] == "Keynote"
