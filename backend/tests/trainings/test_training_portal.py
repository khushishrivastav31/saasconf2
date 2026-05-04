"""Tests for the public training portal API.

Covers:
- Portal config endpoint (texts, VAT, exam languages)
- Training listing with filters (location, language, syllabus, guaranteed)
- Filter counts (location display fallback, guaranteed count)
- Training detail (exam_price, location_country, is_guaranteed)
- Registration (per-attendee exam pricing, VAT calculation, auto-guarantee)
- Guaranteed toggle endpoint
"""

import os
import uuid
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

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
from sqlalchemy.orm.attributes import flag_modified

from app.core.security import create_access_token, hash_password
from app.core.security.registrations import clear_rate_limits


@pytest.fixture(autouse=True)
def _reset_registration_rate_limits() -> None:  # type: ignore[misc]
    """Clear the in-memory IP rate-limit store before/after every test.

    Now that ``register_for_training`` runs through
    ``validate_registration_security`` (which keeps a per-IP counter), back-
    to-back tests in :class:`TestRegistration` would otherwise hit the
    3/hour cap on the 4th call from the same client IP.
    """
    clear_rate_limits()
    yield  # type: ignore[misc]
    clear_rate_limits()
from app.models.customer import Customer
from app.models.customer_offer import CustomerOffer
from app.models.location import Location
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.syllabus import Syllabus
from app.models.tenant import Tenant
from app.models.training import Training, TrainingLanguage
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User, UserRole
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_portal(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="Portal Tenant",
        slug=f"portal-tenant-{uuid.uuid4().hex[:6]}",
        is_active=True,
        country="Germany",
        city="Berlin",
        settings={
            "training_portal": {
                "enabled": True,
                "default_language": "en",
                "available_languages": ["en", "de"],
                "auto_guarantee_threshold": 2,
            },
            "training_finance": {
                "vat_rates": {"DE": 19, "AT": 20},
                "vat_rules": [
                    {
                        "attendance_type": "in_person",
                        "customer_type": "b2c",
                        "customer_location": "domestic",
                        "charge_vat": True,
                        "vat_rate_source": "training_country",
                        "reverse_charge": False,
                        "oss_applicable": False,
                    },
                    {
                        "attendance_type": "in_person",
                        "customer_type": "b2c",
                        "customer_location": "eu",
                        "charge_vat": True,
                        "vat_rate_source": "training_country",
                        "reverse_charge": False,
                        "oss_applicable": False,
                    },
                    {
                        "attendance_type": "in_person",
                        "customer_type": "b2c",
                        "customer_location": "non_eu",
                        "charge_vat": True,
                        "vat_rate_source": "training_country",
                        "reverse_charge": False,
                        "oss_applicable": False,
                    },
                    {
                        "attendance_type": "virtual",
                        "customer_type": "b2b",
                        "customer_location": "eu",
                        "charge_vat": False,
                        "vat_rate_source": "none",
                        "reverse_charge": True,
                        "oss_applicable": False,
                    },
                    {
                        "attendance_type": "virtual",
                        "customer_type": "b2c",
                        "customer_location": "eu",
                        "charge_vat": True,
                        "vat_rate_source": "customer_country",
                        "reverse_charge": False,
                        "oss_applicable": True,
                    },
                ],
                "eu_countries": ["DE", "AT", "FR", "NL", "BE"],
                "company_info": {"country": "DE"},
            },
        },
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_portal(db_session: AsyncSession, tenant_portal: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        email=f"admin-portal-{uuid.uuid4().hex[:6]}@test.com",
        first_name="Admin",
        last_name="Portal",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def lang_de(db_session: AsyncSession, tenant_portal: Tenant) -> TrainingLanguage:
    lang = TrainingLanguage(id=uuid.uuid4(), tenant_id=tenant_portal.id, name="Deutsch")
    db_session.add(lang)
    await db_session.commit()
    return lang


@pytest_asyncio.fixture
async def lang_en(db_session: AsyncSession, tenant_portal: Tenant) -> TrainingLanguage:
    lang = TrainingLanguage(id=uuid.uuid4(), tenant_id=tenant_portal.id, name="English")
    db_session.add(lang)
    await db_session.commit()
    return lang


@pytest_asyncio.fixture
async def syllabus_fl(db_session: AsyncSession, tenant_portal: Tenant) -> Syllabus:
    s = Syllabus(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        slug="istqb-fl",
        name="ISTQB Foundation Level",
        price=200.00,  # exam price
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture
async def location_berlin(db_session: AsyncSession, tenant_portal: Tenant) -> Location:
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        name="Schulungsraum Berlin",
        city="Berlin",
        country="DE",
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture
async def location_online(db_session: AsyncSession, tenant_portal: Tenant) -> Location:
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        name="Online",
        city="",
        country="",
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture
async def location_no_city(db_session: AsyncSession, tenant_portal: Tenant) -> Location:
    """Location with no city — should inherit tenant city (Berlin)."""
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        name="Schulungsraum 1",
        city="",
        country="",
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture
async def training_fl(
    db_session: AsyncSession,
    tenant_portal: Tenant,
    lang_de: TrainingLanguage,
    syllabus_fl: Syllabus,
) -> Training:
    t = Training(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        name="ISTQB FL Deutsch",
        slug="istqb-fl-de",
        abbreviation="FL-DE",
        duration=4,
        regular_price=1250.00,
        early_bird_price=1100.00,
        currency="EUR",
        language_id=lang_de.id,
        syllabus_id=syllabus_fl.id,
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def program_year(db_session: AsyncSession, tenant_portal: Tenant) -> TrainingProgramYear:
    py = TrainingProgramYear(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        year=2027,
        status="published",
    )
    db_session.add(py)
    await db_session.commit()
    return py


@pytest_asyncio.fixture
async def placement_berlin(
    db_session: AsyncSession,
    tenant_portal: Tenant,
    program_year: TrainingProgramYear,
    training_fl: Training,
    location_berlin: Location,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        program_year_id=program_year.id,
        training_id=training_fl.id,
        location_id=location_berlin.id,
        start_date=date.today() + timedelta(days=30),
        placement_type="open",
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def placement_online(
    db_session: AsyncSession,
    tenant_portal: Tenant,
    program_year: TrainingProgramYear,
    training_fl: Training,
    location_online: Location,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        program_year_id=program_year.id,
        training_id=training_fl.id,
        location_id=location_online.id,
        start_date=date.today() + timedelta(days=60),
        placement_type="open",
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def placement_no_city(
    db_session: AsyncSession,
    tenant_portal: Tenant,
    program_year: TrainingProgramYear,
    training_fl: Training,
    location_no_city: Location,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_portal.id,
        program_year_id=program_year.id,
        training_id=training_fl.id,
        location_id=location_no_city.id,
        start_date=date.today() + timedelta(days=90),
        placement_type="open",
    )
    db_session.add(p)
    await db_session.commit()
    return p


# ── Portal Config Tests ───────────────────────────────────────────────


class TestPortalConfig:
    @pytest.mark.asyncio
    async def test_portal_config_returns_vat_and_languages(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        lang_de: TrainingLanguage,
        lang_en: TrainingLanguage,
    ):
        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/portal-config")
        assert res.status_code == 200
        data = res.json()

        assert data["tenant_country"] == "DE"
        assert data["vat_rates"] == {"DE": 19, "AT": 20}
        assert len(data["vat_rules"]) == 5
        assert len(data["eu_countries"]) == 5
        assert data["default_language"] == "en"
        assert "en" in data["available_languages"]
        assert "de" in data["available_languages"]

        # Exam languages from TrainingLanguage
        lang_names = {el["name"] for el in data["exam_languages"]}
        assert "Deutsch" in lang_names
        assert "English" in lang_names

    @pytest.mark.asyncio
    async def test_portal_config_includes_default_texts(self, client: AsyncClient, tenant_portal: Tenant):
        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/portal-config")
        data = res.json()
        assert "guaranteed" in data["portal_texts"]["en"]
        assert data["portal_texts"]["de"]["guaranteed"] == "Garantiert"
        assert "label_certification_exam" in data["portal_texts"]["en"]

    @pytest.mark.asyncio
    async def test_portal_disabled_returns_403(
        self, client: AsyncClient, db_session: AsyncSession, tenant_portal: Tenant
    ):
        tenant_portal.settings["training_portal"]["enabled"] = False
        flag_modified(tenant_portal, "settings")
        await db_session.commit()

        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/portal-config")
        assert res.status_code == 403


# ── Training Listing Tests ────────────────────────────────────────────


class TestTrainingListing:
    @pytest.mark.asyncio
    async def test_list_returns_placements(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1
        item = next(i for i in data["items"] if i["placement_id"] == str(placement_berlin.id))
        assert item["training_name"] == "ISTQB FL Deutsch"
        assert item["exam_price"] == "200.00"
        assert item["location_country"] == "DE"
        assert item["is_guaranteed"] is False

    @pytest.mark.asyncio
    async def test_location_city_fallback_to_tenant(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_no_city: ProgramYearTraining,
    ):
        """Location without city should inherit tenant's city (Berlin)."""
        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings")
        data = res.json()
        item = next(i for i in data["items"] if i["placement_id"] == str(placement_no_city.id))
        assert item["location_city"] == "Berlin"
        assert item["location_country"] == "DE"

    @pytest.mark.asyncio
    async def test_online_location_shows_name(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_online: ProgramYearTraining,
    ):
        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings")
        data = res.json()
        item = next(i for i in data["items"] if i["placement_id"] == str(placement_online.id))
        assert item["location_city"] == "Online"

    @pytest.mark.asyncio
    async def test_filter_by_guaranteed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
        placement_online: ProgramYearTraining,
    ):
        # Mark one as guaranteed
        placement_berlin.is_guaranteed = True
        await db_session.commit()

        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings",
            params={"guaranteed": "true"},
        )
        data = res.json()
        assert data["total"] == 1
        assert data["items"][0]["placement_id"] == str(placement_berlin.id)
        assert data["items"][0]["is_guaranteed"] is True


# ── Filter Counts Tests ───────────────────────────────────────────────


class TestFilterCounts:
    @pytest.mark.asyncio
    async def test_location_filter_counts(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
        placement_online: ProgramYearTraining,
        placement_no_city: ProgramYearTraining,
    ):
        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/filters")
        assert res.status_code == 200
        data = res.json()

        loc_values = {loc["value"] for loc in data["locations"]}
        assert "Berlin" in loc_values
        assert "Online" in loc_values
        # "Schulungsraum 1" should NOT appear — it falls back to "Berlin"
        assert "Schulungsraum 1" not in loc_values

    @pytest.mark.asyncio
    async def test_guaranteed_count(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
        placement_online: ProgramYearTraining,
    ):
        placement_berlin.is_guaranteed = True
        await db_session.commit()

        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/filters")
        data = res.json()
        assert data["guaranteed_count"] == 1


# ── Training Detail Tests ─────────────────────────────────────────────


class TestTrainingDetail:
    @pytest.mark.asyncio
    async def test_detail_includes_exam_price(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/{placement_berlin.id}")
        assert res.status_code == 200
        data = res.json()
        assert data["exam_price"] == "200.00"
        assert data["syllabus_name"] == "ISTQB Foundation Level"
        assert data["location_country"] == "DE"

    @pytest.mark.asyncio
    async def test_detail_not_found_for_past(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        placement_berlin.start_date = date.today() - timedelta(days=1)
        await db_session.commit()

        res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/{placement_berlin.id}")
        assert res.status_code == 404


# ── Registration Tests ────────────────────────────────────────────────


class TestRegistration:
    def _reg_payload(
        self,
        placement_id: uuid.UUID,
        attendees: list[dict] | None = None,
        country: str = "DE",
    ) -> dict:
        return {
            "placement_id": str(placement_id),
            "billing": {
                "street": "Teststr. 1",
                "postal_code": "10115",
                "city": "Berlin",
                "country": country,
                "contact_first_name": "Max",
                "contact_last_name": "Muster",
                "contact_email": "max@test.de",
                "payment_method": "bank_transfer",
            },
            "attendees": attendees
            or [
                {
                    "first_name": "Max",
                    "last_name": "Muster",
                    "email": "max@test.de",
                    "exam_mode": "none",
                }
            ],
            "language": "de",
        }

    @pytest.mark.asyncio
    async def test_register_without_exam(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        payload = self._reg_payload(placement_berlin.id)
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["attendee_count"] == 1
        # Price: 1250 * 1 (no exam) + 19% VAT = 1250 + 237.50 = 1487.50
        total = float(data["total"])
        assert total == 1487.5

    @pytest.mark.asyncio
    async def test_register_with_exam(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        payload = self._reg_payload(
            placement_berlin.id,
            attendees=[
                {
                    "first_name": "Alice",
                    "last_name": "Test",
                    "email": "alice@test.de",
                    "exam_mode": "online",
                    "exam_language": "Deutsch",
                    "extra_time": False,
                },
            ],
        )
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 200
        data = res.json()
        # Price: (1250 + 200) * 1 + 19% = 1450 + 275.50 = 1725.50
        total = float(data["total"])
        assert total == 1725.5

    @pytest.mark.asyncio
    async def test_register_mixed_exam_attendees(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        payload = self._reg_payload(
            placement_berlin.id,
            attendees=[
                {
                    "first_name": "Alice",
                    "last_name": "Test",
                    "email": "alice@test.de",
                    "exam_mode": "onsite",
                    "exam_language": "Deutsch",
                },
                {
                    "first_name": "Bob",
                    "last_name": "Test",
                    "email": "bob@test.de",
                    "exam_mode": "none",
                },
            ],
        )
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["attendee_count"] == 2
        # Price: training=1250*2=2500, exam=200*1=200, subtotal=2700
        # VAT 19% of 2700 = 513.0, total = 3213.0
        total = float(data["total"])
        assert total == 3213.0

    @pytest.mark.asyncio
    async def test_vat_not_charged_for_virtual_b2b_eu(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_online: ProgramYearTraining,
    ):
        """Virtual B2B EU → reverse charge, no VAT."""
        payload = self._reg_payload(
            placement_online.id,
            country="AT",
        )
        payload["billing"]["company_name"] = "Austrian GmbH"
        payload["billing"]["vat_number"] = "ATU12345678"

        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 200
        data = res.json()
        # No VAT for virtual B2B EU (reverse charge)
        total = float(data["total"])
        assert total == 1250.0  # just training, no VAT

    @pytest.mark.asyncio
    async def test_auto_guarantee_threshold(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """After reaching threshold (2 attendees), placement is auto-guaranteed."""
        assert placement_berlin.is_guaranteed is False

        payload = self._reg_payload(
            placement_berlin.id,
            attendees=[
                {"first_name": "A", "last_name": "A", "email": "a@test.de", "exam_mode": "none"},
                {"first_name": "B", "last_name": "B", "email": "b@test.de", "exam_mode": "none"},
            ],
        )
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 200

        # Refresh and check
        await db_session.refresh(placement_berlin)
        assert placement_berlin.is_guaranteed is True

    @pytest.mark.asyncio
    async def test_over_100_attendees_rejected(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        attendees = [
            {"first_name": f"A{i}", "last_name": "Test", "email": f"a{i}@test.de", "exam_mode": "none"}
            for i in range(101)
        ]
        payload = self._reg_payload(placement_berlin.id, attendees=attendees)
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_register_rejects_filled_honeypot(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """A non-empty honeypot value is the universal bot signal — 400."""
        payload = self._reg_payload(placement_berlin.id)
        payload["honeypot_field"] = "im-a-bot"
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 400
        assert "Invalid form submission" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_rejects_form_submitted_too_quickly(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """Submission less than 5 sec after the form mounted is bot-shaped."""
        import time

        payload = self._reg_payload(placement_berlin.id)
        payload["form_start_timestamp"] = time.time()  # "just now"
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 400
        assert "too quickly" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_rate_limit_429_after_three_per_hour(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """The IP-based 3/hour limit kicks in on the 4th submission.

        ``validate_registration_security`` is the first thing the endpoint
        runs (after tenant resolution) and increments a per-IP counter on
        every successful pass. The autouse ``_reset_registration_rate_limits``
        fixture clears the store at the start of each test, so the first
        three calls here always succeed and the fourth always trips the
        limit — independent of how many other tests in the suite have
        already hit the endpoint.
        """
        # First three registrations succeed (counter increments to 3)
        for i in range(3):
            payload = self._reg_payload(
                placement_berlin.id,
                attendees=[
                    {
                        "first_name": f"Rate{i}",
                        "last_name": "Test",
                        "email": f"rate-limit-{i}@example.de",
                        "exam_mode": "none",
                    }
                ],
            )
            payload["billing"]["contact_email"] = f"rate-limit-{i}@example.de"
            res = await client.post(
                f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
                json=payload,
            )
            assert res.status_code == 200, f"call {i + 1} expected 200, got {res.status_code}: {res.text}"

        # Fourth call from the same IP should be rate-limited
        payload = self._reg_payload(
            placement_berlin.id,
            attendees=[
                {
                    "first_name": "Rate4",
                    "last_name": "Test",
                    "email": "rate-limit-4@example.de",
                    "exam_mode": "none",
                }
            ],
        )
        payload["billing"]["contact_email"] = "rate-limit-4@example.de"
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 429
        assert "Rate limit exceeded" in res.json()["detail"]


# ── Guaranteed Toggle Tests ───────────────────────────────────────────


class TestGuaranteedToggle:
    @pytest.mark.asyncio
    async def test_toggle_guaranteed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        program_year: TrainingProgramYear,
        placement_berlin: ProgramYearTraining,
    ):
        token = _make_token(admin_portal, modules=["trainings"])
        url = f"/api/v1/trainings/programs/years/{program_year.id}/trainings/{placement_berlin.id}/guaranteed"

        # Toggle on
        res = await client.patch(url, headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_guaranteed"] is True

        # Toggle off
        res = await client.patch(url, headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_guaranteed"] is False

    @pytest.mark.asyncio
    async def test_toggle_nonexistent_returns_404(
        self,
        client: AsyncClient,
        admin_portal: User,
        program_year: TrainingProgramYear,
    ):
        token = _make_token(admin_portal, modules=["trainings"])
        url = f"/api/v1/trainings/programs/years/{program_year.id}/trainings/{uuid.uuid4()}/guaranteed"
        res = await client.patch(url, headers=auth_headers(token))
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_guaranteed_reflected_in_registration_form(
        self,
        client: AsyncClient,
        admin_portal: User,
        tenant_portal: Tenant,
        program_year: TrainingProgramYear,
        placement_berlin: ProgramYearTraining,
    ):
        """Admin marks a training guaranteed → portal listing + detail show it."""
        # Baseline: listing and detail report is_guaranteed=False
        list_res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings")
        item = next(i for i in list_res.json()["items"] if i["placement_id"] == str(placement_berlin.id))
        assert item["is_guaranteed"] is False

        detail_res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/{placement_berlin.id}")
        assert detail_res.json()["is_guaranteed"] is False

        # Admin toggles guaranteed on
        token = _make_token(admin_portal, modules=["trainings"])
        toggle_url = f"/api/v1/trainings/programs/years/{program_year.id}/trainings/{placement_berlin.id}/guaranteed"
        toggle_res = await client.patch(toggle_url, headers=auth_headers(token))
        assert toggle_res.status_code == 200
        assert toggle_res.json()["is_guaranteed"] is True

        # Portal listing + detail now report the training as guaranteed
        list_res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings")
        item = next(i for i in list_res.json()["items"] if i["placement_id"] == str(placement_berlin.id))
        assert item["is_guaranteed"] is True

        detail_res = await client.get(f"/api/v1/portal/{tenant_portal.slug}/trainings/{placement_berlin.id}")
        assert detail_res.json()["is_guaranteed"] is True


# ── Active Toggle Tests ───────────────────────────────────────────────


class TestActiveToggle:
    @pytest.mark.asyncio
    async def test_active_toggle_hides_and_shows_in_registration_form(
        self,
        client: AsyncClient,
        admin_portal: User,
        tenant_portal: Tenant,
        program_year: TrainingProgramYear,
        placement_berlin: ProgramYearTraining,
    ):
        """Deactivated placements disappear from the public portal; reactivating restores them."""
        list_url = f"/api/v1/portal/{tenant_portal.slug}/trainings"
        detail_url = f"/api/v1/portal/{tenant_portal.slug}/trainings/{placement_berlin.id}"

        # Baseline: placement is active and visible
        list_res = await client.get(list_url)
        ids = {i["placement_id"] for i in list_res.json()["items"]}
        assert str(placement_berlin.id) in ids

        detail_res = await client.get(detail_url)
        assert detail_res.status_code == 200

        # Admin deactivates the placement (no attendees → allowed)
        token = _make_token(admin_portal, modules=["trainings"])
        toggle_url = f"/api/v1/trainings/programs/years/{program_year.id}/trainings/{placement_berlin.id}/active"
        toggle_res = await client.patch(toggle_url, headers=auth_headers(token))
        assert toggle_res.status_code == 200
        assert toggle_res.json()["is_active"] is False

        # Portal listing no longer includes it; detail returns 404
        list_res = await client.get(list_url)
        ids = {i["placement_id"] for i in list_res.json()["items"]}
        assert str(placement_berlin.id) not in ids

        detail_res = await client.get(detail_url)
        assert detail_res.status_code == 404

        # Admin reactivates the placement
        toggle_res = await client.patch(toggle_url, headers=auth_headers(token))
        assert toggle_res.status_code == 200
        assert toggle_res.json()["is_active"] is True

        # Portal listing + detail are visible again
        list_res = await client.get(list_url)
        ids = {i["placement_id"] for i in list_res.json()["items"]}
        assert str(placement_berlin.id) in ids

        detail_res = await client.get(detail_url)
        assert detail_res.status_code == 200

    @pytest.mark.asyncio
    async def test_cannot_deactivate_with_registrations(
        self,
        client: AsyncClient,
        admin_portal: User,
        tenant_portal: Tenant,
        program_year: TrainingProgramYear,
        placement_berlin: ProgramYearTraining,
    ):
        """Deactivation is blocked (409) when the placement has non-cancelled registrations."""
        # Register one attendee via the public portal
        payload = {
            "placement_id": str(placement_berlin.id),
            "billing": {
                "street": "Teststr. 1",
                "postal_code": "10115",
                "city": "Berlin",
                "country": "DE",
                "contact_first_name": "Max",
                "contact_last_name": "Muster",
                "contact_email": "max@test.de",
                "payment_method": "bank_transfer",
            },
            "attendees": [
                {
                    "first_name": "Max",
                    "last_name": "Muster",
                    "email": "max@test.de",
                    "exam_mode": "none",
                }
            ],
            "language": "de",
        }
        reg_res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert reg_res.status_code == 200

        token = _make_token(admin_portal, modules=["trainings"])
        toggle_url = f"/api/v1/trainings/programs/years/{program_year.id}/trainings/{placement_berlin.id}/active"
        res = await client.patch(toggle_url, headers=auth_headers(token))
        assert res.status_code == 409

    @pytest.mark.asyncio
    async def test_cannot_deactivate_with_accepted_offer(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
        program_year: TrainingProgramYear,
        placement_berlin: ProgramYearTraining,
    ):
        """Deactivation is blocked (409) when an accepted offer references the placement."""
        customer = Customer(
            id=uuid.uuid4(),
            tenant_id=tenant_portal.id,
            name=f"Cust {uuid.uuid4().hex[:6]}",
        )
        db_session.add(customer)
        await db_session.flush()
        offer = CustomerOffer(
            id=uuid.uuid4(),
            tenant_id=tenant_portal.id,
            customer_id=customer.id,
            offer_number=f"O-{uuid.uuid4().hex[:6]}",
            status="accepted",
        )
        db_session.add(offer)
        await db_session.flush()
        att = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant_portal.id,
            first_name="Off",
            last_name="Att",
            email=f"off-{uuid.uuid4().hex[:6]}@test.de",
            status="active",
        )
        db_session.add(att)
        await db_session.flush()
        oa = OfferAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant_portal.id,
            offer_id=offer.id,
            placement_id=placement_berlin.id,
            attendee_id=att.id,
            first_name=att.first_name,
            last_name=att.last_name,
            email=att.email,
        )
        db_session.add(oa)
        await db_session.commit()

        token = _make_token(admin_portal, modules=["trainings"])
        toggle_url = f"/api/v1/trainings/programs/years/{program_year.id}/trainings/{placement_berlin.id}/active"
        res = await client.patch(toggle_url, headers=auth_headers(token))
        assert res.status_code == 409

    @pytest.mark.asyncio
    async def test_toggle_active_404_when_placement_missing(
        self,
        client: AsyncClient,
        admin_portal: User,
        program_year: TrainingProgramYear,
    ):
        token = _make_token(admin_portal, modules=["trainings"])
        toggle_url = f"/api/v1/trainings/programs/years/{program_year.id}/trainings/{uuid.uuid4()}/active"
        res = await client.patch(toggle_url, headers=auth_headers(token))
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_toggle_active_404_when_year_id_mismatch(
        self,
        client: AsyncClient,
        admin_portal: User,
        placement_berlin: ProgramYearTraining,
    ):
        """A placement under a different year_id must not be togglable via this path."""
        token = _make_token(admin_portal, modules=["trainings"])
        wrong_year = uuid.uuid4()
        toggle_url = f"/api/v1/trainings/programs/years/{wrong_year}/trainings/{placement_berlin.id}/active"
        res = await client.patch(toggle_url, headers=auth_headers(token))
        assert res.status_code == 404


# ── Portal User Deactivation Tests ────────────────────────────────────


class TestPortalUserDeactivation:
    """A portal user can only be deactivated if not assigned to any active training."""

    async def _make_portal_user(self, db_session: AsyncSession, tenant: Tenant, email_suffix: str = "") -> PortalUser:
        pu = PortalUser(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            email=f"portal-{email_suffix}-{uuid.uuid4().hex[:6]}@test.de",
            first_name="Port",
            last_name="User",
            is_active=True,
        )
        db_session.add(pu)
        await db_session.commit()
        return pu

    async def _make_attendee(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        portal_user: PortalUser,
        status: str = "active",
    ) -> TrainingAttendee:
        att = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name=portal_user.first_name,
            last_name=portal_user.last_name,
            email=portal_user.email,
            status=status,
            portal_user_id=portal_user.id,
        )
        db_session.add(att)
        await db_session.commit()
        return att

    async def _link_via_registration(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        placement: ProgramYearTraining,
        attendee: TrainingAttendee,
        reg_status: str = "registered",
    ) -> None:
        reg = TrainingRegistration(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            placement_id=placement.id,
            status=reg_status,
            street="Teststr. 1",
            postal_code="10115",
            city="Berlin",
            country="DE",
            contact_first_name=attendee.first_name,
            contact_last_name=attendee.last_name,
            contact_email=attendee.email,
        )
        db_session.add(reg)
        await db_session.flush()
        ra = TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            registration_id=reg.id,
            attendee_id=attendee.id,
            first_name=attendee.first_name,
            last_name=attendee.last_name,
            email=attendee.email,
        )
        db_session.add(ra)
        await db_session.commit()

    async def _link_via_offer(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        placement: ProgramYearTraining,
        attendee: TrainingAttendee,
        offer_status: str = "accepted",
    ) -> None:
        customer = Customer(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name=f"Cust {uuid.uuid4().hex[:6]}",
        )
        db_session.add(customer)
        await db_session.flush()
        offer = CustomerOffer(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            customer_id=customer.id,
            offer_number=f"O-{uuid.uuid4().hex[:6]}",
            status=offer_status,
        )
        db_session.add(offer)
        await db_session.flush()
        oa = OfferAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            offer_id=offer.id,
            placement_id=placement.id,
            attendee_id=attendee.id,
            first_name=attendee.first_name,
            last_name=attendee.last_name,
            email=attendee.email,
        )
        db_session.add(oa)
        await db_session.commit()

    @pytest.mark.asyncio
    async def test_deactivate_succeeds_when_no_assignments(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        """Portal user with no attendee record can be deactivated."""
        pu = await self._make_portal_user(db_session, tenant_portal, "noass")
        token = _make_token(admin_portal, modules=["trainings"])

        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_deactivate_blocked_by_active_registration(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """Portal user linked to non-cancelled registration on an active placement → 409."""
        pu = await self._make_portal_user(db_session, tenant_portal, "reg")
        att = await self._make_attendee(db_session, tenant_portal, pu, status="active")
        await self._link_via_registration(db_session, tenant_portal, placement_berlin, att)

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 409
        assert "active training" in res.json()["detail"].lower()

        await db_session.refresh(pu)
        assert pu.is_active is True

    @pytest.mark.asyncio
    async def test_deactivate_blocked_by_accepted_offer(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """Portal user linked to an accepted offer on an active placement → 409."""
        pu = await self._make_portal_user(db_session, tenant_portal, "offer")
        att = await self._make_attendee(db_session, tenant_portal, pu, status="active")
        await self._link_via_offer(db_session, tenant_portal, placement_berlin, att, offer_status="accepted")

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 409

        await db_session.refresh(pu)
        assert pu.is_active is True

    @pytest.mark.asyncio
    async def test_deactivate_allowed_when_attendee_parked(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """Parked attendees do not block deactivation."""
        pu = await self._make_portal_user(db_session, tenant_portal, "parked")
        att = await self._make_attendee(db_session, tenant_portal, pu, status="parked")
        await self._link_via_registration(db_session, tenant_portal, placement_berlin, att)

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_deactivate_allowed_when_placement_inactive(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """Registrations on an inactive placement do not block deactivation."""
        placement_berlin.is_active = False
        await db_session.commit()

        pu = await self._make_portal_user(db_session, tenant_portal, "inactive")
        att = await self._make_attendee(db_session, tenant_portal, pu, status="active")
        await self._link_via_registration(db_session, tenant_portal, placement_berlin, att)

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_deactivate_allowed_when_registration_cancelled(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """Cancelled registrations do not block deactivation."""
        pu = await self._make_portal_user(db_session, tenant_portal, "cancelled")
        att = await self._make_attendee(db_session, tenant_portal, pu, status="active")
        await self._link_via_registration(db_session, tenant_portal, placement_berlin, att, reg_status="cancelled")

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_deactivate_allowed_when_offer_not_accepted(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """Draft offers do not block deactivation — only accepted offers do."""
        pu = await self._make_portal_user(db_session, tenant_portal, "draftoffer")
        att = await self._make_attendee(db_session, tenant_portal, pu, status="active")
        await self._link_via_offer(db_session, tenant_portal, placement_berlin, att, offer_status="draft")

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_reactivation_always_allowed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        """Reactivating an already-deactivated user is always allowed, even with active assignments."""
        pu = await self._make_portal_user(db_session, tenant_portal, "reactiv")
        pu.is_active = False
        await db_session.commit()

        att = await self._make_attendee(db_session, tenant_portal, pu, status="active")
        await self._link_via_registration(db_session, tenant_portal, placement_berlin, att)

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_active"] is True

    # ── Toggle-access does NOT mutate attendee.status (effective-status derivation does) ──

    @pytest.mark.asyncio
    async def test_deactivating_user_logs_history_and_keeps_attendee_status(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        """Toggle Access toggles PortalUser.is_active only — attendee.status stays untouched. A 'portal_deactivated' history event is written."""
        pu = await self._make_portal_user(db_session, tenant_portal, "park2inact")
        att = await self._make_attendee(db_session, tenant_portal, pu, status="parked")

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200

        await db_session.refresh(att)
        assert att.status == "parked"

        events = (
            (
                await db_session.execute(
                    select(TrainingAttendeeHistory).where(TrainingAttendeeHistory.attendee_id == att.id)
                )
            )
            .scalars()
            .all()
        )
        # attendee.status is NOT mutated, so no "deactivated"/"reactivated" events
        assert not any(e.event_type in {"deactivated", "reactivated"} for e in events)
        # but a portal_deactivated audit trail IS written
        assert any(e.event_type == "portal_deactivated" for e in events)

    @pytest.mark.asyncio
    async def test_inactive_attendee_excluded_from_parking_lot_list(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        """GET /trainings/attendees?status=parked must not return attendees whose portal user has been deactivated."""
        pu = await self._make_portal_user(db_session, tenant_portal, "parklot")
        att = await self._make_attendee(db_session, tenant_portal, pu, status="parked")

        token = _make_token(admin_portal, modules=["trainings"])

        before = await client.get("/api/v1/trainings/attendees?status=parked", headers=auth_headers(token))
        assert before.status_code == 200
        assert any(item["id"] == str(att.id) for item in before.json()["items"])

        toggle = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert toggle.status_code == 200

        after = await client.get("/api/v1/trainings/attendees?status=parked", headers=auth_headers(token))
        assert after.status_code == 200
        assert all(item["id"] != str(att.id) for item in after.json()["items"])

    @pytest.mark.asyncio
    async def test_activating_user_logs_history_and_keeps_inactive_attendee(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        """Activating a portal user whose attendee is explicitly 'inactive' → attendee stays 'inactive'. A 'portal_activated' history event is written."""
        pu = await self._make_portal_user(db_session, tenant_portal, "reparked")
        pu.is_active = False
        await db_session.commit()

        att = await self._make_attendee(db_session, tenant_portal, pu, status="inactive")

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_active"] is True

        await db_session.refresh(att)
        assert att.status == "inactive"

        events = (
            (
                await db_session.execute(
                    select(TrainingAttendeeHistory).where(TrainingAttendeeHistory.attendee_id == att.id)
                )
            )
            .scalars()
            .all()
        )
        # reactivating the portal does NOT restore the attendee to parked
        assert not any(e.event_type == "reactivated" for e in events)
        # but a portal_activated audit trail IS written
        assert any(e.event_type == "portal_activated" for e in events)

    @pytest.mark.asyncio
    async def test_deactivating_user_leaves_active_attendee_untouched(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        """An active attendee without active assignments: toggle access leaves status intact; writes a portal_deactivated audit event only."""
        pu = await self._make_portal_user(db_session, tenant_portal, "stayact")
        # Active attendee with no registration/offer — not blocked by guard, but not parked either.
        att = await self._make_attendee(db_session, tenant_portal, pu, status="active")

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.put(f"/api/v1/trainings/users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200

        await db_session.refresh(att)
        assert att.status == "active"

        events = (
            (
                await db_session.execute(
                    select(TrainingAttendeeHistory).where(TrainingAttendeeHistory.attendee_id == att.id)
                )
            )
            .scalars()
            .all()
        )
        # attendee.status is NOT mutated
        assert not any(e.event_type == "deactivated" for e in events)
        # audit trail is written
        assert any(e.event_type == "portal_deactivated" for e in events)


# ── Training user_management: resend/reset/impersonate/merge ──────────


class TestTrainingUserAccessActions:
    async def _make_portal_user(
        self, db_session: AsyncSession, tenant: Tenant, email_suffix: str = "", active: bool = True
    ) -> PortalUser:
        pu = PortalUser(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            email=f"tu-{email_suffix}-{uuid.uuid4().hex[:6]}@test.de",
            first_name="Trainee",
            last_name="User",
            is_active=active,
        )
        db_session.add(pu)
        await db_session.commit()
        return pu

    @pytest.mark.asyncio
    async def test_resend_invite_sends_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        pu = await self._make_portal_user(db_session, tenant_portal, "inv")
        token = _make_token(admin_portal, modules=["trainings"])

        mock_send = AsyncMock()
        with patch("app.core.email.send_email", mock_send):
            res = await client.post(
                f"/api/v1/trainings/users/{pu.id}/resend-invite",
                headers=auth_headers(token),
            )
        assert res.status_code == 200
        assert res.json()["message"] == "Invite email sent"
        mock_send.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_resend_invite_404_when_user_missing(
        self,
        client: AsyncClient,
        admin_portal: User,
    ):
        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.post(
            f"/api/v1/trainings/users/{uuid.uuid4()}/resend-invite",
            headers=auth_headers(token),
        )
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_reset_password_sends_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        pu = await self._make_portal_user(db_session, tenant_portal, "rst")
        token = _make_token(admin_portal, modules=["trainings"])

        mock_send = AsyncMock()
        with patch("app.core.email.send_email", mock_send):
            res = await client.post(
                f"/api/v1/trainings/users/{pu.id}/reset-password",
                headers=auth_headers(token),
            )
        assert res.status_code == 200
        mock_send.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_impersonate_returns_access_token(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        pu = await self._make_portal_user(db_session, tenant_portal, "imp")
        token = _make_token(admin_portal, modules=["trainings"])

        res = await client.post(
            f"/api/v1/trainings/users/{pu.id}/impersonate",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["access_token"]
        assert data["token_type"] == "bearer"
        assert data["portal_user_email"] == pu.email
        assert data["portal_user_name"].startswith("Trainee")

    @pytest.mark.asyncio
    async def test_impersonate_blocked_for_inactive_user(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        pu = await self._make_portal_user(db_session, tenant_portal, "impoff", active=False)
        token = _make_token(admin_portal, modules=["trainings"])

        res = await client.post(
            f"/api/v1/trainings/users/{pu.id}/impersonate",
            headers=auth_headers(token),
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_merge_rejects_self(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        pu = await self._make_portal_user(db_session, tenant_portal, "self")
        token = _make_token(admin_portal, modules=["trainings"])

        res = await client.post(
            f"/api/v1/trainings/users/{pu.id}/merge",
            headers=auth_headers(token),
            json={"source_user_id": str(pu.id)},
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_merge_moves_attendees_and_deletes_source(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_portal: User,
        tenant_portal: Tenant,
    ):
        target = await self._make_portal_user(db_session, tenant_portal, "tgt")
        source = await self._make_portal_user(db_session, tenant_portal, "src")

        src_att = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant_portal.id,
            first_name="Src",
            last_name="Att",
            email=f"src-att-{uuid.uuid4().hex[:6]}@test.de",
            status="active",
            portal_user_id=source.id,
        )
        db_session.add(src_att)
        await db_session.commit()

        token = _make_token(admin_portal, modules=["trainings"])
        res = await client.post(
            f"/api/v1/trainings/users/{target.id}/merge",
            headers=auth_headers(token),
            json={"source_user_id": str(source.id)},
        )
        assert res.status_code == 200
        assert res.json()["merged_records"] >= 1

        await db_session.refresh(src_att)
        assert src_att.portal_user_id == target.id

        src_exists = await db_session.execute(select(PortalUser).where(PortalUser.id == source.id))
        assert src_exists.scalar_one_or_none() is None
