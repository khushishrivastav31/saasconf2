"""Tests for discount code and paper form schema endpoints.

Covers:
- Discount codes: full CRUD, bulk generation, validation, uniqueness,
  and authorization checks.
- Paper form schema: schema get/update, field CRUD, reorder, has-submissions
  check, and different field types.
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
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token, auth_headers

# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------


def _discount_url(conference_id: uuid.UUID, suffix: str = "") -> str:
    """Build a discount-codes endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/settings/discount-codes"
    return f"{base}/{suffix}" if suffix else base


def _schema_url(conference_id: uuid.UUID, suffix: str = "") -> str:
    """Build a paper-form-schema endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/paper-form-schema"
    return f"{base}/{suffix}" if suffix else base


# ---------------------------------------------------------------------------
# Module fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def registration_module(db_session: AsyncSession) -> Module:
    """Create the 'registration' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Registration",
        code="registration",
        description="Registration management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    """Create the 'cfp' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Call for Papers",
        code="cfp",
        description="CFP management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_registration(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    registration_module: Module,
) -> Tenant:
    """Associate conferences + registration modules with the test tenant."""
    for mod in [conferences_module, registration_module]:
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
async def tenant_with_cfp(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
) -> Tenant:
    """Associate conferences + cfp modules with the test tenant."""
    for mod in [conferences_module, cfp_module]:
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


# ---------------------------------------------------------------------------
# Token fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def reg_admin_token(tenant_admin_user: User) -> str:
    """Token with conferences + registration modules."""
    return _make_token(tenant_admin_user, modules=["conferences", "registration"])


@pytest.fixture()
def cfp_admin_token(tenant_admin_user: User) -> str:
    """Token with conferences + cfp modules."""
    return _make_token(tenant_admin_user, modules=["conferences", "cfp"])


@pytest.fixture()
def no_module_token(tenant_admin_user: User) -> str:
    """Token with conferences module only (no registration/cfp)."""
    return _make_token(tenant_admin_user, modules=["conferences"])


# ---------------------------------------------------------------------------
# Discount code payload helpers
# ---------------------------------------------------------------------------


def _discount_payload(**overrides) -> dict:
    """Build a valid discount code creation payload."""
    data = {
        "description": "Early Bird Discount",
        "code": f"EARLY-{uuid.uuid4().hex[:6].upper()}",
        "discount_type": "percentage",
        "discount_value": 10,
        "max_uses": 100,
        "is_active": True,
    }
    data.update(overrides)
    return data


# ===========================================================================
# Test class: Discount Codes
# ===========================================================================


class TestDiscountCodes:
    """Tests for /api/v1/conferences/{id}/settings/discount-codes endpoints."""

    # -- List (empty) -------------------------------------------------------

    @pytest.mark.asyncio
    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """GET returns an empty list when no discount codes exist."""
        resp = await client.get(
            _discount_url(conference.id),
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["total"] == 0

    # -- Create -------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_discount_code(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST creates a discount code and returns it."""
        payload = _discount_payload(code="SUMMER20", discount_value=20)
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == "SUMMER20"
        assert data["discount_type"] == "percentage"
        assert float(data["discount_value"]) == 20.0
        assert data["max_uses"] == 100
        assert data["usage_count"] == 0
        assert data["is_active"] is True
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(conference.tenant_id)
        assert "id" in data
        assert "created_at" in data

    # -- Create fixed-amount ------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_fixed_discount(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST creates a fixed-amount discount code."""
        payload = _discount_payload(
            code="FLAT50",
            discount_type="fixed",
            discount_value=50,
            currency="EUR",
        )
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["discount_type"] == "fixed"
        assert float(data["discount_value"]) == 50.0
        assert data["currency"] == "EUR"

    # -- List after create --------------------------------------------------

    @pytest.mark.asyncio
    async def test_list_after_create(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """GET returns the created discount code."""
        payload = _discount_payload(code="LIST1")
        await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )

        resp = await client.get(
            _discount_url(conference.id),
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1
        codes = [item["code"] for item in body["items"]]
        assert "LIST1" in codes

    # -- Update -------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_discount_code(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """PUT updates a discount code's description and value."""
        # Create first
        create_resp = await client.post(
            _discount_url(conference.id),
            json=_discount_payload(code="UPD1"),
            headers=auth_headers(reg_admin_token),
        )
        assert create_resp.status_code == 200
        discount_id = create_resp.json()["id"]

        # Update
        update_payload = {
            "description": "Updated Description",
            "discount_value": 25,
        }
        resp = await client.put(
            _discount_url(conference.id, discount_id),
            json=update_payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["description"] == "Updated Description"
        assert float(data["discount_value"]) == 25.0

    # -- Update code with uniqueness check ----------------------------------

    @pytest.mark.asyncio
    async def test_update_code_uniqueness(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """PUT rejects updating code to one that already exists."""
        headers = auth_headers(reg_admin_token)
        url = _discount_url(conference.id)

        # Create two discount codes
        await client.post(url, json=_discount_payload(code="CODEA"), headers=headers)
        resp2 = await client.post(url, json=_discount_payload(code="CODEB"), headers=headers)
        discount_b_id = resp2.json()["id"]

        # Try to rename CODEB to CODEA
        resp = await client.put(
            _discount_url(conference.id, discount_b_id),
            json={"code": "CODEA"},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"]

    # -- Delete -------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_discount_code(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """DELETE removes the discount code."""
        headers = auth_headers(reg_admin_token)
        create_resp = await client.post(
            _discount_url(conference.id),
            json=_discount_payload(code="DEL1"),
            headers=headers,
        )
        discount_id = create_resp.json()["id"]

        resp = await client.delete(
            _discount_url(conference.id, discount_id),
            headers=headers,
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Verify it is gone
        list_resp = await client.get(
            _discount_url(conference.id),
            headers=headers,
        )
        codes = [item["code"] for item in list_resp.json()["items"]]
        assert "DEL1" not in codes

    # -- Delete non-existent ------------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_nonexistent(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """DELETE returns 404 for a non-existent discount code."""
        fake_id = uuid.uuid4()
        resp = await client.delete(
            _discount_url(conference.id, str(fake_id)),
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404

    # -- Duplicate code creation --------------------------------------------

    @pytest.mark.asyncio
    async def test_create_duplicate_code_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST with a duplicate code within the same conference returns 400."""
        headers = auth_headers(reg_admin_token)
        payload = _discount_payload(code="DUPE1")
        resp1 = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=headers,
        )
        assert resp1.status_code == 200

        resp2 = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=headers,
        )
        assert resp2.status_code == 400
        assert "already exists" in resp2.json()["detail"]

    # -- Validation: percentage > 100 ---------------------------------------

    @pytest.mark.asyncio
    async def test_percentage_over_100_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST rejects a percentage discount greater than 100."""
        payload = _discount_payload(
            code="PCT101",
            discount_type="percentage",
            discount_value=101,
        )
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 422

    # -- Validation: discount_value <= 0 ------------------------------------

    @pytest.mark.asyncio
    async def test_zero_discount_value_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST rejects a discount_value of 0."""
        payload = _discount_payload(code="ZERO", discount_value=0)
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 422

    # -- Validation: negative discount_value --------------------------------

    @pytest.mark.asyncio
    async def test_negative_discount_value_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST rejects a negative discount_value."""
        payload = _discount_payload(code="NEG", discount_value=-5)
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 422

    # -- Validation: end_date before start_date -----------------------------

    @pytest.mark.asyncio
    async def test_end_before_start_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST rejects end_date earlier than start_date."""
        payload = _discount_payload(
            code="BADDATE",
            start_date="2026-06-01",
            end_date="2026-05-01",
        )
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 422

    # -- Validation: missing code field -------------------------------------

    @pytest.mark.asyncio
    async def test_missing_code_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST rejects a payload without a code field."""
        payload = {
            "description": "No Code",
            "discount_type": "fixed",
            "discount_value": 10,
        }
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 422

    # -- Auth: unauthenticated access ---------------------------------------

    @pytest.mark.asyncio
    async def test_list_unauthenticated(
        self,
        client: AsyncClient,
        conference: Conference,
    ) -> None:
        """GET without auth returns 401."""
        resp = await client.get(_discount_url(conference.id))
        assert resp.status_code == 401

    # -- Auth: regular user cannot create -----------------------------------

    @pytest.mark.asyncio
    async def test_regular_user_cannot_create(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        regular_user: User,
    ) -> None:
        """POST by a regular user returns 403."""
        token = _make_token(regular_user, modules=["conferences", "registration"])
        resp = await client.post(
            _discount_url(conference.id),
            json=_discount_payload(code="NOREG"),
            headers=auth_headers(token),
        )
        assert resp.status_code == 403

    # -- Create with date range ---------------------------------------------

    @pytest.mark.asyncio
    async def test_create_with_date_range(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST with valid start_date and end_date succeeds."""
        payload = _discount_payload(
            code="DATED",
            start_date="2026-06-01",
            end_date="2026-12-31",
        )
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["start_date"] == "2026-06-01"
        assert data["end_date"] == "2026-12-31"

    # -- Create with is_combinable ------------------------------------------

    @pytest.mark.asyncio
    async def test_create_combinable_code(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST with is_combinable=True is persisted correctly."""
        payload = _discount_payload(code="COMBO", is_combinable=True)
        resp = await client.post(
            _discount_url(conference.id),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_combinable"] is True

    # -- Bulk creation ------------------------------------------------------

    @pytest.mark.asyncio
    async def test_bulk_create_discount_codes(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST /bulk creates multiple discount codes from entries + templates."""
        payload = {
            "code_template": "[ConferenceSlug]-[LastName]-[Counter]",
            "description_template": "Discount for [FullName]",
            "discount_type": "fixed",
            "discount_value": 25,
            "max_uses": 1,
            "is_active": True,
            "entries": [
                {"first_name": "Alice", "last_name": "Smith", "company_name": "Acme", "email": "alice@acme.com"},
                {"first_name": "Bob", "last_name": "Jones", "company_name": "Globex", "email": "bob@globex.com"},
                {
                    "first_name": "Charlie",
                    "last_name": "Brown",
                    "company_name": "Initech",
                    "email": "charlie@initech.com",
                },
            ],
            "counter_start": 1,
            "counter_padding": 3,
        }
        resp = await client.post(
            _discount_url(conference.id, "bulk"),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["created"]) == 3
        # Codes should be uppercase with spaces stripped
        for item in data["created"]:
            assert "-" in item["code"]
            assert float(item["discount_value"]) == 25.0

    # -- Bulk: duplicate generated codes rejected ---------------------------

    @pytest.mark.asyncio
    async def test_bulk_duplicate_generated_codes_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """POST /bulk rejects when template produces duplicate codes."""
        payload = {
            "code_template": "FIXED",
            "description_template": "Desc for [FullName]",
            "discount_type": "percentage",
            "discount_value": 10,
            "entries": [
                {"first_name": "Alice", "last_name": "Smith"},
                {"first_name": "Bob", "last_name": "Jones"},
            ],
            "counter_start": 1,
            "counter_padding": 3,
        }
        resp = await client.post(
            _discount_url(conference.id, "bulk"),
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 400
        assert "duplicate" in resp.json()["detail"].lower()

    # -- Update non-existent ------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_nonexistent(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """PUT returns 404 for a non-existent discount code."""
        fake_id = uuid.uuid4()
        resp = await client.put(
            _discount_url(conference.id, str(fake_id)),
            json={"description": "nope"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404

    # -- Deactivate via update ----------------------------------------------

    @pytest.mark.asyncio
    async def test_deactivate_discount_code(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_registration: Tenant,
        reg_admin_token: str,
    ) -> None:
        """PUT is_active=False deactivates the code."""
        headers = auth_headers(reg_admin_token)
        create_resp = await client.post(
            _discount_url(conference.id),
            json=_discount_payload(code="DEACT1"),
            headers=headers,
        )
        discount_id = create_resp.json()["id"]

        resp = await client.put(
            _discount_url(conference.id, discount_id),
            json={"is_active": False},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False


# ===========================================================================
# Test class: Paper Form Schema
# ===========================================================================


class TestFormSchema:
    """Tests for /api/v1/conferences/{id}/paper-form-schema endpoints."""

    # -- Get schema (auto-creates default) ----------------------------------

    @pytest.mark.asyncio
    async def test_get_schema_creates_default(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """GET auto-creates a default schema if none exists."""
        resp = await client.get(
            _schema_url(conference.id),
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["conference_id"] == str(conference.id)
        assert data["version"] == 1
        assert "title" in data["builtin_fields_config"]
        assert data["builtin_fields_config"]["title"]["visible"] is True
        assert data["builtin_fields_config"]["title"]["required"] is True
        assert data["fields"] == []

    # -- Get schema is idempotent -------------------------------------------

    @pytest.mark.asyncio
    async def test_get_schema_idempotent(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """GET returns the same schema on repeated calls."""
        headers = auth_headers(cfp_admin_token)
        resp1 = await client.get(_schema_url(conference.id), headers=headers)
        resp2 = await client.get(_schema_url(conference.id), headers=headers)
        assert resp1.json()["id"] == resp2.json()["id"]

    # -- Update builtin fields config ---------------------------------------

    @pytest.mark.asyncio
    async def test_update_builtin_config(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """PUT updates the builtin_fields_config."""
        headers = auth_headers(cfp_admin_token)
        # Fetch first to create default
        await client.get(_schema_url(conference.id), headers=headers)

        update_payload = {
            "builtin_fields_config": {
                "title": {"visible": True, "required": True},
                "abstract_short": {"visible": False, "required": False},
                "level": {"visible": True, "required": True},
            },
        }
        resp = await client.put(
            _schema_url(conference.id),
            json=update_payload,
            headers=headers,
        )
        assert resp.status_code == 200
        config = resp.json()["builtin_fields_config"]
        assert config["abstract_short"]["visible"] is False
        assert config["level"]["required"] is True
        # Title must remain required
        assert config["title"]["required"] is True

    # -- Title always required even if set to False -------------------------

    @pytest.mark.asyncio
    async def test_title_always_required(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """PUT cannot set title.required to False; it is forced to True."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        resp = await client.put(
            _schema_url(conference.id),
            json={
                "builtin_fields_config": {
                    "title": {"visible": True, "required": False},
                },
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["builtin_fields_config"]["title"]["required"] is True

    # -- Create field: text -------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_text_field(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields creates a text-type custom field."""
        headers = auth_headers(cfp_admin_token)
        # Ensure schema exists
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "research_area",
            "field_type": "text",
            "label": "Research Area",
            "description": "Your primary research area",
            "placeholder": "e.g. Machine Learning",
            "display_order": 1,
            "is_required": True,
        }
        resp = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["field_key"] == "research_area"
        assert data["field_type"] == "text"
        assert data["label"] == "Research Area"
        assert data["is_required"] is True
        assert data["display_order"] == 1
        assert "id" in data

    # -- Create field: textarea ---------------------------------------------

    @pytest.mark.asyncio
    async def test_create_textarea_field(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields creates a textarea-type field."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "methodology",
            "field_type": "textarea",
            "label": "Methodology",
            "display_order": 2,
        }
        resp = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["field_type"] == "textarea"

    # -- Create field: dropdown with options --------------------------------

    @pytest.mark.asyncio
    async def test_create_dropdown_field(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields creates a dropdown field with options."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "track",
            "field_type": "dropdown",
            "label": "Track",
            "display_order": 3,
            "options": [
                {"value": "web", "label": "Web Development"},
                {"value": "ml", "label": "Machine Learning"},
                {"value": "devops", "label": "DevOps"},
            ],
        }
        resp = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["field_type"] == "dropdown"
        assert len(data["options"]) == 3
        assert data["options"][0]["value"] == "web"

    # -- Create dropdown without options fails ------------------------------

    @pytest.mark.asyncio
    async def test_create_dropdown_without_options_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields rejects a dropdown field without options."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "empty_dropdown",
            "field_type": "dropdown",
            "label": "Empty Dropdown",
            "display_order": 4,
        }
        resp = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 400
        assert "option" in resp.json()["detail"].lower()

    # -- Create field: checkbox_group with options --------------------------

    @pytest.mark.asyncio
    async def test_create_checkbox_group_field(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields creates a checkbox_group field with options."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "topics",
            "field_type": "checkbox_group",
            "label": "Topics",
            "display_order": 5,
            "options": [
                {"value": "ai", "label": "AI"},
                {"value": "cloud", "label": "Cloud"},
            ],
        }
        resp = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["field_type"] == "checkbox_group"

    # -- Duplicate field_key rejected ---------------------------------------

    @pytest.mark.asyncio
    async def test_duplicate_field_key_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields rejects a duplicate field_key within the same schema."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "unique_field",
            "field_type": "text",
            "label": "Unique Field",
            "display_order": 0,
        }
        resp1 = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp1.status_code == 201

        resp2 = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp2.status_code == 400
        assert "already exists" in resp2.json()["detail"]

    # -- Update field -------------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_field(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """PUT /fields/{id} updates a field label and requirement."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        # Create
        create_resp = await client.post(
            _schema_url(conference.id, "fields"),
            json={
                "field_key": "updatable_field",
                "field_type": "text",
                "label": "Original Label",
                "display_order": 0,
            },
            headers=headers,
        )
        field_id = create_resp.json()["id"]

        # Update
        resp = await client.put(
            _schema_url(conference.id, f"fields/{field_id}"),
            json={"label": "New Label", "is_required": True},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["label"] == "New Label"
        assert data["is_required"] is True

    # -- Update field key uniqueness ----------------------------------------

    @pytest.mark.asyncio
    async def test_update_field_key_uniqueness(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """PUT /fields/{id} rejects renaming field_key to an existing one."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        # Create two fields
        await client.post(
            _schema_url(conference.id, "fields"),
            json={"field_key": "key_alpha", "field_type": "text", "label": "Alpha", "display_order": 0},
            headers=headers,
        )
        r2 = await client.post(
            _schema_url(conference.id, "fields"),
            json={"field_key": "key_beta", "field_type": "text", "label": "Beta", "display_order": 1},
            headers=headers,
        )
        field_b_id = r2.json()["id"]

        # Try to rename key_beta to key_alpha
        resp = await client.put(
            _schema_url(conference.id, f"fields/{field_b_id}"),
            json={"field_key": "key_alpha"},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"]

    # -- Delete field -------------------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_field(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """DELETE /fields/{id} removes a custom field."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        create_resp = await client.post(
            _schema_url(conference.id, "fields"),
            json={"field_key": "disposable", "field_type": "text", "label": "Disposable", "display_order": 0},
            headers=headers,
        )
        field_id = create_resp.json()["id"]

        resp = await client.delete(
            _schema_url(conference.id, f"fields/{field_id}"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Verify it is gone by fetching schema
        schema_resp = await client.get(_schema_url(conference.id), headers=headers)
        field_keys = [f["field_key"] for f in schema_resp.json()["fields"]]
        assert "disposable" not in field_keys

    # -- Delete non-existent field ------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_nonexistent_field(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """DELETE /fields/{id} returns 404 for a non-existent field."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        resp = await client.delete(
            _schema_url(conference.id, f"fields/{uuid.uuid4()}"),
            headers=headers,
        )
        assert resp.status_code == 404

    # -- Reorder fields -----------------------------------------------------

    @pytest.mark.asyncio
    async def test_reorder_fields(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """PUT /fields/reorder changes the display_order of fields."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        # Create three fields
        ids = []
        for i, key in enumerate(["reord_a", "reord_b", "reord_c"]):
            r = await client.post(
                _schema_url(conference.id, "fields"),
                json={"field_key": key, "field_type": "text", "label": key, "display_order": i},
                headers=headers,
            )
            ids.append(r.json()["id"])

        # Reorder: c=0, a=1, b=2
        reorder_payload = {
            "fields": [
                {"id": ids[2], "display_order": 0},
                {"id": ids[0], "display_order": 1},
                {"id": ids[1], "display_order": 2},
            ],
        }
        resp = await client.put(
            _schema_url(conference.id, "fields/reorder"),
            json=reorder_payload,
            headers=headers,
        )
        assert resp.status_code == 200

        # Verify order via schema fetch
        schema_resp = await client.get(_schema_url(conference.id), headers=headers)
        fields = schema_resp.json()["fields"]
        assert fields[0]["field_key"] == "reord_c"
        assert fields[1]["field_key"] == "reord_a"
        assert fields[2]["field_key"] == "reord_b"

    # -- Has submissions: no papers -----------------------------------------

    @pytest.mark.asyncio
    async def test_has_submissions_false(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """GET /has-submissions returns false when no papers exist."""
        resp = await client.get(
            _schema_url(conference.id, "has-submissions"),
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_submissions"] is False
        assert data["submission_count"] == 0

    # -- Has submissions: with papers ---------------------------------------

    @pytest.mark.asyncio
    async def test_has_submissions_true(
        self,
        db_session: AsyncSession,
        client: AsyncClient,
        conference: Conference,
        tenant: Tenant,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """GET /has-submissions returns true when papers exist for the conference."""
        # Create a CFP
        cfp = CallForPapers(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            title="Test CFP",
            status="open",
        )
        db_session.add(cfp)
        await db_session.flush()

        # Link CFP to conference
        conference_cfp = ConferenceCFP(
            id=uuid.uuid4(),
            conference_id=conference.id,
            cfp_id=cfp.id,
        )
        db_session.add(conference_cfp)
        await db_session.flush()

        # Create an applicant
        applicant = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name="Jane",
            last_name="Doe",
            email="jane.doe@test.com",
            password_hash="hashed_password",
        )
        db_session.add(applicant)
        await db_session.flush()

        # Create a paper
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Test Paper",
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.get(
            _schema_url(conference.id, "has-submissions"),
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_submissions"] is True
        assert data["submission_count"] >= 1

    # -- Auth: unauthenticated access to schema -----------------------------

    @pytest.mark.asyncio
    async def test_get_schema_unauthenticated(
        self,
        client: AsyncClient,
        conference: Conference,
    ) -> None:
        """GET without auth returns 401."""
        resp = await client.get(_schema_url(conference.id))
        assert resp.status_code == 401

    # -- Auth: regular user cannot access schema ----------------------------

    @pytest.mark.asyncio
    async def test_regular_user_cannot_access_schema(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        regular_user: User,
    ) -> None:
        """GET by a regular user returns 403 (tenant admin required)."""
        token = _make_token(regular_user, modules=["conferences", "cfp"])
        resp = await client.get(
            _schema_url(conference.id),
            headers=auth_headers(token),
        )
        assert resp.status_code == 403

    # -- Create field with validation rules ---------------------------------

    @pytest.mark.asyncio
    async def test_create_field_with_validation_rules(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields creates a field with validation rules."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "bio",
            "field_type": "textarea",
            "label": "Biography",
            "display_order": 10,
            "is_required": True,
            "validation_rules": {
                "min_length": 50,
                "max_length": 500,
            },
        }
        resp = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["validation_rules"]["min_length"] == 50
        assert data["validation_rules"]["max_length"] == 500

    # -- Create file_upload field -------------------------------------------

    @pytest.mark.asyncio
    async def test_create_file_upload_field(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields creates a file_upload-type field with validation."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "slides",
            "field_type": "file_upload",
            "label": "Slides (PDF)",
            "display_order": 20,
            "validation_rules": {
                "allowed_file_types": ["pdf", "pptx"],
                "max_file_size_mb": 10,
            },
        }
        resp = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["field_type"] == "file_upload"
        rules = data["validation_rules"]
        assert "pdf" in rules["allowed_file_types"]
        assert rules["max_file_size_mb"] == 10

    # -- Schema shows fields in correct order after creation ----------------

    @pytest.mark.asyncio
    async def test_schema_returns_fields_ordered(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """GET schema returns fields sorted by display_order."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        # Create fields in reverse order
        for i, key in enumerate(["field_z", "field_m", "field_a"]):
            await client.post(
                _schema_url(conference.id, "fields"),
                json={
                    "field_key": key,
                    "field_type": "text",
                    "label": key,
                    "display_order": 2 - i,  # z=2, m=1, a=0
                },
                headers=headers,
            )

        resp = await client.get(_schema_url(conference.id), headers=headers)
        fields = resp.json()["fields"]
        orders = [f["display_order"] for f in fields]
        assert orders == sorted(orders)

    # -- Invalid field_key pattern ------------------------------------------

    @pytest.mark.asyncio
    async def test_invalid_field_key_pattern(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_cfp: Tenant,
        cfp_admin_token: str,
    ) -> None:
        """POST /fields rejects field_key that does not match ^[a-z][a-z0-9_]*$."""
        headers = auth_headers(cfp_admin_token)
        await client.get(_schema_url(conference.id), headers=headers)

        payload = {
            "field_key": "InvalidKey",
            "field_type": "text",
            "label": "Bad Key",
            "display_order": 0,
        }
        resp = await client.post(
            _schema_url(conference.id, "fields"),
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 422
