"""Deep coverage tests for Registration and Program Publish endpoints.

Exercises uncovered code paths in:
- app/api/v1/registrations.py (unified, company, bulk, bookable sessions with data,
  tutorial items with published program, VAT validation, billing CRUD, item removal)
- app/api/v1/program/publish.py (publish, update with differential notifications,
  preview after changes, sessions CSV export with papers/speakers/cospeakers/custom fields)
"""

import os
import uuid
from datetime import UTC, date, datetime, time

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

from app.core.security import create_access_token, hash_password
from app.models.associations import ConferenceCFP
from app.models.booking import BookingOption
from app.models.cfp import CallForPapers, CFPStatus
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, CFPPaperCospeaker, PaperStatus
from app.models.conference import Conference
from app.models.form_schema import ConferencePaperFormSchema, PaperFormField
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import SessionType
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE = "/api/v1/conferences"


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


BILLING_PAYLOAD = {
    "company_name": "Deep Test GmbH",
    "street": "Tiefstr. 99",
    "postal_code": "10115",
    "city": "Berlin",
    "country": "DE",
    "contact_first_name": "Max",
    "contact_last_name": "Deep",
    "contact_phone": "+491701234567",
    "contact_email": "billing@deep.de",
    "vat_number": "DE999999999",
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def reg_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Registration", code="registration", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def program_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Program", code="program", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="CFP", code="cfp", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_all(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    reg_module: Module,
    program_module: Module,
    cfp_module: Module,
) -> Tenant:
    for mod in [conferences_module, reg_module, program_module, cfp_module]:
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True))
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "registration", "program", "cfp"])


@pytest_asyncio.fixture()
async def booking_option(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> BookingOption:
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Pass",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest_asyncio.fixture()
async def booking_option_b(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> BookingOption:
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Workshop Pass",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest_asyncio.fixture()
async def program_day(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> ProgramDay:
    day = ProgramDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        date=date(2026, 7, 1),
        sort_order=0,
    )
    db_session.add(day)
    await db_session.commit()
    return day


@pytest_asyncio.fixture()
async def program_slots(db_session: AsyncSession, tenant: Tenant, program_day: ProgramDay) -> list[ProgramTimeSlot]:
    slots = []
    for i, (st, et) in enumerate(
        [
            (time(9, 0), time(10, 0)),
            (time(10, 0), time(11, 0)),
            (time(11, 0), time(12, 0)),
        ]
    ):
        s = ProgramTimeSlot(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            program_day_id=program_day.id,
            start_time=st,
            end_time=et,
            sort_order=i,
        )
        db_session.add(s)
        slots.append(s)
    await db_session.commit()
    return slots


@pytest_asyncio.fixture()
async def program_track(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, program_day: ProgramDay
) -> ProgramTrack:
    track = ProgramTrack(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        program_day_id=program_day.id,
        name="Room A",
        sort_order=0,
    )
    db_session.add(track)
    await db_session.commit()
    return track


@pytest_asyncio.fixture()
async def session_type(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> SessionType:
    st = SessionType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial",
        slug="tutorial",
        duration_minutes=60,
        cfp_eligible=True,
        separately_bookable=True,
        is_active=True,
    )
    db_session.add(st)
    await db_session.commit()
    return st


@pytest_asyncio.fixture()
async def bookable_option(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    program_day: ProgramDay,
) -> BookingOption:
    """Booking option linked to a program day (for bookable-sessions endpoint)."""
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day Pass",
        conference_day_id=program_day.id,
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest_asyncio.fixture()
async def bookable_session(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    program_slots: list[ProgramTimeSlot],
    program_track: ProgramTrack,
    session_type: SessionType,
) -> ProgramSession:
    """A separately-bookable session linked to a session type."""
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=program_slots[0].id,
        start_track_id=program_track.id,
        title="Python Tutorial",
        session_type_id=session_type.id,
        separately_bookable=True,
        slot_span=2,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()
    return s


# CFP fixtures for publish tests


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    c = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Deep CFP",
        status=CFPStatus.REVIEW.value,
    )
    db_session.add(c)
    await db_session.flush()
    db_session.add(ConferenceCFP(id=uuid.uuid4(), conference_id=conference.id, cfp_id=c.id))
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def speakers(db_session: AsyncSession, tenant: Tenant) -> list[CFPApplicant]:
    result = []
    for first, last in [("Alice", "Speaker"), ("Bob", "Talker"), ("Carol", "CoSpeaker")]:
        a = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name=first,
            last_name=last,
            email=f"{first.lower()}-{uuid.uuid4().hex[:6]}@test.com",
            password_hash=hash_password("Password123!"),
        )
        db_session.add(a)
        result.append(a)
    await db_session.commit()
    return result


@pytest_asyncio.fixture()
async def papers_with_cospeaker(
    db_session: AsyncSession,
    tenant: Tenant,
    cfp: CallForPapers,
    speakers: list[CFPApplicant],
) -> list[CFPPaper]:
    """Create papers: Paper1 by Alice (with Carol as co-speaker), Paper2 by Bob."""
    alice, bob, carol = speakers
    p1 = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=alice.id,
        title="AI Frontiers",
        abstract_short="AI abstract",
        level="intermediate",
        learning_objectives="Learn AI",
        importance="Very important",
        status=PaperStatus.SUBMITTED.value,
        submitted_at=datetime.now(UTC),
        custom_field_answers={"experience": "5 years", "tags": ["ai", "ml"]},
    )
    p2 = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=bob.id,
        title="Cloud Myths",
        abstract_short="Cloud abstract",
        status=PaperStatus.SUBMITTED.value,
        submitted_at=datetime.now(UTC),
    )
    db_session.add(p1)
    db_session.add(p2)
    await db_session.flush()

    # Add Carol as co-speaker on paper 1
    cospeaker = CFPPaperCospeaker(
        paper_id=p1.id,
        applicant_id=carol.id,
        sort_order=0,
    )
    db_session.add(cospeaker)
    await db_session.commit()
    return [p1, p2]


@pytest_asyncio.fixture()
async def session_with_paper(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    program_slots: list[ProgramTimeSlot],
    program_track: ProgramTrack,
    papers_with_cospeaker: list[CFPPaper],
    session_type: SessionType,
) -> ProgramSession:
    """Session assigned to Alice's paper (paper[0])."""
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=program_slots[0].id,
        start_track_id=program_track.id,
        title=papers_with_cospeaker[0].title,
        paper_id=papers_with_cospeaker[0].id,
        session_type_id=session_type.id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def custom_form_schema(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> ConferencePaperFormSchema:
    """Create a custom paper form schema with fields for CSV export testing."""
    schema = ConferencePaperFormSchema(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
    )
    db_session.add(schema)
    await db_session.flush()

    field = PaperFormField(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        schema_id=schema.id,
        field_key="experience",
        label="Experience Level",
        field_type="text",
        display_order=0,
    )
    db_session.add(field)
    await db_session.commit()
    return schema


# =========================================================================
# 1. Unified Registration (POST "") — main endpoint
# =========================================================================


class TestUnifiedRegistration:
    """Tests for POST /conferences/{id}/registrations (unified endpoint)."""

    @pytest.mark.asyncio
    async def test_unified_single_attendee(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
    ) -> None:
        """Create a unified registration with a single attendee."""
        payload = {
            "billing": BILLING_PAYLOAD,
            "attendees": [
                {
                    "first_name": "Unified",
                    "last_name": "Single",
                    "email": "unified-single@test.com",
                    "booking_option_id": str(booking_option.id),
                }
            ],
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["total_created"] == 1
        assert data["billing_profile_id"] is not None
        reg = data["registrations"][0]
        assert reg["first_name"] == "Unified"
        assert reg["registration_mode"] == "company_bulk"
        assert reg["status"] == "registered_pending_invoice"
        assert reg["booking_option_name"] == "Full Pass"

    @pytest.mark.asyncio
    async def test_unified_multiple_attendees(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
        booking_option_b: BookingOption,
    ) -> None:
        """Create a unified registration with multiple attendees and different booking options."""
        payload = {
            "billing": BILLING_PAYLOAD,
            "attendees": [
                {
                    "first_name": "Alice",
                    "last_name": "Attendee",
                    "email": "alice-unified@test.com",
                    "booking_option_id": str(booking_option.id),
                },
                {
                    "first_name": "Bob",
                    "last_name": "Attendee",
                    "email": "bob-unified@test.com",
                    "booking_option_id": str(booking_option_b.id),
                },
            ],
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["total_created"] == 2
        names = {r["booking_option_name"] for r in data["registrations"]}
        assert "Full Pass" in names
        assert "Workshop Pass" in names

    @pytest.mark.asyncio
    async def test_unified_with_items(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
        booking_option_b: BookingOption,
    ) -> None:
        """Unified registration with add-on items at creation time."""
        payload = {
            "billing": BILLING_PAYLOAD,
            "attendees": [
                {
                    "first_name": "ItemGuy",
                    "last_name": "Tester",
                    "email": "itemguy@test.com",
                    "booking_option_id": str(booking_option.id),
                    "items": [
                        {
                            "item_type": "booking_option",
                            "booking_option_id": str(booking_option_b.id),
                        },
                        {
                            "item_type": "tutorial",
                            "notes": "Prefer morning",
                        },
                    ],
                }
            ],
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        reg = resp.json()["registrations"][0]
        assert len(reg["items"]) == 2
        item_types = {i["item_type"] for i in reg["items"]}
        assert "booking_option" in item_types
        assert "tutorial" in item_types
        # Tutorial should be pending since program not published
        tutorial_item = next(i for i in reg["items"] if i["item_type"] == "tutorial")
        assert tutorial_item["pending"] is True

    @pytest.mark.asyncio
    async def test_unified_duplicate_email_rejected(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
    ) -> None:
        """Duplicate emails in the same request are rejected by schema validator."""
        payload = {
            "billing": BILLING_PAYLOAD,
            "attendees": [
                {
                    "first_name": "Dup",
                    "last_name": "One",
                    "email": "dup@test.com",
                    "booking_option_id": str(booking_option.id),
                },
                {
                    "first_name": "Dup",
                    "last_name": "Two",
                    "email": "dup@test.com",
                    "booking_option_id": str(booking_option.id),
                },
            ],
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 422


# =========================================================================
# 2. Company Single Registration (POST /company)
# =========================================================================


class TestCompanyRegistration:
    """Tests for POST /conferences/{id}/registrations/company."""

    @pytest.mark.asyncio
    async def test_company_single_registration(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
    ) -> None:
        """Create a company single registration."""
        payload = {
            "attendee": {
                "first_name": "Company",
                "last_name": "Employee",
                "email": "company-emp@test.com",
                "job_title": "Engineer",
                "department": "R&D",
            },
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(booking_option.id),
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/company",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["registration_mode"] == "company_single"
        assert data["job_title"] == "Engineer"
        assert data["department"] == "R&D"
        assert data["billing_company_name"] == "Deep Test GmbH"
        assert data["billing_contact_email"] == "billing@deep.de"

    @pytest.mark.asyncio
    async def test_company_registration_with_items(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
        booking_option_b: BookingOption,
    ) -> None:
        """Company registration with add-on items."""
        payload = {
            "attendee": {
                "first_name": "CompItem",
                "last_name": "Employee",
                "email": "comp-item@test.com",
            },
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(booking_option.id),
            "items": [
                {
                    "item_type": "booking_option",
                    "booking_option_id": str(booking_option_b.id),
                }
            ],
            "notes": "Dietary requirement: vegan",
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/company",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["notes"] == "Dietary requirement: vegan"


# =========================================================================
# 3. Bulk Registration (POST /bulk)
# =========================================================================


class TestBulkRegistration:
    """Tests for POST /conferences/{id}/registrations/bulk."""

    @pytest.mark.asyncio
    async def test_bulk_registration_multiple_attendees(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
        booking_option_b: BookingOption,
    ) -> None:
        """Create bulk registration with multiple attendees sharing billing."""
        payload = {
            "billing": BILLING_PAYLOAD,
            "attendees": [
                {
                    "first_name": "Bulk1",
                    "last_name": "Employee",
                    "email": "bulk1@test.com",
                    "booking_option_id": str(booking_option.id),
                    "pronouns": "he/him",
                },
                {
                    "first_name": "Bulk2",
                    "last_name": "Employee",
                    "email": "bulk2@test.com",
                    "booking_option_id": str(booking_option_b.id),
                    "job_title": "Manager",
                },
            ],
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/bulk",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["total_created"] == 2
        assert data["billing_profile_id"] is not None
        # Both share the same billing profile
        bp_ids = {r["billing_profile_id"] for r in data["registrations"]}
        assert len(bp_ids) == 1

    @pytest.mark.asyncio
    async def test_bulk_with_items_per_attendee(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
        booking_option_b: BookingOption,
    ) -> None:
        """Bulk registration with items on attendees."""
        payload = {
            "billing": BILLING_PAYLOAD,
            "attendees": [
                {
                    "first_name": "BulkItem",
                    "last_name": "One",
                    "email": "bulkitem1@test.com",
                    "booking_option_id": str(booking_option.id),
                    "items": [
                        {
                            "item_type": "booking_option",
                            "booking_option_id": str(booking_option_b.id),
                            "notes": "Extra workshop",
                        }
                    ],
                },
            ],
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/bulk",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        reg = resp.json()["registrations"][0]
        assert len(reg["items"]) == 1
        assert reg["items"][0]["notes"] == "Extra workshop"


# =========================================================================
# 4. Bookable Sessions with Data
# =========================================================================


class TestBookableSessionsWithData:
    """Tests for GET /bookable-sessions/{id} with actual session data."""

    @pytest.mark.asyncio
    async def test_bookable_sessions_returns_grouped_data(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        bookable_option: BookingOption,
        bookable_session: ProgramSession,
    ) -> None:
        """Bookable sessions endpoint returns sessions grouped by type with time data."""
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/bookable-sessions/{bookable_option.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["day_name"] == "Tutorial Day"
        assert len(data["groups"]) >= 1

        group = data["groups"][0]
        assert group["session_type_name"] == "Tutorial"
        assert group["session_type_id"] is not None
        assert len(group["slots"]) >= 1

        slot = group["slots"][0]
        assert slot["start_time"] is not None
        assert slot["end_time"] is not None
        assert len(slot["sessions"]) >= 1

        session = slot["sessions"][0]
        assert session["title"] == "Python Tutorial"
        assert session["id"] is not None

    @pytest.mark.asyncio
    async def test_bookable_sessions_multi_slot_span(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        bookable_option: BookingOption,
        bookable_session: ProgramSession,
    ) -> None:
        """Session with slot_span=2 shows extended end time in the label."""
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/bookable-sessions/{bookable_option.id}",
            headers=auth_headers(admin_token),
        )
        data = resp.json()
        slot = data["groups"][0]["slots"][0]
        # Session starts at 09:00 with slot_span=2, so end should be 11:00
        assert slot["start_time"] == "09:00"
        assert slot["end_time"] == "11:00"
        assert "09:00" in slot["label"]
        assert "11:00" in slot["label"]


# =========================================================================
# 5. Registration Item Removal
# =========================================================================


class TestItemRemoval:
    """Tests for DELETE /registrations/{id}/items/{item_id}."""

    @pytest.mark.asyncio
    async def test_remove_item_success(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
        booking_option_b: BookingOption,
    ) -> None:
        """Add and then remove an item from a registration."""
        # Create registration via individual endpoint
        payload = {
            "attendee": {"first_name": "Remove", "last_name": "Item", "email": "remove-item@test.com"},
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(booking_option.id),
        }
        create_resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(admin_token),
        )
        reg_id = create_resp.json()["id"]

        # Add an item
        add_resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg_id}/items",
            json={"item_type": "booking_option", "booking_option_id": str(booking_option_b.id)},
            headers=auth_headers(admin_token),
        )
        assert add_resp.status_code == 201
        item_id = add_resp.json()["id"]

        # Remove the item
        del_resp = await client.delete(
            f"{BASE}/{conference.id}/registrations/{reg_id}/items/{item_id}",
            headers=auth_headers(admin_token),
        )
        assert del_resp.status_code == 200
        assert "removed" in del_resp.json()["message"].lower()

        # Verify item is gone
        get_resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{reg_id}",
            headers=auth_headers(admin_token),
        )
        assert get_resp.status_code == 200
        assert len(get_resp.json()["items"]) == 0


# =========================================================================
# 6. Billing Profile Get & Update
# =========================================================================


class TestBillingProfileDeep:
    """Tests for billing profile get and update endpoints."""

    @pytest.mark.asyncio
    async def test_get_billing_profile(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
    ) -> None:
        """Get billing profile for a registration."""
        payload = {
            "attendee": {"first_name": "Bill", "last_name": "Get", "email": "bill-get@test.com"},
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(booking_option.id),
        }
        create_resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(admin_token),
        )
        reg_id = create_resp.json()["id"]

        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{reg_id}/billing",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_name"] == "Deep Test GmbH"
        assert data["city"] == "Berlin"
        assert data["contact_email"] == "billing@deep.de"
        assert data["vat_number"] == "DE999999999"

    @pytest.mark.asyncio
    async def test_update_billing_profile(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
    ) -> None:
        """Update billing profile fields."""
        payload = {
            "attendee": {"first_name": "Bill", "last_name": "Update", "email": "bill-upd@test.com"},
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(booking_option.id),
        }
        create_resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(admin_token),
        )
        reg_id = create_resp.json()["id"]

        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg_id}/billing",
            json={
                "company_name": "Updated Corp",
                "city": "Munich",
                "vat_validated": True,
                "procurement_code": "PO-999",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_name"] == "Updated Corp"
        assert data["city"] == "Munich"
        assert data["vat_validated"] is True


# =========================================================================
# 7. VAT Validation
# =========================================================================


class TestVATValidation:
    """Tests for POST /conferences/{id}/registrations/validate-vat."""

    @pytest.mark.asyncio
    async def test_vat_validation_returns_result(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """VAT validation endpoint returns a result dict with valid/method keys."""
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"vat_number": "DE123456789", "country": "DE"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "valid" in data
        assert "method" in data
        # DE123456789 should be validated via stdnum or regex
        assert data["method"] in ("stdnum", "regex", "vies", None)

    @pytest.mark.asyncio
    async def test_vat_validation_non_eu_country(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """VAT validation for a non-EU country returns valid=None."""
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/validate-vat",
            params={"vat_number": "US123456789", "country": "US"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is None
        assert "message" in data


# =========================================================================
# 8. Program Publish with Co-speakers & Notifications
# =========================================================================


class TestProgramPublishDeep:
    """Deep tests for program publish with co-speakers and notifications."""

    @pytest.mark.asyncio
    async def test_publish_preview_with_cospeakers(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
    ) -> None:
        """Preview includes correct paper counts and speaker notifications."""
        resp = await client.get(
            f"{BASE}/{conference.id}/program/publish/preview",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_to_accept"] == 1  # Alice's paper in session
        assert data["papers_to_reject"] == 1  # Bob's paper not in session
        assert data["already_published"] is False
        # 3 speakers to notify: Alice (accepted), Bob (rejected), Carol (co-speaker, accepted)
        assert data["speakers_to_notify"] >= 2

    @pytest.mark.asyncio
    async def test_publish_creates_notifications(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
    ) -> None:
        """Publish creates acceptance and rejection notification threads."""
        resp = await client.post(
            f"{BASE}/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_accepted"] == 1
        assert data["papers_rejected"] == 1
        assert data["notifications_sent"] > 0
        assert data["published_at"] is not None

    @pytest.mark.asyncio
    async def test_publish_then_update_with_changes(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
        program_slots: list[ProgramTimeSlot],
        program_track: ProgramTrack,
        tenant: Tenant,
    ) -> None:
        """Publish, then add a new session for paper[1] and update - sends differential notifications."""
        # Initial publish
        pub_resp = await client.post(
            f"{BASE}/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )
        assert pub_resp.status_code == 200

        # Add Bob's paper to a new session (was rejected, now accepted)
        new_session = ProgramSession(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            start_slot_id=program_slots[2].id,
            start_track_id=program_track.id,
            title=papers_with_cospeaker[1].title,
            paper_id=papers_with_cospeaker[1].id,
            slot_span=1,
            track_span=1,
        )
        db_session.add(new_session)
        await db_session.commit()

        # Update
        update_resp = await client.post(
            f"{BASE}/{conference.id}/program/update",
            headers=auth_headers(admin_token),
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["papers_accepted"] == 2  # Both papers now accepted
        assert data["papers_rejected"] == 0
        assert data["notifications_sent"] > 0  # Bob gets acceptance notification

    @pytest.mark.asyncio
    async def test_update_without_publish_fails(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
    ) -> None:
        """Update before publish should fail."""
        resp = await client.post(
            f"{BASE}/{conference.id}/program/update",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_publish_no_papers_fails(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        program_day: ProgramDay,
    ) -> None:
        """Publish with no papers fails."""
        resp = await client.post(
            f"{BASE}/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_preview_after_publish_is_differential(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
    ) -> None:
        """Preview after publish shows differential (no changes = 0 papers to accept/reject)."""
        # Publish
        await client.post(
            f"{BASE}/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        # Preview - no changes
        resp = await client.get(
            f"{BASE}/{conference.id}/program/publish/preview",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["already_published"] is True
        # Since nothing changed, differential should show 0
        assert data["papers_to_accept"] == 0
        assert data["papers_to_reject"] == 0
        assert data["speakers_to_notify"] == 0

    @pytest.mark.asyncio
    async def test_update_no_changes_zero_notifications(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
    ) -> None:
        """Update with no changes should send zero notifications."""
        # Publish first
        await client.post(
            f"{BASE}/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        # Update with no changes
        resp = await client.post(
            f"{BASE}/{conference.id}/program/update",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["notifications_sent"] == 0


# =========================================================================
# 9. Sessions CSV Export (deep)
# =========================================================================


class TestSessionExportDeep:
    """Deep tests for CSV export with papers, speakers, co-speakers, and custom fields."""

    @pytest.mark.asyncio
    async def test_export_with_paper_speaker_cospeaker(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
        speakers: list[CFPApplicant],
    ) -> None:
        """Export CSV includes paper title, speaker name, and co-speaker names."""
        resp = await client.get(
            f"{BASE}/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")
        content = resp.text
        # Paper title
        assert "AI Frontiers" in content
        # Main speaker (Alice)
        assert "Alice" in content
        # Co-speaker (Carol)
        assert "Carol" in content
        # Paper fields
        assert "AI abstract" in content

    @pytest.mark.asyncio
    async def test_export_with_custom_fields(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
        custom_form_schema: ConferencePaperFormSchema,
    ) -> None:
        """Export CSV includes custom form field columns and values."""
        resp = await client.get(
            f"{BASE}/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        content = resp.text
        # Custom field header
        assert "Experience Level" in content
        # Custom field value from paper's custom_field_answers
        assert "5 years" in content

    @pytest.mark.asyncio
    async def test_export_with_list_custom_field(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Export CSV handles list-type custom field answers (joined with commas)."""
        # Create a custom schema with a field matching the tags answer
        schema = ConferencePaperFormSchema(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
        )
        db_session.add(schema)
        await db_session.flush()
        field = PaperFormField(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            schema_id=schema.id,
            field_key="tags",
            label="Tags",
            field_type="multi_select",
            display_order=0,
        )
        db_session.add(field)
        await db_session.commit()

        resp = await client.get(
            f"{BASE}/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        content = resp.text
        assert "Tags" in content
        # The list ["ai", "ml"] should be joined as "ai, ml"
        assert "ai, ml" in content

    @pytest.mark.asyncio
    async def test_export_session_type_in_csv(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
    ) -> None:
        """Export CSV includes session type name."""
        resp = await client.get(
            f"{BASE}/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        content = resp.text
        assert "Tutorial" in content

    @pytest.mark.asyncio
    async def test_export_track_and_day_info(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
    ) -> None:
        """Export CSV includes day name, date, and track name."""
        resp = await client.get(
            f"{BASE}/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        content = resp.text
        assert "Tutorial Day" in content
        assert "2026-07-01" in content
        assert "Room A" in content

    @pytest.mark.asyncio
    async def test_export_empty_conference(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Export with no sessions returns CSV with header only."""
        resp = await client.get(
            f"{BASE}/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        content = resp.text
        assert "Session Title" in content
        lines = content.strip().split("\n")
        assert len(lines) == 1  # Header only

    @pytest.mark.asyncio
    async def test_export_has_utf8_bom(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        session_with_paper: ProgramSession,
        papers_with_cospeaker: list[CFPPaper],
    ) -> None:
        """Export CSV starts with UTF-8 BOM for Excel compatibility."""
        resp = await client.get(
            f"{BASE}/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        raw = resp.content
        assert raw[:3] == b"\xef\xbb\xbf"


# =========================================================================
# 10. Tutorial Item with Published Program and Session
# =========================================================================


class TestTutorialItemWithSession:
    """Tests for tutorial items when program is published and session exists."""

    @pytest.mark.asyncio
    async def test_tutorial_item_with_bookable_session(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
        bookable_session: ProgramSession,
        tenant: Tenant,
    ) -> None:
        """Adding a tutorial item with a specific session ID when program is published."""
        # Mark conference as published
        conference.program_published_at = datetime.now(UTC)
        db_session.add(conference)
        await db_session.commit()

        # Create registration
        payload = {
            "attendee": {"first_name": "Tutorial", "last_name": "Picker", "email": "tut-pick@test.com"},
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(booking_option.id),
        }
        create_resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert create_resp.status_code == 201
        reg_id = create_resp.json()["id"]

        # Add tutorial item with specific session
        add_resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg_id}/items",
            json={
                "item_type": "tutorial",
                "program_session_id": str(bookable_session.id),
            },
            headers=auth_headers(admin_token),
        )
        assert add_resp.status_code == 201
        data = add_resp.json()
        assert data["pending"] is False
        assert data["item_name"] == "Python Tutorial"
        assert data["program_session_id"] == str(bookable_session.id)

    @pytest.mark.asyncio
    async def test_tutorial_item_non_bookable_session_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
        program_slots: list[ProgramTimeSlot],
        program_track: ProgramTrack,
        tenant: Tenant,
    ) -> None:
        """Adding a tutorial item referencing a non-bookable session is rejected."""
        # Create a non-bookable session
        non_bookable = ProgramSession(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            start_slot_id=program_slots[1].id,
            start_track_id=program_track.id,
            title="Keynote",
            separately_bookable=False,
            slot_span=1,
            track_span=1,
        )
        db_session.add(non_bookable)

        # Mark conference as published
        conference.program_published_at = datetime.now(UTC)
        db_session.add(conference)
        await db_session.commit()

        # Create registration
        payload = {
            "attendee": {"first_name": "Bad", "last_name": "Tutorial", "email": "bad-tut@test.com"},
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(booking_option.id),
        }
        create_resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(admin_token),
        )
        reg_id = create_resp.json()["id"]

        # Add tutorial item referencing non-bookable session
        add_resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg_id}/items",
            json={
                "item_type": "tutorial",
                "program_session_id": str(non_bookable.id),
            },
            headers=auth_headers(admin_token),
        )
        assert add_resp.status_code == 400


# =========================================================================
# 11. List with Status Filter
# =========================================================================


class TestListWithStatusFilter:
    """Tests for list registrations with status filter."""

    @pytest.mark.asyncio
    async def test_filter_by_status(
        self,
        client: AsyncClient,
        tenant_with_all: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        booking_option: BookingOption,
    ) -> None:
        """Filter registrations by status returns only matching records."""
        # Create two registrations
        for i, email in enumerate(["status-a@test.com", "status-b@test.com"]):
            payload = {
                "attendee": {"first_name": f"Status{i}", "last_name": "Test", "email": email},
                "billing": BILLING_PAYLOAD,
                "booking_option_id": str(booking_option.id),
            }
            resp = await client.post(
                f"{BASE}/{conference.id}/registrations/individual",
                json=payload,
                headers=auth_headers(admin_token),
            )
            assert resp.status_code == 201
            if i == 0:
                reg_id = resp.json()["id"]

        # Set first one to paid
        await client.put(
            f"{BASE}/{conference.id}/registrations/{reg_id}",
            json={"status": "paid"},
            headers=auth_headers(admin_token),
        )

        # Filter by paid status
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"status": "paid"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["status"] == "paid"

        # Filter by pending invoice status
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"status": "registered_pending_invoice"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1
