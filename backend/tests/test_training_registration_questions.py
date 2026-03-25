"""Tests for training registration questions settings API."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified


SAMPLE_QUESTIONS = [
    {
        "id": "q-meal",
        "text": "Do you need a vegetarian meal?",
        "type": "checkbox",
        "required": True,
        "options": [],
        "sort_order": 0,
        "is_active": True,
    },
    {
        "id": "q-tshirt",
        "text": "What T-shirt size do you prefer?",
        "type": "radio",
        "required": True,
        "options": ["S", "M", "L", "XL"],
        "sort_order": 1,
        "is_active": True,
    },
    {
        "id": "q-dietary",
        "text": "Any dietary requirements?",
        "type": "text",
        "required": False,
        "options": [],
        "sort_order": 2,
        "is_active": True,
    },
    {
        "id": "q-transport",
        "text": "How will you travel?",
        "type": "dropdown",
        "required": False,
        "options": ["Car", "Train", "Flight"],
        "sort_order": 3,
        "is_active": True,
    },
]


@pytest_asyncio.fixture
async def configured_tenant(db_session: AsyncSession, tenant):
    """Tenant with training registration questions pre-configured."""
    tenant.settings = {
        **(tenant.settings or {}),
        "training_registration_questions": {
            "enabled": True,
            "questions": SAMPLE_QUESTIONS,
        },
    }
    flag_modified(tenant, "settings")
    await db_session.commit()
    await db_session.refresh(tenant)
    return tenant


@pytest.mark.asyncio
async def test_get_questions_default(client: AsyncClient, tenant_admin_token):
    """GET returns defaults when none configured."""
    resp = await client.get(
        "/api/v1/trainings/registration-questions",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["questions"] == []


@pytest.mark.asyncio
async def test_get_questions_configured(
    client: AsyncClient, configured_tenant, tenant_admin_token
):
    """GET returns saved configuration."""
    resp = await client.get(
        "/api/v1/trainings/registration-questions",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert len(data["questions"]) == 4
    assert data["questions"][0]["id"] == "q-meal"
    assert data["questions"][1]["type"] == "radio"
    assert len(data["questions"][1]["options"]) == 4


@pytest.mark.asyncio
async def test_update_questions(client: AsyncClient, tenant_admin_token):
    """PUT saves questions correctly."""
    resp = await client.put(
        "/api/v1/trainings/registration-questions",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "enabled": True,
            "questions": [SAMPLE_QUESTIONS[0], SAMPLE_QUESTIONS[2]],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert len(data["questions"]) == 2


@pytest.mark.asyncio
async def test_update_radio_requires_options(client: AsyncClient, tenant_admin_token):
    """PUT rejects radio question with < 2 options."""
    resp = await client.put(
        "/api/v1/trainings/registration-questions",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "enabled": True,
            "questions": [
                {
                    "id": "q-bad",
                    "text": "Bad radio",
                    "type": "radio",
                    "required": False,
                    "options": ["Only one"],
                    "sort_order": 0,
                    "is_active": True,
                }
            ],
        },
    )
    assert resp.status_code == 400
    assert "at least 2 options" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_update_duplicate_ids_rejected(client: AsyncClient, tenant_admin_token):
    """PUT rejects duplicate question IDs."""
    q = {**SAMPLE_QUESTIONS[0]}
    resp = await client.put(
        "/api/v1/trainings/registration-questions",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "enabled": True,
            "questions": [q, q],
        },
    )
    assert resp.status_code == 400
    assert "Duplicate" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_requires_admin(client: AsyncClient, regular_user_token):
    """PUT requires tenant admin access."""
    resp = await client.put(
        "/api/v1/trainings/registration-questions",
        headers={"Authorization": f"Bearer {regular_user_token}"},
        json={"enabled": True, "questions": []},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_html_sanitization(client: AsyncClient, tenant_admin_token):
    """PUT sanitizes HTML in question text, help_text, and options."""
    resp = await client.put(
        "/api/v1/trainings/registration-questions",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "enabled": True,
            "questions": [
                {
                    "id": "q-xss",
                    "text": "<p>Question</p><script>alert('xss')</script>",
                    "type": "radio",
                    "required": False,
                    "help_text": "<b>Help</b><script>bad</script>",
                    "options": [
                        "<em>Option A</em><script>x</script>",
                        "<em>Option B</em>",
                    ],
                    "sort_order": 0,
                    "is_active": True,
                }
            ],
        },
    )
    assert resp.status_code == 200
    q = resp.json()["questions"][0]
    assert "<script>" not in q["text"]
    assert "Question" in q["text"]
    assert "<script>" not in q["help_text"]
    assert "Help" in q["help_text"]
    assert "<script>" not in q["options"][0]
    assert "Option A" in q["options"][0]
