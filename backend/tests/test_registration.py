"""Tests for the Registration module: schema validation and API integration."""

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

from app.core.security import create_access_token
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.registration import (
    AttendeeData,
    BillingProfileCreate,
    BulkAttendeeData,
    BulkRegistrationCreate,
    RegistrationStatus,
    RegistrationUpdate,
)
from tests.conftest import auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


BILLING_PAYLOAD = {
    "company_name": "Test GmbH",
    "street": "Hauptstr. 1",
    "postal_code": "10115",
    "city": "Berlin",
    "country": "DE",
    "contact_first_name": "Max",
    "contact_last_name": "Mustermann",
    "contact_phone": "+491701234567",
    "contact_email": "billing@test.de",
    "vat_number": "DE123456789",
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def registration_module(db_session: AsyncSession) -> Module:
    """Create the 'registration' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Registration",
        code="registration",
        description="Conference registration",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_reg_module(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    registration_module: Module,
) -> Tenant:
    """Tenant with both conferences + registration modules enabled."""
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


@pytest.fixture()
def reg_admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "registration"])


@pytest_asyncio.fixture()
async def main_booking_option(
    db_session: AsyncSession, tenant: Tenant, conference: Conference
) -> BookingOption:
    """Create a test booking option for registration (the main ticket option)."""
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Conference",
        description="Full conference pass including all days",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest_asyncio.fixture()
async def addon_booking_option(
    db_session: AsyncSession, tenant: Tenant, conference: Conference
) -> BookingOption:
    """Create a test booking option for add-on items."""
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


# ---------------------------------------------------------------------------
# Unit tests — Schema validation
# ---------------------------------------------------------------------------


class TestAttendeeDataValidation:
    """Tests for AttendeeData schema validation."""

    def test_valid_attendee(self):
        a = AttendeeData(
            first_name="John", last_name="Doe", email="john@example.com"
        )
        assert a.first_name == "John"
        assert a.email == "john@example.com"

    def test_email_lowercased(self):
        a = AttendeeData(
            first_name="John", last_name="Doe", email="JOHN@Example.COM"
        )
        assert a.email == "john@example.com"

    def test_missing_first_name_raises(self):
        with pytest.raises(Exception):
            AttendeeData(first_name="", last_name="Doe", email="john@example.com")

    def test_invalid_email_raises(self):
        with pytest.raises(Exception):
            AttendeeData(first_name="John", last_name="Doe", email="not-an-email")

    def test_pronouns_optional(self):
        a = AttendeeData(first_name="John", last_name="Doe", email="john@example.com")
        assert a.pronouns is None

    def test_pronouns_stored(self):
        a = AttendeeData(
            first_name="John", last_name="Doe", email="john@example.com", pronouns="he/him"
        )
        assert a.pronouns == "he/him"


class TestBillingProfileValidation:
    """Tests for BillingProfileCreate schema validation."""

    def test_valid_billing(self):
        b = BillingProfileCreate(**BILLING_PAYLOAD)
        assert b.company_name == "Test GmbH"
        assert b.street == "Hauptstr. 1"

    def test_missing_street_raises(self):
        payload = {**BILLING_PAYLOAD}
        del payload["street"]
        with pytest.raises(Exception):
            BillingProfileCreate(**payload)

    def test_company_name_optional(self):
        payload = {**BILLING_PAYLOAD, "company_name": None}
        b = BillingProfileCreate(**payload)
        assert b.company_name is None

    def test_contact_first_and_last_name(self):
        b = BillingProfileCreate(**BILLING_PAYLOAD)
        assert b.contact_first_name == "Max"
        assert b.contact_last_name == "Mustermann"

    def test_missing_contact_last_name_raises(self):
        payload = {**BILLING_PAYLOAD}
        del payload["contact_last_name"]
        with pytest.raises(Exception):
            BillingProfileCreate(**payload)


class TestBulkRegistrationValidation:
    """Tests for BulkRegistrationCreate schema validation."""

    def test_duplicate_emails_in_bulk_raises(self):
        pkg_id = uuid.uuid4()
        with pytest.raises(Exception, match="Duplicate email"):
            BulkRegistrationCreate(
                billing=BillingProfileCreate(**BILLING_PAYLOAD),
                attendees=[
                    BulkAttendeeData(
                        first_name="A",
                        last_name="B",
                        email="same@email.com",
                        booking_option_id=pkg_id,
                    ),
                    BulkAttendeeData(
                        first_name="C",
                        last_name="D",
                        email="same@email.com",
                        booking_option_id=pkg_id,
                    ),
                ],
            )

    def test_empty_attendees_list_raises(self):
        with pytest.raises(Exception):
            BulkRegistrationCreate(
                billing=BillingProfileCreate(**BILLING_PAYLOAD),
                attendees=[],
            )


class TestRegistrationUpdateValidation:
    """Tests for RegistrationUpdate schema."""

    def test_partial_update(self):
        u = RegistrationUpdate(first_name="Updated")
        assert u.first_name == "Updated"
        assert u.email is None

    def test_status_enum_valid(self):
        u = RegistrationUpdate(status=RegistrationStatus.PAID)
        assert u.status == "paid"

    def test_status_enum_invalid_raises(self):
        with pytest.raises(Exception):
            RegistrationUpdate(status="invalid_status")


# ---------------------------------------------------------------------------
# Integration tests — API endpoints
# ---------------------------------------------------------------------------


BASE = "/api/v1/conferences"


async def test_list_registrations_empty(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
) -> None:
    """List registrations returns empty list when none exist."""
    response = await client.get(
        f"{BASE}/{conference.id}/registrations",
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


async def test_create_individual_registration(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Create an individual registration successfully."""
    payload = {
        "attendee": {
            "first_name": "Alice",
            "last_name": "Smith",
            "email": "alice@example.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["first_name"] == "Alice"
    assert data["last_name"] == "Smith"
    assert data["email"] == "alice@example.com"
    assert data["status"] == "registered_pending_invoice"
    assert data["registration_mode"] == "individual"
    assert data["booking_option_name"] == "Full Conference"
    assert data["billing_company_name"] == "Test GmbH"


async def test_create_individual_registration_with_pronouns(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Create a registration with pronouns and verify they persist."""
    payload = {
        "attendee": {
            "first_name": "Alex",
            "last_name": "Pronoun",
            "email": "alex@pronouns.com",
            "pronouns": "they/them",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["pronouns"] == "they/them"

    # Verify on fetch
    get_resp = await client.get(
        f"{BASE}/{conference.id}/registrations/{data['id']}",
        headers=auth_headers(reg_admin_token),
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["pronouns"] == "they/them"


async def test_create_company_registration(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Create a company (single employee) registration."""
    payload = {
        "attendee": {
            "first_name": "Bob",
            "last_name": "Jones",
            "email": "bob@company.com",
            "job_title": "Engineer",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations/company",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["registration_mode"] == "company_single"
    assert data["job_title"] == "Engineer"


async def test_create_bulk_registration(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Create a bulk registration with 3 attendees."""
    payload = {
        "billing": BILLING_PAYLOAD,
        "attendees": [
            {
                "first_name": f"Person{i}",
                "last_name": "Test",
                "email": f"person{i}@bulk.com",
                "booking_option_id": str(main_booking_option.id),
            }
            for i in range(3)
        ],
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations/bulk",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["total_created"] == 3
    assert len(data["registrations"]) == 3
    # All share same billing profile
    bp_ids = {r["billing_profile_id"] for r in data["registrations"]}
    assert len(bp_ids) == 1


async def test_duplicate_email_rejected(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Creating a second registration with the same email returns 400."""
    payload = {
        "attendee": {
            "first_name": "Carol",
            "last_name": "Dup",
            "email": "carol@dup.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    # First registration succeeds
    r1 = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert r1.status_code == 201

    # Second with same email fails
    r2 = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert r2.status_code == 400


async def test_invalid_package_rejected(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
) -> None:
    """Registration with non-existent package returns 400."""
    payload = {
        "attendee": {
            "first_name": "Dave",
            "last_name": "Fake",
            "email": "dave@fake.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(uuid.uuid4()),
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 400


async def test_get_registration_by_id(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Get a single registration by ID."""
    # Create first
    payload = {
        "attendee": {
            "first_name": "Eve",
            "last_name": "Get",
            "email": "eve@get.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    create_resp = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_resp.json()["id"]

    # Fetch
    response = await client.get(
        f"{BASE}/{conference.id}/registrations/{reg_id}",
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == reg_id
    assert data["first_name"] == "Eve"


async def test_update_registration_status(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Update a registration status from pending to paid."""
    # Create
    payload = {
        "attendee": {
            "first_name": "Frank",
            "last_name": "Update",
            "email": "frank@update.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    create_resp = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_resp.json()["id"]

    # Update status
    response = await client.put(
        f"{BASE}/{conference.id}/registrations/{reg_id}",
        json={"status": "paid"},
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "paid"


async def test_delete_registration(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Delete a registration successfully."""
    # Create
    payload = {
        "attendee": {
            "first_name": "Grace",
            "last_name": "Delete",
            "email": "grace@delete.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    create_resp = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_resp.json()["id"]

    # Delete
    response = await client.delete(
        f"{BASE}/{conference.id}/registrations/{reg_id}",
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 200

    # Verify gone
    get_resp = await client.get(
        f"{BASE}/{conference.id}/registrations/{reg_id}",
        headers=auth_headers(reg_admin_token),
    )
    assert get_resp.status_code == 404


async def test_add_and_remove_registration_item(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
    addon_booking_option: BookingOption,
) -> None:
    """Add a booking option item to a registration, then remove it."""
    # Create registration
    payload = {
        "attendee": {
            "first_name": "Hank",
            "last_name": "Items",
            "email": "hank@items.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    create_resp = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_resp.json()["id"]

    # Add item
    item_payload = {
        "item_type": "booking_option",
        "booking_option_id": str(addon_booking_option.id),
    }
    add_resp = await client.post(
        f"{BASE}/{conference.id}/registrations/{reg_id}/items",
        json=item_payload,
        headers=auth_headers(reg_admin_token),
    )
    assert add_resp.status_code == 201
    item_data = add_resp.json()
    assert item_data["item_type"] == "booking_option"
    assert item_data["item_name"] == "Tutorial Day"
    item_id = item_data["id"]

    # Verify item appears in registration
    get_resp = await client.get(
        f"{BASE}/{conference.id}/registrations/{reg_id}",
        headers=auth_headers(reg_admin_token),
    )
    assert len(get_resp.json()["items"]) == 1

    # Remove item
    del_resp = await client.delete(
        f"{BASE}/{conference.id}/registrations/{reg_id}/items/{item_id}",
        headers=auth_headers(reg_admin_token),
    )
    assert del_resp.status_code == 200

    # Verify removed
    get_resp2 = await client.get(
        f"{BASE}/{conference.id}/registrations/{reg_id}",
        headers=auth_headers(reg_admin_token),
    )
    assert len(get_resp2.json()["items"]) == 0


async def test_get_and_update_billing_profile(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Get and update the billing profile of a registration."""
    # Create
    payload = {
        "attendee": {
            "first_name": "Ivy",
            "last_name": "Billing",
            "email": "ivy@billing.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    create_resp = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_resp.json()["id"]

    # Get billing
    get_resp = await client.get(
        f"{BASE}/{conference.id}/registrations/{reg_id}/billing",
        headers=auth_headers(reg_admin_token),
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["company_name"] == "Test GmbH"

    # Update billing
    update_resp = await client.put(
        f"{BASE}/{conference.id}/registrations/{reg_id}/billing",
        json={"company_name": "Updated GmbH"},
        headers=auth_headers(reg_admin_token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["company_name"] == "Updated GmbH"


async def test_search_registrations(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Search registrations by name or email."""
    # Create two registrations
    for name, email in [("SearchAlice", "searchalice@test.com"), ("SearchBob", "searchbob@test.com")]:
        payload = {
            "attendee": {
                "first_name": name,
                "last_name": "Test",
                "email": email,
            },
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(main_booking_option.id),
        }
        await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(reg_admin_token),
        )

    # Search for Alice
    resp = await client.get(
        f"{BASE}/{conference.id}/registrations",
        params={"search": "SearchAlice"},
        headers=auth_headers(reg_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["first_name"] == "SearchAlice"

    # Search by email
    resp2 = await client.get(
        f"{BASE}/{conference.id}/registrations",
        params={"search": "searchbob"},
        headers=auth_headers(reg_admin_token),
    )
    assert resp2.status_code == 200
    assert resp2.json()["total"] == 1


async def test_filter_registrations_by_status(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Filter registrations by status."""
    # Create a registration
    payload = {
        "attendee": {
            "first_name": "Filter",
            "last_name": "Test",
            "email": "filter@test.com",
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(main_booking_option.id),
    }
    create_resp = await client.post(
        f"{BASE}/{conference.id}/registrations/individual",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_resp.json()["id"]

    # Update to "paid"
    await client.put(
        f"{BASE}/{conference.id}/registrations/{reg_id}",
        json={"status": "paid"},
        headers=auth_headers(reg_admin_token),
    )

    # Filter by "paid"
    resp = await client.get(
        f"{BASE}/{conference.id}/registrations",
        params={"status": "paid"},
        headers=auth_headers(reg_admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 1

    # Filter by "invoiced" should be empty
    resp2 = await client.get(
        f"{BASE}/{conference.id}/registrations",
        params={"status": "invoiced"},
        headers=auth_headers(reg_admin_token),
    )
    assert resp2.status_code == 200
    assert resp2.json()["total"] == 0


# ---------------------------------------------------------------------------
# Integration tests — Unified registration endpoint
# ---------------------------------------------------------------------------


async def test_unified_single_attendee(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Unified endpoint with one attendee returns total_created=1."""
    payload = {
        "billing": BILLING_PAYLOAD,
        "attendees": [
            {
                "first_name": "Uni",
                "last_name": "Single",
                "email": "uni.single@test.com",
                "booking_option_id": str(main_booking_option.id),
            }
        ],
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["total_created"] == 1
    assert len(data["registrations"]) == 1
    reg = data["registrations"][0]
    assert reg["first_name"] == "Uni"
    assert reg["last_name"] == "Single"
    assert reg["email"] == "uni.single@test.com"
    assert reg["status"] == "registered_pending_invoice"
    assert reg["booking_option_name"] == "Full Conference"


async def test_unified_multiple_attendees(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Unified endpoint with 3 attendees shares one billing profile."""
    payload = {
        "billing": BILLING_PAYLOAD,
        "attendees": [
            {
                "first_name": f"Multi{i}",
                "last_name": "Unified",
                "email": f"multi{i}@unified.com",
                "booking_option_id": str(main_booking_option.id),
            }
            for i in range(3)
        ],
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["total_created"] == 3
    assert len(data["registrations"]) == 3
    # All share the same billing profile
    bp_ids = {r["billing_profile_id"] for r in data["registrations"]}
    assert len(bp_ids) == 1
    assert data["billing_profile_id"] == next(iter(bp_ids))


async def test_unified_duplicate_emails_rejected(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Unified endpoint rejects duplicate emails within the same batch."""
    payload = {
        "billing": BILLING_PAYLOAD,
        "attendees": [
            {
                "first_name": "Dup",
                "last_name": "One",
                "email": "dup@unified.com",
                "booking_option_id": str(main_booking_option.id),
            },
            {
                "first_name": "Dup",
                "last_name": "Two",
                "email": "dup@unified.com",
                "booking_option_id": str(main_booking_option.id),
            },
        ],
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 422


async def test_unified_empty_attendees_rejected(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
) -> None:
    """Unified endpoint rejects empty attendees list."""
    payload = {
        "billing": BILLING_PAYLOAD,
        "attendees": [],
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 422


async def test_unified_email_already_registered(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """Unified endpoint rejects email already registered for the conference."""
    payload = {
        "billing": BILLING_PAYLOAD,
        "attendees": [
            {
                "first_name": "Already",
                "last_name": "Exists",
                "email": "already@exists.com",
                "booking_option_id": str(main_booking_option.id),
            }
        ],
    }
    # First registration succeeds
    r1 = await client.post(
        f"{BASE}/{conference.id}/registrations",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert r1.status_code == 201

    # Second with same email fails
    r2 = await client.post(
        f"{BASE}/{conference.id}/registrations",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert r2.status_code == 400


async def test_unified_with_addon_items(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
    addon_booking_option: BookingOption,
) -> None:
    """Unified endpoint creates registration with add-on items."""
    payload = {
        "billing": BILLING_PAYLOAD,
        "attendees": [
            {
                "first_name": "Addon",
                "last_name": "Test",
                "email": "addon@unified.com",
                "booking_option_id": str(main_booking_option.id),
                "items": [
                    {
                        "item_type": "booking_option",
                        "booking_option_id": str(addon_booking_option.id),
                    }
                ],
            }
        ],
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["total_created"] == 1
    reg = data["registrations"][0]
    assert len(reg["items"]) == 1
    assert reg["items"][0]["item_type"] == "booking_option"
    assert reg["items"][0]["item_name"] == "Tutorial Day"


async def test_unified_invalid_booking_option(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
) -> None:
    """Unified endpoint rejects non-existent booking option."""
    payload = {
        "billing": BILLING_PAYLOAD,
        "attendees": [
            {
                "first_name": "Bad",
                "last_name": "Option",
                "email": "bad@option.com",
                "booking_option_id": str(uuid.uuid4()),
            }
        ],
    }
    response = await client.post(
        f"{BASE}/{conference.id}/registrations",
        json=payload,
        headers=auth_headers(reg_admin_token),
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# VAT Validation endpoint tests
# ---------------------------------------------------------------------------


class TestVatValidation:
    """Tests for POST /conferences/{id}/registrations/validate-vat."""

    @pytest.mark.asyncio
    async def test_validate_vat_valid_german(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        """Valid German VAT number returns valid=True via stdnum."""
        response = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"vat_number": "DE811871775", "country": "DE"},
            headers=auth_headers(reg_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["method"] == "stdnum"
        assert data["vat_normalized"] == "DE811871775"

    @pytest.mark.asyncio
    async def test_validate_vat_invalid_format(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        """Completely invalid VAT string returns valid=False."""
        response = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"vat_number": "INVALID", "country": "DE"},
            headers=auth_headers(reg_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False

    @pytest.mark.asyncio
    async def test_validate_vat_non_eu_country(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        """Non-EU country returns valid=None with message."""
        response = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"vat_number": "US123456789", "country": "US"},
            headers=auth_headers(reg_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is None
        assert "not" in data["message"].lower() and "EU" in data["message"]

    @pytest.mark.asyncio
    async def test_validate_vat_missing_params(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        """Missing vat_number parameter returns 422."""
        response = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"country": "DE"},
            headers=auth_headers(reg_admin_token),
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_validate_vat_auto_prefix(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        """VAT number without country prefix gets it added automatically."""
        response = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"vat_number": "123456789", "country": "DE"},
            headers=auth_headers(reg_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        # Should have prepended "DE"
        assert data["vat_normalized"] == "DE123456789"

    @pytest.mark.asyncio
    async def test_validate_vat_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        """Unauthenticated request returns 401."""
        response = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"vat_number": "DE123456789", "country": "DE"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_validate_vat_normalizes_input(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        """VAT number with spaces and dots is normalized."""
        response = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"vat_number": "DE 123.456.789", "country": "DE"},
            headers=auth_headers(reg_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["vat_normalized"] == "DE123456789"


class TestStandaloneVatValidation:
    """Tests for POST /my-company/validate-vat (standalone, no conference required)."""

    @pytest.mark.asyncio
    async def test_standalone_validate_vat_valid(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Standalone endpoint validates a valid German VAT."""
        token = _make_token(tenant_admin_user, modules=[])
        response = await client.post(
            "/api/v1/my-company/validate-vat",
            params={"vat_number": "DE811871775", "country": "DE"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["method"] == "stdnum"

    @pytest.mark.asyncio
    async def test_standalone_validate_vat_country_name(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Standalone endpoint accepts full country names like 'GERMANY'."""
        token = _make_token(tenant_admin_user, modules=[])
        response = await client.post(
            "/api/v1/my-company/validate-vat",
            params={"vat_number": "DE811871775", "country": "Germany"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True

    @pytest.mark.asyncio
    async def test_standalone_validate_vat_invalid(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Standalone endpoint rejects invalid VAT."""
        token = _make_token(tenant_admin_user, modules=[])
        response = await client.post(
            "/api/v1/my-company/validate-vat",
            params={"vat_number": "DE195661616AAA", "country": "DE"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False

    @pytest.mark.asyncio
    async def test_standalone_validate_vat_unauthenticated(
        self,
        client: AsyncClient,
    ) -> None:
        """Standalone endpoint requires authentication."""
        response = await client.post(
            "/api/v1/my-company/validate-vat",
            params={"vat_number": "DE123456789", "country": "DE"},
        )
        assert response.status_code == 401
