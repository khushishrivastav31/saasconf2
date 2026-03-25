"""Tests for conference duplication (conference_duplicate.py).

Calls duplicate_conference() directly against the test DB and asserts
that all expected data is copied with correct UUID re-mapping.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.conference_duplicate import duplicate_conference
from app.core.default_settings import seed_default_settings
from app.models.alumni import Alumni
from app.models.booking import (
    BookingOption,
    BookingPackage,
    BookingPackageOption,
    BookingPeriod,
    DiscountCode,
    DiscountCodeOption,
    DiscountCodePeriod,
)
from app.models.budget import BudgetCategory
from app.models.conference import Conference
from app.models.form_schema import ConferencePaperFormSchema
from app.models.review import (
    ReviewCriterion,
    ReviewFormSettings,
    ReviewQuestion,
    ReviewScoreScale,
)
from app.models.screen_overlay import ScreenOverlay
from app.models.settings import (
    CFPCommitteeRole,
    ConferenceCurrency,
    EmailTemplate,
    SessionType,
    SponsorPackage,
    TenantLocationType,
    VolunteerRole,
)
from app.models.tenant import Tenant
from app.schemas.conference import DuplicateConferenceRequest

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _count(db: AsyncSession, model: type, conference_id: uuid.UUID | None = None) -> int:
    q = select(func.count()).select_from(model)
    if conference_id is not None and hasattr(model, "conference_id"):
        q = q.where(model.conference_id == conference_id)  # type: ignore[arg-type]
    result = await db.execute(q)
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def source_conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Create a source conference with start_date, currency, and seed defaults."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="SourceConf 2025",
        abbreviation="SC25",
        is_active=True,
        start_date=date(2025, 9, 15),
        end_date=date(2025, 9, 18),
        currency="EUR",
        timezone="Europe/Berlin",
        locale="en",
        city="Berlin",
        country="DE",
        venue_name="Berlin Congress Center",
        social_links={"linkedin": "https://linkedin.com/test"},
        team_members=[{"first_name": "John", "last_name": "Doe", "role": "Chair"}],
        settings={"custom_key": "custom_value"},
    )
    db_session.add(c)
    await db_session.commit()

    # Seed defaults so source has baseline data
    await seed_default_settings(db_session, tenant.id, c.id, locale="en")
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def source_with_extras(db_session: AsyncSession, source_conference: Conference) -> Conference:
    """Add extra data to source conference: booking matrix, discount codes, alumni, etc."""
    tid = source_conference.tenant_id
    cid = source_conference.id

    # Booking periods (use unique names to avoid conflict with seed data)
    period1_id = uuid.uuid4()
    period2_id = uuid.uuid4()
    db_session.add(
        BookingPeriod(
            id=period1_id,
            tenant_id=tid,
            conference_id=cid,
            name="Custom Early",
            start_date=date(2025, 3, 1),
            end_date=date(2025, 6, 30),
            sort_order=10,
            currency="EUR",
        )
    )
    db_session.add(
        BookingPeriod(
            id=period2_id,
            tenant_id=tid,
            conference_id=cid,
            name="Custom Regular",
            start_date=date(2025, 7, 1),
            end_date=date(2025, 9, 14),
            sort_order=11,
            currency="EUR",
        )
    )
    await db_session.flush()

    # Booking options
    opt1_id = uuid.uuid4()
    opt2_id = uuid.uuid4()
    db_session.add(
        BookingOption(
            id=opt1_id, tenant_id=tid, conference_id=cid, name="Full Pass", sort_order=0, attendance_type="onsite"
        )
    )
    db_session.add(
        BookingOption(
            id=opt2_id, tenant_id=tid, conference_id=cid, name="Tutorial Only", sort_order=1, attendance_type="onsite"
        )
    )
    await db_session.flush()

    # Set prices on periods (keys = option UUIDs)
    p1_result = await db_session.execute(select(BookingPeriod).where(BookingPeriod.id == period1_id))
    p1 = p1_result.scalar_one()
    p1.prices = {str(opt1_id): 200, str(opt2_id): 100}

    p2_result = await db_session.execute(select(BookingPeriod).where(BookingPeriod.id == period2_id))
    p2 = p2_result.scalar_one()
    p2.prices = {str(opt1_id): 300, str(opt2_id): 150}

    # Booking package
    pkg_id = uuid.uuid4()
    db_session.add(BookingPackage(id=pkg_id, tenant_id=tid, conference_id=cid, name="Bundle Pack", sort_order=0))
    await db_session.flush()
    db_session.add(
        BookingPackageOption(id=uuid.uuid4(), tenant_id=tid, booking_package_id=pkg_id, booking_option_id=opt1_id)
    )
    db_session.add(
        BookingPackageOption(id=uuid.uuid4(), tenant_id=tid, booking_package_id=pkg_id, booking_option_id=opt2_id)
    )

    # Discount code with period/option associations
    dc_id = uuid.uuid4()
    db_session.add(
        DiscountCode(
            id=dc_id,
            tenant_id=tid,
            conference_id=cid,
            description="Speaker discount",
            code="SPEAKER20",
            discount_type="percentage",
            discount_value=Decimal("20.00"),
            max_uses=50,
            usage_count=10,
        )
    )
    await db_session.flush()
    db_session.add(
        DiscountCodePeriod(id=uuid.uuid4(), tenant_id=tid, discount_code_id=dc_id, booking_period_id=period1_id)
    )
    db_session.add(
        DiscountCodeOption(id=uuid.uuid4(), tenant_id=tid, discount_code_id=dc_id, booking_option_id=opt1_id)
    )

    # Screen overlay
    overlay_id = uuid.uuid4()
    db_session.add(
        ScreenOverlay(
            id=overlay_id,
            tenant_id=tid,
            conference_id=cid,
            trigger_type="login",
            title="Welcome!",
            body_text="Welcome to the conference",
            schedule_date=date(2025, 9, 15),
        )
    )
    await db_session.flush()

    # Alumni
    db_session.add(
        Alumni(
            id=uuid.uuid4(),
            tenant_id=tid,
            conference_id=cid,
            email="alice@example.com",
            first_name="Alice",
            last_name="Smith",
        )
    )

    # Session type
    db_session.add(
        SessionType(
            id=uuid.uuid4(),
            tenant_id=tid,
            conference_id=cid,
            name="Workshop",
            slug="workshop",
            duration_minutes=120,
            cfp_eligible=True,
        )
    )

    # Review form settings
    db_session.add(
        ReviewFormSettings(
            id=uuid.uuid4(),
            tenant_id=tid,
            conference_id=cid,
            enable_speaker_feedback=True,
            enable_internal_comment=False,
            enable_must_have=True,
        )
    )

    await db_session.commit()
    return source_conference


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestDuplicateBasic:
    async def test_new_conference_created(self, db_session: AsyncSession, source_conference: Conference) -> None:
        req = DuplicateConferenceRequest(name="SourceConf 2026 (Copy)", abbreviation="SC26")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert new_conf.name == "SourceConf 2026 (Copy)"
        assert new_conf.abbreviation == "SC26"
        assert new_conf.is_active is False
        assert new_conf.is_published is False
        assert new_conf.id != source_conference.id

    async def test_config_fields_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert new_conf.currency == "EUR"
        assert new_conf.timezone == "Europe/Berlin"
        assert new_conf.city == "Berlin"
        assert new_conf.venue_name == "Berlin Congress Center"
        assert new_conf.social_links == {"linkedin": "https://linkedin.com/test"}
        assert len(new_conf.team_members) == 1

    async def test_settings_deep_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert new_conf.settings.get("custom_key") == "custom_value"
        # Verify deep copy (mutation of source doesn't affect new)
        assert new_conf.settings is not source_conference.settings

    async def test_source_unchanged(self, db_session: AsyncSession, source_conference: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        await db_session.refresh(source_conference)
        assert source_conference.name == "SourceConf 2025"
        assert source_conference.is_active is True

    async def test_dates_not_carried_over(self, db_session: AsyncSession, source_conference: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert new_conf.start_date is None
        assert new_conf.end_date is None

    async def test_start_date_passed_through(self, db_session: AsyncSession, source_conference: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP", start_date=date(2026, 10, 1))
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert new_conf.start_date == date(2026, 10, 1)


class TestDuplicateSimpleModels:
    async def test_volunteer_roles_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        source_count = await _count(db_session, VolunteerRole, source_conference.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, VolunteerRole, new_conf.id) == source_count

    async def test_committee_roles_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        source_count = await _count(db_session, CFPCommitteeRole, source_conference.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, CFPCommitteeRole, new_conf.id) == source_count

    async def test_location_types_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        source_count = await _count(db_session, TenantLocationType, source_conference.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, TenantLocationType, new_conf.id) == source_count

    async def test_budget_categories_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        source_count = await _count(db_session, BudgetCategory, source_conference.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, BudgetCategory, new_conf.id) == source_count

    async def test_currencies_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        source_count = await _count(db_session, ConferenceCurrency, source_conference.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, ConferenceCurrency, new_conf.id) == source_count


class TestDuplicateBookingMatrix:
    async def test_booking_periods_copied(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        # Source has seed periods + 2 manual periods
        source_count = await _count(db_session, BookingPeriod, source_with_extras.id)
        new_count = await _count(db_session, BookingPeriod, new_conf.id)
        assert new_count == source_count

    async def test_booking_options_copied(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        source_count = await _count(db_session, BookingOption, source_with_extras.id)
        new_count = await _count(db_session, BookingOption, new_conf.id)
        assert new_count == source_count

    async def test_prices_remapped(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        # Get new periods and options
        periods_result = await db_session.execute(
            select(BookingPeriod).where(
                BookingPeriod.conference_id == new_conf.id, BookingPeriod.name == "Custom Early"
            )
        )
        new_period = periods_result.scalar_one()

        options_result = await db_session.execute(
            select(BookingOption).where(BookingOption.conference_id == new_conf.id, BookingOption.name == "Full Pass")
        )
        new_option = options_result.scalar_one()

        # Prices should reference new option UUIDs
        assert new_period.prices is not None
        assert str(new_option.id) in new_period.prices
        assert new_period.prices[str(new_option.id)] == 200

    async def test_packages_and_junctions_copied(
        self, db_session: AsyncSession, source_with_extras: Conference
    ) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        source_pkgs = await _count(db_session, BookingPackage, source_with_extras.id)
        new_pkgs = await _count(db_session, BookingPackage, new_conf.id)
        assert new_pkgs == source_pkgs

        # Check package-option junctions
        new_pkg_result = await db_session.execute(
            select(BookingPackage).where(
                BookingPackage.conference_id == new_conf.id, BookingPackage.name == "Bundle Pack"
            )
        )
        new_pkg = new_pkg_result.scalar_one()
        po_result = await db_session.execute(
            select(BookingPackageOption).where(BookingPackageOption.booking_package_id == new_pkg.id)
        )
        junctions = po_result.scalars().all()
        assert len(junctions) == 2

    async def test_period_dates_recalculated(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        """When new start_date is provided, period dates should shift proportionally."""
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP", start_date=date(2026, 9, 15))
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        # Source "Early Bird" was 2025-03-01 to 2025-06-30
        # Source start_date was 2025-09-15
        # Offset: start = -198 days, end = -77 days
        # New: 2026-09-15 + offset
        result = await db_session.execute(
            select(BookingPeriod).where(
                BookingPeriod.conference_id == new_conf.id, BookingPeriod.name == "Custom Early"
            )
        )
        new_period = result.scalar_one()
        expected_start = date(2026, 9, 15) + (date(2025, 3, 1) - date(2025, 9, 15))
        expected_end = date(2026, 9, 15) + (date(2025, 6, 30) - date(2025, 9, 15))
        assert new_period.start_date == expected_start
        assert new_period.end_date == expected_end


class TestDuplicateDiscountCodes:
    async def test_discount_codes_copied(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        source_count = await _count(db_session, DiscountCode, source_with_extras.id)
        new_count = await _count(db_session, DiscountCode, new_conf.id)
        assert new_count == source_count

    async def test_discount_code_usage_reset(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        result = await db_session.execute(
            select(DiscountCode).where(DiscountCode.conference_id == new_conf.id, DiscountCode.code == "SPEAKER20")
        )
        dc = result.scalar_one()
        assert dc.usage_count == 0
        assert dc.max_uses == 50
        assert dc.start_date is None  # Dates cleared

    async def test_discount_period_associations_remapped(
        self, db_session: AsyncSession, source_with_extras: Conference
    ) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        # Get new discount code
        dc_result = await db_session.execute(
            select(DiscountCode).where(DiscountCode.conference_id == new_conf.id, DiscountCode.code == "SPEAKER20")
        )
        new_dc = dc_result.scalar_one()

        # Should have 1 period association
        dp_result = await db_session.execute(
            select(DiscountCodePeriod).where(DiscountCodePeriod.discount_code_id == new_dc.id)
        )
        dps = dp_result.scalars().all()
        assert len(dps) == 1

        # The period ID should be in the new conference
        period_result = await db_session.execute(
            select(BookingPeriod).where(BookingPeriod.id == dps[0].booking_period_id)
        )
        period = period_result.scalar_one()
        assert period.conference_id == new_conf.id


class TestDuplicateReviewSystem:
    async def test_review_scales_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        source_count = await _count(db_session, ReviewScoreScale, source_conference.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, ReviewScoreScale, new_conf.id) == source_count

    async def test_review_criteria_and_questions_copied(
        self, db_session: AsyncSession, source_conference: Conference
    ) -> None:
        source_criteria = await _count(db_session, ReviewCriterion, source_conference.id)
        source_questions = await _count(db_session, ReviewQuestion, source_conference.id)

        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, ReviewCriterion, new_conf.id) == source_criteria
        assert await _count(db_session, ReviewQuestion, new_conf.id) == source_questions

    async def test_review_form_settings_copied(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        result = await db_session.execute(
            select(ReviewFormSettings).where(ReviewFormSettings.conference_id == new_conf.id)
        )
        settings = result.scalar_one()
        assert settings.enable_speaker_feedback is True
        assert settings.enable_internal_comment is False
        assert settings.enable_must_have is True


class TestDuplicateEmailTemplates:
    async def test_email_templates_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        source_count = await _count(db_session, EmailTemplate, source_conference.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, EmailTemplate, new_conf.id) == source_count


class TestDuplicateScreenOverlays:
    async def test_screen_overlays_copied(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        result = await db_session.execute(select(ScreenOverlay).where(ScreenOverlay.conference_id == new_conf.id))
        overlays = result.scalars().all()
        assert len(overlays) >= 1
        # schedule_date should be cleared
        for ov in overlays:
            assert ov.schedule_date is None


class TestDuplicatePaperForm:
    async def test_paper_form_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        result = await db_session.execute(
            select(ConferencePaperFormSchema).where(ConferencePaperFormSchema.conference_id == new_conf.id)
        )
        schema = result.scalar_one()
        assert schema.version == 1
        assert schema.builtin_fields_config is not None


class TestDuplicateSessionTypes:
    async def test_session_types_copied(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        source_count = await _count(db_session, SessionType, source_with_extras.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, SessionType, new_conf.id) == source_count


class TestDuplicateAlumni:
    async def test_alumni_copied(self, db_session: AsyncSession, source_with_extras: Conference) -> None:
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_with_extras.id, source_with_extras.tenant_id, req)
        await db_session.commit()

        result = await db_session.execute(select(Alumni).where(Alumni.conference_id == new_conf.id))
        alumni = result.scalars().all()
        assert len(alumni) == 1
        assert alumni[0].email == "alice@example.com"


class TestDuplicateSponsorPackages:
    async def test_sponsor_packages_copied(self, db_session: AsyncSession, source_conference: Conference) -> None:
        source_count = await _count(db_session, SponsorPackage, source_conference.id)
        req = DuplicateConferenceRequest(name="Copy", abbreviation="CP")
        new_conf = await duplicate_conference(db_session, source_conference.id, source_conference.tenant_id, req)
        await db_session.commit()

        assert await _count(db_session, SponsorPackage, new_conf.id) == source_count
