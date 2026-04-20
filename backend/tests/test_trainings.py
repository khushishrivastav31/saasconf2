"""Integration tests for the training CRUD API endpoints."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token, auth_headers

BASE_URL = "/api/v1/trainings"

TRAINING_PAYLOAD = {
    "name": "Python Bootcamp",
    "abbreviation": "PB",
    "description": "A test training",
    "start_date": "2026-09-01",
    "end_date": "2026-09-05",
    "city": "Berlin",
    "country": "Germany",
    "venue_type": "onsite",
}


# ── Helpers ──────────────────────────────────────────────────────────────


async def _enable_trainings_module(db_session: AsyncSession, tenant: Tenant) -> Module:
    """Create the 'trainings' module and associate it with the tenant."""
    m = Module(
        id=uuid.uuid4(),
        name="Trainings",
        code="trainings",
        description="Training management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.flush()
    tm = TenantModule(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        module_id=m.id,
        is_enabled=True,
    )
    db_session.add(tm)
    await db_session.commit()
    return m


def _admin_token_with_trainings(user: User) -> str:
    """Create a tenant admin token that includes the trainings module."""
    return _make_token(user, modules=["trainings"])


def _regular_token_with_trainings(user: User) -> str:
    """Create a regular user token that includes the trainings module."""
    return _make_token(user, modules=["trainings"])


async def _create_training_via_api(
    client: AsyncClient,
    token: str,
    payload: dict | None = None,
) -> dict:
    """Helper to create a training and return the JSON response."""
    response = await client.post(
        BASE_URL,
        json=payload or TRAINING_PAYLOAD,
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()


# ── List trainings ───────────────────────────────────────────────────────


async def test_list_trainings_empty(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Tenant admin listing trainings returns an empty list when none exist."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    response = await client.get(BASE_URL, headers=auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


async def test_list_trainings_with_one(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Tenant admin listing trainings returns the created training."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    response = await client.get(BASE_URL, headers=auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == created["id"]
    assert data["items"][0]["name"] == TRAINING_PAYLOAD["name"]


async def test_list_trainings_search(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Search filter narrows training list results."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    await _create_training_via_api(client, token, {**TRAINING_PAYLOAD, "name": "Alpha Training"})
    await _create_training_via_api(client, token, {**TRAINING_PAYLOAD, "name": "Beta Workshop", "abbreviation": "BW"})

    response = await client.get(BASE_URL, params={"search": "Alpha"}, headers=auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Alpha Training"


async def test_list_trainings_pagination(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Pagination parameters work correctly."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    for i in range(3):
        await _create_training_via_api(
            client, token, {**TRAINING_PAYLOAD, "name": f"Training {i}", "abbreviation": f"T{i}"}
        )

    response = await client.get(BASE_URL, params={"page": 1, "page_size": 2}, headers=auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["pages"] == 2


async def test_list_trainings_is_active_filter(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Filtering by is_active returns only matching trainings."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    # Deactivate the training
    await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"is_active": False},
        headers=auth_headers(token),
    )

    response = await client.get(BASE_URL, params={"is_active": "true"}, headers=auth_headers(token))
    assert response.status_code == 200
    assert response.json()["total"] == 0

    response = await client.get(BASE_URL, params={"is_active": "false"}, headers=auth_headers(token))
    assert response.status_code == 200
    assert response.json()["total"] == 1


# ── Create training ──────────────────────────────────────────────────────


async def test_create_training_success(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can create a training and receives 201."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    response = await client.post(
        BASE_URL,
        json=TRAINING_PAYLOAD,
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == TRAINING_PAYLOAD["name"]
    assert data["abbreviation"] == TRAINING_PAYLOAD["abbreviation"]
    assert data["description"] == TRAINING_PAYLOAD["description"]
    assert data["start_date"] == TRAINING_PAYLOAD["start_date"]
    assert data["end_date"] == TRAINING_PAYLOAD["end_date"]
    assert data["city"] == TRAINING_PAYLOAD["city"]
    assert data["country"] == TRAINING_PAYLOAD["country"]
    assert data["venue_type"] == TRAINING_PAYLOAD["venue_type"]
    assert data["is_active"] is True
    assert "id" in data
    assert "tenant_id" in data


async def test_create_training_forbidden_for_regular_user(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    regular_user: User,
) -> None:
    """Regular user (non-admin) gets 403 when trying to create a training."""
    await _enable_trainings_module(db_session, tenant)
    token = _regular_token_with_trainings(regular_user)

    response = await client.post(
        BASE_URL,
        json=TRAINING_PAYLOAD,
        headers=auth_headers(token),
    )
    assert response.status_code == 403


async def test_create_training_with_team_members(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Training can be created with team_members JSONB data."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    payload = {
        **TRAINING_PAYLOAD,
        "team_members": [
            {"first_name": "Alice", "last_name": "Smith", "email": "alice@example.com", "is_manager": True},
            {"first_name": "Bob", "last_name": "Jones", "role": "Instructor", "is_manager": False},
        ],
    }
    response = await client.post(BASE_URL, json=payload, headers=auth_headers(token))
    assert response.status_code == 201
    data = response.json()
    assert data["team_count"] == 2
    assert data["managers_count"] == 1
    assert data["team_members"][0]["first_name"] == "Alice"
    assert data["team_members"][0]["is_manager"] is True
    assert data["team_members"][1]["first_name"] == "Bob"
    assert data["team_members"][1]["is_manager"] is False


async def test_create_training_with_currency(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can create a training with a currency."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    payload = {**TRAINING_PAYLOAD, "currency": "EUR"}
    response = await client.post(BASE_URL, json=payload, headers=auth_headers(token))
    assert response.status_code == 201
    assert response.json()["currency"] == "EUR"


async def test_create_training_without_currency(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Training created without currency has null currency."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    response = await client.post(BASE_URL, json=TRAINING_PAYLOAD, headers=auth_headers(token))
    assert response.status_code == 201
    assert response.json()["currency"] is None


async def test_invalid_currency_length(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Currency code must be exactly 3 characters."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    payload = {**TRAINING_PAYLOAD, "currency": "EU"}
    response = await client.post(BASE_URL, json=payload, headers=auth_headers(token))
    assert response.status_code == 422


async def test_create_training_with_contact_emails(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Training can be created with support and contact emails."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    payload = {
        **TRAINING_PAYLOAD,
        "support_email": "support@example.com",
        "contact_email": "contact@example.com",
    }
    response = await client.post(BASE_URL, json=payload, headers=auth_headers(token))
    assert response.status_code == 201
    data = response.json()
    assert data["support_email"] == "support@example.com"
    assert data["contact_email"] == "contact@example.com"


# ── Get training by ID ───────────────────────────────────────────────────


async def test_get_training_by_id(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Get a training by ID returns the correct training."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    response = await client.get(
        f"{BASE_URL}/{created['id']}",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == created["id"]
    assert data["name"] == TRAINING_PAYLOAD["name"]
    assert data["abbreviation"] == TRAINING_PAYLOAD["abbreviation"]
    assert data["tenant_id"] == created["tenant_id"]


async def test_get_training_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Get a non-existent training returns 404."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    fake_id = uuid.uuid4()
    response = await client.get(
        f"{BASE_URL}/{fake_id}",
        headers=auth_headers(token),
    )
    assert response.status_code == 404


# ── Update training ──────────────────────────────────────────────────────


async def test_update_training_name(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can update a training name."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)
    new_name = "Updated Training Name"

    response = await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"name": new_name},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == created["id"]
    assert data["name"] == new_name


async def test_update_training_partial(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Partial update only changes the provided fields."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    response = await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"city": "Munich", "country": "Germany"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["city"] == "Munich"
    assert data["country"] == "Germany"
    # Original name should remain unchanged
    assert data["name"] == TRAINING_PAYLOAD["name"]


async def test_update_training_team_members(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Updating team_members JSONB field persists correctly."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    team = [
        {"first_name": "Carol", "last_name": "White", "is_manager": True},
        {"first_name": "Dave", "last_name": "Black", "role": "Facilitator", "is_manager": False},
    ]
    response = await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"team_members": team},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["team_count"] == 2
    assert data["managers_count"] == 1
    assert data["team_members"][0]["first_name"] == "Carol"
    assert data["team_members"][1]["first_name"] == "Dave"


async def test_update_training_team_members_empty_strings_become_null(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Empty string values for email, phone, role in team_members become null."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    team = [{"first_name": "Eve", "last_name": "Gray", "email": "", "phone": "", "role": ""}]
    response = await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"team_members": team},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    tm = data["team_members"][0]
    assert tm["email"] is None
    assert tm["phone"] is None
    assert tm["role"] is None


async def test_update_training_currency(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can update training currency."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    response = await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"currency": "USD"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["currency"] == "USD"


async def test_update_training_is_active(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can deactivate a training."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    response = await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"is_active": False},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False


async def test_update_training_phone(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can set training phone."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    response = await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"phone": "+4930123456"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["phone"] == "+4930123456"


async def test_update_training_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Updating a non-existent training returns 404."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    fake_id = uuid.uuid4()
    response = await client.put(
        f"{BASE_URL}/{fake_id}",
        json={"name": "Ghost"},
        headers=auth_headers(token),
    )
    assert response.status_code == 404


# ── Delete training ──────────────────────────────────────────────────────


async def test_delete_training_requires_super_user(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Regular tenant admin cannot delete a training (requires super user)."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    created = await _create_training_via_api(client, token)

    response = await client.delete(
        f"{BASE_URL}/{created['id']}",
        headers=auth_headers(token),
    )
    assert response.status_code == 403


async def test_delete_training(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    super_admin_user: User,
    tenant_admin_user: User,
) -> None:
    """Super admin can delete a deactivated training."""
    await _enable_trainings_module(db_session, tenant)
    admin_token = _admin_token_with_trainings(tenant_admin_user)
    super_token = _make_token(super_admin_user)

    created = await _create_training_via_api(client, admin_token)

    # Deactivate first (required before deletion)
    deactivate_response = await client.put(
        f"{BASE_URL}/{created['id']}",
        json={"is_active": False},
        headers=auth_headers(super_token),
    )
    assert deactivate_response.status_code == 200

    # Now delete
    response = await client.delete(
        f"{BASE_URL}/{created['id']}",
        headers=auth_headers(super_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "deleted" in data["message"].lower()

    # Verify the training no longer exists
    get_response = await client.get(
        f"{BASE_URL}/{created['id']}",
        headers=auth_headers(super_token),
    )
    assert get_response.status_code == 404


async def test_delete_active_training_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    super_admin_user: User,
    tenant_admin_user: User,
) -> None:
    """Deleting an active training is rejected with a validation error."""
    await _enable_trainings_module(db_session, tenant)
    admin_token = _admin_token_with_trainings(tenant_admin_user)
    super_token = _make_token(super_admin_user)

    created = await _create_training_via_api(client, admin_token)

    response = await client.delete(
        f"{BASE_URL}/{created['id']}",
        headers=auth_headers(super_token),
    )
    # Should fail because training is still active
    assert response.status_code == 400


async def test_delete_training_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    super_admin_user: User,
) -> None:
    """Deleting a non-existent training returns 404."""
    await _enable_trainings_module(db_session, tenant)
    super_token = _make_token(super_admin_user)

    fake_id = uuid.uuid4()
    response = await client.delete(
        f"{BASE_URL}/{fake_id}",
        headers=auth_headers(super_token),
    )
    assert response.status_code == 404


# ── Stats ────────────────────────────────────────────────────────────────


async def test_get_training_stats_empty(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Stats endpoint returns zeroes when no trainings exist."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    response = await client.get(
        f"{BASE_URL}/stats/summary",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["active"] == 0
    assert data["upcoming"] == 0
    assert data["ongoing"] == 0
    assert data["past"] == 0


async def test_get_training_stats_with_training(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Stats endpoint counts the existing training."""
    await _enable_trainings_module(db_session, tenant)
    token = _admin_token_with_trainings(tenant_admin_user)

    await _create_training_via_api(client, token)

    response = await client.get(
        f"{BASE_URL}/stats/summary",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["active"] == 1
