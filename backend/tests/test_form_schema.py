"""Integration tests for the paper form schema API endpoints."""

import uuid

from httpx import AsyncClient

from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers


def _base_url(conference_id: uuid.UUID) -> str:
    """Build the base URL for paper form schema under a conference."""
    return f"/api/v1/conferences/{conference_id}/paper-form-schema"


def _fields_url(conference_id: uuid.UUID) -> str:
    """Build the URL for paper form fields under a conference."""
    return f"/api/v1/conferences/{conference_id}/paper-form-schema/fields"


FIELD_PAYLOAD = {
    "field_key": "custom_notes",
    "field_type": "text",
    "label": "Custom Notes",
    "description": "Additional notes for the paper",
    "placeholder": "Enter your notes...",
    "display_order": 1,
    "is_visible": True,
    "is_required": False,
}


# ── List form fields (get schema) ─────────────────────────────────────


async def test_list_form_fields(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Getting the paper form schema returns the schema with default config."""
    response = await client.get(
        _base_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["conference_id"] == str(conference.id)
    assert data["tenant_id"] == str(conference.tenant_id)
    assert "builtin_fields_config" in data
    assert "fields" in data
    # Default schema should have builtin fields configured
    assert "title" in data["builtin_fields_config"]
    assert data["builtin_fields_config"]["title"]["visible"] is True
    assert data["builtin_fields_config"]["title"]["required"] is True


# ── Create form field ─────────────────────────────────────────────────


async def test_create_form_field(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can create a custom form field and receives 201."""
    response = await client.post(
        _fields_url(conference.id),
        json=FIELD_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["field_key"] == FIELD_PAYLOAD["field_key"]
    assert data["field_type"] == FIELD_PAYLOAD["field_type"]
    assert data["label"] == FIELD_PAYLOAD["label"]
    assert data["description"] == FIELD_PAYLOAD["description"]
    assert data["placeholder"] == FIELD_PAYLOAD["placeholder"]
    assert data["display_order"] == FIELD_PAYLOAD["display_order"]
    assert data["is_visible"] is True
    assert data["is_required"] is False
    assert "id" in data
    assert "schema_id" in data
    assert "created_at" in data


# ── Update form field ─────────────────────────────────────────────────


async def test_update_form_field(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can update a custom form field."""
    # Create field first
    create_resp = await client.post(
        _fields_url(conference.id),
        json=FIELD_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 201
    field_id = create_resp.json()["id"]

    # Update
    response = await client.put(
        f"{_fields_url(conference.id)}/{field_id}",
        json={"label": "Updated Label", "is_required": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["label"] == "Updated Label"
    assert data["is_required"] is True
    # field_key should remain unchanged
    assert data["field_key"] == FIELD_PAYLOAD["field_key"]


# ── Delete form field ─────────────────────────────────────────────────


async def test_delete_form_field(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can delete a custom form field."""
    # Create field first
    create_resp = await client.post(
        _fields_url(conference.id),
        json=FIELD_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 201
    field_id = create_resp.json()["id"]

    # Delete
    response = await client.delete(
        f"{_fields_url(conference.id)}/{field_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "deleted" in data["message"].lower()

    # Verify the field is gone from the schema
    schema_resp = await client.get(
        _base_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert schema_resp.status_code == 200
    field_ids = [f["id"] for f in schema_resp.json()["fields"]]
    assert field_id not in field_ids


# ── Reorder form fields ───────────────────────────────────────────────


async def test_reorder_form_fields(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can reorder custom form fields."""
    # Create two fields
    field1_payload = {
        **FIELD_PAYLOAD,
        "field_key": "field_one",
        "label": "Field One",
        "display_order": 0,
    }
    field2_payload = {
        **FIELD_PAYLOAD,
        "field_key": "field_two",
        "label": "Field Two",
        "display_order": 1,
    }

    resp1 = await client.post(
        _fields_url(conference.id),
        json=field1_payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert resp1.status_code == 201
    field1_id = resp1.json()["id"]

    resp2 = await client.post(
        _fields_url(conference.id),
        json=field2_payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert resp2.status_code == 201
    field2_id = resp2.json()["id"]

    # Reorder: swap the display orders
    reorder_url = f"{_fields_url(conference.id)}/reorder"
    reorder_resp = await client.put(
        reorder_url,
        json={
            "fields": [
                {"id": field1_id, "display_order": 1},
                {"id": field2_id, "display_order": 0},
            ]
        },
        headers=auth_headers(tenant_admin_token),
    )
    assert reorder_resp.status_code == 200
    assert "reordered" in reorder_resp.json()["message"].lower()

    # Verify the new order via schema GET
    schema_resp = await client.get(
        _base_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert schema_resp.status_code == 200
    fields = schema_resp.json()["fields"]
    assert len(fields) == 2
    # Fields are sorted by display_order, so field_two (order 0) comes first
    assert fields[0]["field_key"] == "field_two"
    assert fields[0]["display_order"] == 0
    assert fields[1]["field_key"] == "field_one"
    assert fields[1]["display_order"] == 1
