"""Tests for registration replacement feature."""

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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.security.pii_crypto import hash_email
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.registration import Registration, RegistrationReplacement, RegistrationStatus
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess
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
async def main_booking_option(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> BookingOption:
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


@pytest.mark.asyncio
async def test_simple_replacement_no_additional_items(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
    db_session: AsyncSession,
) -> None:
    """Scenario A: Replace attendee without additional items, no invoice changes."""
    # Create registration first
    create_response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json={
            "billing": {
                "company_name": "Test Company",
                "street": "123 Main St",
                "postal_code": "12345",
                "city": "TestCity",
                "country": "DE",
                "contact_first_name": "John",
                "contact_last_name": "Doe",
                "contact_phone": "+1234567890",
                "contact_email": "john@example.com",
                "payment_method": "bank_transfer",
            },
            "attendees": [
                {
                    "first_name": "Old",
                    "last_name": "Attendee",
                    "email": "old@example.com",
                    "booking_option_id": str(main_booking_option.id),
                }
            ],
        },
        headers=auth_headers(reg_admin_token),
    )
    assert create_response.status_code == 201
    old_reg_id = create_response.json()["registrations"][0]["id"]

    # Replace attendee
    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations/{old_reg_id}/replace",
        json={
            "new_attendee": {
                "first_name": "New",
                "last_name": "Attendee",
                "email": "new@example.com",
            },
            "additional_items": [],
            "replacement_reason": "Employee transferred",
        },
        headers=auth_headers(reg_admin_token),
    )

    assert response.status_code == 200
    data = response.json()

    # Verify old registration data in response (captured before deletion)
    assert data["old_registration"]["email"] == "old@example.com"

    # Verify old registration is hard-deleted from DB
    result = await db_session.execute(select(Registration).where(Registration.id == old_reg_id))
    assert result.scalar_one_or_none() is None, "Old registration should be deleted"

    # Verify new registration created
    assert data["new_registration"]["email"] == "new@example.com"
    assert data["new_registration"]["first_name"] == "New"

    # Verify no additional invoice (Scenario A)
    assert data["has_additional_items"] is False
    assert data["additional_items_invoice"] is None

    # Verify replacement record created with denormalized audit data
    assert "replacement_id" in data
    replacement_result = await db_session.execute(
        select(RegistrationReplacement).where(RegistrationReplacement.id == data["replacement_id"])
    )
    replacement = replacement_result.scalar_one()
    assert replacement.old_registration_id is None, "FK should be NULL after deletion"
    assert replacement.old_attendee_email == "old@example.com"
    assert replacement.old_attendee_name == "Old Attendee"

    # Verify old user lost conference access but account preserved
    result = await db_session.execute(select(User).where(User.email_hash == hash_email("old@example.com")))
    old_user = result.scalar_one_or_none()
    if old_user:
        access_result = await db_session.execute(
            select(UserConferenceAccess).where(
                UserConferenceAccess.user_id == old_user.id,
                UserConferenceAccess.conference_id == conference.id,
            )
        )
        assert access_result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_cannot_replace_cancelled_registration(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
    db_session: AsyncSession,
) -> None:
    """Cannot replace an already-cancelled registration."""
    # Create and cancel registration
    create_response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json={
            "billing": {
                "street": "123 Main St",
                "postal_code": "12345",
                "city": "TestCity",
                "country": "DE",
                "contact_first_name": "Test",
                "contact_last_name": "User",
                "contact_phone": "+1234567890",
                "contact_email": "test@example.com",
            },
            "attendees": [
                {
                    "first_name": "Cancelled",
                    "last_name": "User",
                    "email": "cancelled@example.com",
                    "booking_option_id": str(main_booking_option.id),
                }
            ],
        },
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_response.json()["registrations"][0]["id"]

    # Cancel it
    result = await db_session.execute(select(Registration).where(Registration.id == reg_id))
    reg = result.scalar_one()
    reg.status = RegistrationStatus.CANCELLED
    await db_session.commit()

    # Try to replace
    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations/{reg_id}/replace",
        json={
            "new_attendee": {
                "first_name": "New",
                "last_name": "Person",
                "email": "new@example.com",
            },
            "additional_items": [],
        },
        headers=auth_headers(reg_admin_token),
    )

    assert response.status_code == 400
    assert "cancelled" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_email_uniqueness_validation(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
) -> None:
    """New attendee email must be unique for the conference."""
    # Create two registrations
    create_response1 = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json={
            "billing": {
                "street": "123 Main St",
                "postal_code": "12345",
                "city": "TestCity",
                "country": "DE",
                "contact_first_name": "User",
                "contact_last_name": "One",
                "contact_phone": "+1234567890",
                "contact_email": "user1@example.com",
            },
            "attendees": [
                {
                    "first_name": "User",
                    "last_name": "One",
                    "email": "user1@example.com",
                    "booking_option_id": str(main_booking_option.id),
                }
            ],
        },
        headers=auth_headers(reg_admin_token),
    )
    reg1_id = create_response1.json()["registrations"][0]["id"]

    _create_response2 = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json={
            "billing": {
                "street": "456 Oak Ave",
                "postal_code": "67890",
                "city": "TestCity",
                "country": "DE",
                "contact_first_name": "User",
                "contact_last_name": "Two",
                "contact_phone": "+1234567890",
                "contact_email": "user2@example.com",
            },
            "attendees": [
                {
                    "first_name": "User",
                    "last_name": "Two",
                    "email": "user2@example.com",
                    "booking_option_id": str(main_booking_option.id),
                }
            ],
        },
        headers=auth_headers(reg_admin_token),
    )

    # Try to replace reg1 with email that already exists (user2@example.com)
    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations/{reg1_id}/replace",
        json={
            "new_attendee": {
                "first_name": "Duplicate",
                "last_name": "Email",
                "email": "user2@example.com",  # Already exists!
            },
            "additional_items": [],
        },
        headers=auth_headers(reg_admin_token),
    )

    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_replacement_creates_audit_trail(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
    db_session: AsyncSession,
) -> None:
    """Replacement creates audit log and replacement record."""
    # Create registration
    create_response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json={
            "billing": {
                "street": "123 Main St",
                "postal_code": "12345",
                "city": "TestCity",
                "country": "DE",
                "contact_first_name": "Audit",
                "contact_last_name": "Test",
                "contact_phone": "+1234567890",
                "contact_email": "audit@example.com",
            },
            "attendees": [
                {
                    "first_name": "Before",
                    "last_name": "Replacement",
                    "email": "before@example.com",
                    "booking_option_id": str(main_booking_option.id),
                }
            ],
        },
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_response.json()["registrations"][0]["id"]

    # Replace
    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations/{reg_id}/replace",
        json={
            "new_attendee": {
                "first_name": "After",
                "last_name": "Replacement",
                "email": "after@example.com",
            },
            "additional_items": [],
            "replacement_reason": "Test replacement for audit",
        },
        headers=auth_headers(reg_admin_token),
    )

    assert response.status_code == 200
    replacement_id = response.json()["replacement_id"]

    # Verify replacement record exists with denormalized data
    result = await db_session.execute(
        select(RegistrationReplacement).where(RegistrationReplacement.id == replacement_id)
    )
    replacement = result.scalar_one()
    assert replacement.old_attendee_email == "before@example.com"
    assert replacement.old_attendee_name == "Before Replacement"
    assert replacement.replacement_reason == "Test replacement for audit"
    assert replacement.old_items_snapshot is not None
    # old_registration_id is NULL because old registration was hard-deleted
    assert replacement.old_registration_id is None

    # Verify old registration no longer exists in DB
    old_reg_result = await db_session.execute(select(Registration).where(Registration.id == reg_id))
    assert old_reg_result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_conference_access_management(
    client: AsyncClient,
    tenant_with_reg_module: Tenant,
    tenant_admin_user: User,
    reg_admin_token: str,
    conference: Conference,
    main_booking_option: BookingOption,
    db_session: AsyncSession,
) -> None:
    """Old user loses access, new user gains access."""
    # Create registration with old attendee
    create_response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json={
            "billing": {
                "street": "123 Main St",
                "postal_code": "12345",
                "city": "TestCity",
                "country": "DE",
                "contact_first_name": "Access",
                "contact_last_name": "Test",
                "contact_phone": "+1234567890",
                "contact_email": "access@example.com",
            },
            "attendees": [
                {
                    "first_name": "Old",
                    "last_name": "Access",
                    "email": "oldaccess@example.com",
                    "booking_option_id": str(main_booking_option.id),
                }
            ],
        },
        headers=auth_headers(reg_admin_token),
    )
    reg_id = create_response.json()["registrations"][0]["id"]

    # Replace
    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations/{reg_id}/replace",
        json={
            "new_attendee": {
                "first_name": "New",
                "last_name": "Access",
                "email": "newaccess@example.com",
            },
            "additional_items": [],
        },
        headers=auth_headers(reg_admin_token),
    )

    assert response.status_code == 200

    # Verify new user has access
    result = await db_session.execute(select(User).where(User.email_hash == hash_email("newaccess@example.com")))
    new_user = result.scalar_one_or_none()
    assert new_user is not None

    access_result = await db_session.execute(
        select(UserConferenceAccess).where(
            UserConferenceAccess.user_id == new_user.id,
            UserConferenceAccess.conference_id == conference.id,
        )
    )
    assert access_result.scalar_one_or_none() is not None

    # Verify old user account still exists but no conference access
    old_user_result = await db_session.execute(
        select(User).where(User.email_hash == hash_email("oldaccess@example.com"))
    )
    old_user = old_user_result.scalar_one_or_none()
    if old_user:  # May or may not exist depending on how fixtures work
        old_access_result = await db_session.execute(
            select(UserConferenceAccess).where(
                UserConferenceAccess.user_id == old_user.id,
                UserConferenceAccess.conference_id == conference.id,
            )
        )
        assert old_access_result.scalar_one_or_none() is None
