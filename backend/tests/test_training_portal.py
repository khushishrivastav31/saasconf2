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
from sqlalchemy.orm.attributes import flag_modified

from app.core.security import create_access_token, hash_password
from app.models.location import Location
from app.models.syllabus import Syllabus
from app.models.tenant import Tenant
from app.models.training import Training, TrainingLanguage
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
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
    lang = TrainingLanguage(
        id=uuid.uuid4(), tenant_id=tenant_portal.id, name="Deutsch"
    )
    db_session.add(lang)
    await db_session.commit()
    return lang


@pytest_asyncio.fixture
async def lang_en(db_session: AsyncSession, tenant_portal: Tenant) -> TrainingLanguage:
    lang = TrainingLanguage(
        id=uuid.uuid4(), tenant_id=tenant_portal.id, name="English"
    )
    db_session.add(lang)
    await db_session.commit()
    return lang


@pytest_asyncio.fixture
async def syllabus_fl(
    db_session: AsyncSession, tenant_portal: Tenant
) -> Syllabus:
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
async def program_year(
    db_session: AsyncSession, tenant_portal: Tenant
) -> TrainingProgramYear:
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
        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/portal-config"
        )
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
    async def test_portal_config_includes_default_texts(
        self, client: AsyncClient, tenant_portal: Tenant
    ):
        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/portal-config"
        )
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

        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/portal-config"
        )
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
        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings"
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1
        item = next(
            i for i in data["items"] if i["placement_id"] == str(placement_berlin.id)
        )
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
        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings"
        )
        data = res.json()
        item = next(
            i for i in data["items"] if i["placement_id"] == str(placement_no_city.id)
        )
        assert item["location_city"] == "Berlin"
        assert item["location_country"] == "DE"

    @pytest.mark.asyncio
    async def test_online_location_shows_name(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_online: ProgramYearTraining,
    ):
        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings"
        )
        data = res.json()
        item = next(
            i for i in data["items"] if i["placement_id"] == str(placement_online.id)
        )
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
        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/filters"
        )
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

        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/filters"
        )
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
        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/{placement_berlin.id}"
        )
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

        res = await client.get(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/{placement_berlin.id}"
        )
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
    async def test_honeypot_rejected(
        self,
        client: AsyncClient,
        tenant_portal: Tenant,
        placement_berlin: ProgramYearTraining,
    ):
        payload = self._reg_payload(placement_berlin.id)
        payload["honeypot_field"] = "spam"
        res = await client.post(
            f"/api/v1/portal/{tenant_portal.slug}/trainings/register",
            json=payload,
        )
        assert res.status_code == 422

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
