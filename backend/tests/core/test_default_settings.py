"""Tests for conference seed data (default_settings.py).

Calls seed_default_settings() directly against the test DB
and asserts that all expected rows and settings are created.
"""

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.default_settings import (
    DEFAULT_BUDGET_CATEGORIES,
    DEFAULT_COMMITTEE_ROLES,
    DEFAULT_LOCATION_TYPES,
    DEFAULT_PAPER_FORM_BUILTIN_FIELDS,
    DEFAULT_PRONOUNS,
    DEFAULT_REGISTRATION_QUESTIONS,
    DEFAULT_REVIEW_CRITERIA,
    DEFAULT_SCORE_SCALES,
    DEFAULT_SPONSOR_PACKAGES,
    DEFAULT_VOLUNTEER_ROLES,
    seed_default_settings,
)
from app.models.booking import BookingPeriod
from app.models.budget import Budget, BudgetCategory
from app.models.conference import Conference
from app.models.form_schema import ConferencePaperFormSchema
from app.models.platform_currency import PlatformCurrency
from app.models.review import ReviewCriterion, ReviewQuestion, ReviewScoreScale
from app.models.settings import (
    CFPCommitteeRole,
    ConferenceCurrency,
    EmailTemplate,
    PronounOption,
    SponsorPackage,
    TenantLocationType,
    VolunteerRole,
)
from app.models.tenant import Tenant
from app.schemas.email_template import EmailTemplateType

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _count(db: AsyncSession, model: type) -> int:
    result = await db.execute(select(func.count()).select_from(model))
    return result.scalar_one()


@pytest_asyncio.fixture()
async def conference_with_dates(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Conference with start_date and currency set."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Dated Conf 2026",
        abbreviation="DC26",
        is_active=True,
        start_date=date(2026, 9, 15),
        currency="EUR",
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def platform_eur(db_session: AsyncSession) -> PlatformCurrency:
    """Seed EUR in platform_currencies so the seed function can look it up."""
    pc = PlatformCurrency(
        id=uuid.uuid4(),
        code="EUR",
        name="Euro",
        symbol="€",
    )
    db_session.add(pc)
    await db_session.commit()
    return pc


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSeedPronounsAndRoles:
    async def test_pronouns_seeded(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, PronounOption) == len(DEFAULT_PRONOUNS)

    async def test_volunteer_roles_seeded(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, VolunteerRole) == len(DEFAULT_VOLUNTEER_ROLES)

    async def test_committee_roles_seeded(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, CFPCommitteeRole) == len(DEFAULT_COMMITTEE_ROLES)


class TestSeedReviewSystem:
    async def test_score_scales_seeded(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, ReviewScoreScale) == len(DEFAULT_SCORE_SCALES)

    async def test_review_criteria_seeded(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, ReviewCriterion) == len(DEFAULT_REVIEW_CRITERIA)

    async def test_review_questions_seeded(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        total_questions = sum(len(c["questions"]) for c in DEFAULT_REVIEW_CRITERIA)  # type: ignore[arg-type]
        assert await _count(db_session, ReviewQuestion) == total_questions


class TestSeedBudget:
    async def test_budget_categories_count(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, BudgetCategory) == len(DEFAULT_BUDGET_CATEGORIES)

    async def test_budget_category_names(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        result = await db_session.execute(select(BudgetCategory.name))
        names = {r[0] for r in result.all()}
        expected = {c["name"] for c in DEFAULT_BUDGET_CATEGORIES}
        assert names == expected

    async def test_draft_budget_created(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        result = await db_session.execute(select(Budget))
        budget = result.scalar_one()
        assert budget.name == "Main Budget"
        assert budget.status == "draft"

    async def test_draft_budget_uses_conference_currency(
        self, db_session: AsyncSession, conference_with_dates: Conference
    ) -> None:
        await seed_default_settings(db_session, conference_with_dates.tenant_id, conference_with_dates.id)
        await db_session.flush()
        result = await db_session.execute(select(Budget))
        budget = result.scalar_one()
        assert budget.currency == "EUR"


class TestSeedLocationTypes:
    async def test_location_types_count(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, TenantLocationType) == len(DEFAULT_LOCATION_TYPES)

    async def test_location_type_slugs(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        result = await db_session.execute(select(TenantLocationType.slug))
        slugs = {r[0] for r in result.all()}
        expected = {lt["slug"] for lt in DEFAULT_LOCATION_TYPES}
        assert slugs == expected


class TestSeedSponsorPackages:
    async def test_sponsor_packages_count(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, SponsorPackage) == len(DEFAULT_SPONSOR_PACKAGES)

    async def test_sponsor_package_prices(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        result = await db_session.execute(select(SponsorPackage.name, SponsorPackage.price))
        prices = {r[0]: r[1] for r in result.all()}
        assert prices["Platinum"] == 10000
        assert prices["Community Partner"] == 0


class TestSeedBookingPeriods:
    async def test_booking_periods_created_with_start_date(
        self, db_session: AsyncSession, conference_with_dates: Conference
    ) -> None:
        await seed_default_settings(db_session, conference_with_dates.tenant_id, conference_with_dates.id)
        await db_session.flush()
        assert await _count(db_session, BookingPeriod) == 3

    async def test_booking_periods_skipped_without_start_date(
        self, db_session: AsyncSession, conference: Conference
    ) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, BookingPeriod) == 0

    async def test_booking_period_dates_relative(
        self, db_session: AsyncSession, conference_with_dates: Conference
    ) -> None:
        await seed_default_settings(db_session, conference_with_dates.tenant_id, conference_with_dates.id)
        await db_session.flush()
        result = await db_session.execute(select(BookingPeriod).where(BookingPeriod.name == "Super Early Bird"))
        period = result.scalar_one()
        assert period.start_date == date(2026, 9, 15) + timedelta(days=-180)
        assert period.end_date == date(2026, 9, 15) + timedelta(days=-91)


class TestSeedEmailTemplates:
    async def test_email_templates_count(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, EmailTemplate) == len(EmailTemplateType.CONFERENCE_TYPES)

    async def test_email_template_types(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        result = await db_session.execute(select(EmailTemplate.template_type))
        types = {r[0] for r in result.all()}
        assert types == set(EmailTemplateType.CONFERENCE_TYPES)


class TestSeedSettings:
    async def test_registration_questions_in_settings(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        await db_session.refresh(conference)
        questions = conference.settings.get("registration_questions", [])
        assert len(questions) == len(DEFAULT_REGISTRATION_QUESTIONS)
        assert questions[0]["id"] == "dietary_requirements"

    async def test_vat_rules_in_settings(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        await db_session.refresh(conference)
        assert "vat_rules" in conference.settings
        assert len(conference.settings["vat_rules"]) == 24

    async def test_invoice_settings_in_settings(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        await db_session.refresh(conference)
        assert "invoice_number_template" in conference.settings
        assert "invoice_template_html" in conference.settings

    async def test_eu_countries_in_settings(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        await db_session.refresh(conference)
        assert "eu_countries" in conference.settings
        assert "bank_transfer_countries" in conference.settings

    async def test_speaker_expenses_in_settings(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        await db_session.refresh(conference)
        assert "speaker_expenses" in conference.settings
        assert "payment_reminders" in conference.settings

    async def test_pre_existing_settings_not_overwritten(
        self, db_session: AsyncSession, conference: Conference
    ) -> None:
        """Settings that already exist should not be replaced."""
        conference.settings = {"vat_rules": [{"custom": True}], "registration_questions": []}
        db_session.add(conference)
        await db_session.flush()

        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        await db_session.refresh(conference)

        # Custom vat_rules should be preserved
        assert conference.settings["vat_rules"] == [{"custom": True}]
        # Empty registration_questions should be preserved (it exists, even if empty)
        assert conference.settings["registration_questions"] == []


class TestSeedPaperForm:
    async def test_paper_form_schema_created(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        result = await db_session.execute(select(ConferencePaperFormSchema))
        schema = result.scalar_one()
        assert schema.version == 1
        assert schema.builtin_fields_config == DEFAULT_PAPER_FORM_BUILTIN_FIELDS


class TestSeedConferenceCurrency:
    async def test_conference_currency_from_platform(
        self,
        db_session: AsyncSession,
        conference_with_dates: Conference,
        platform_eur: PlatformCurrency,
    ) -> None:
        await seed_default_settings(db_session, conference_with_dates.tenant_id, conference_with_dates.id)
        await db_session.flush()
        result = await db_session.execute(select(ConferenceCurrency))
        cur = result.scalar_one()
        assert cur.code == "EUR"
        assert cur.name == "Euro"
        assert cur.symbol == "€"

    async def test_conference_currency_fallback(self, db_session: AsyncSession, conference: Conference) -> None:
        """When no PlatformCurrency exists, uses fallback dict."""
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        result = await db_session.execute(select(ConferenceCurrency))
        cur = result.scalar_one()
        # Conference has no currency set, defaults to EUR
        assert cur.code == "EUR"


class TestSeedLocale:
    async def test_locale_settings_merged(self, db_session: AsyncSession, conference: Conference) -> None:
        await seed_default_settings(db_session, conference.tenant_id, conference.id, locale="de-DE")
        await db_session.flush()
        await db_session.refresh(conference)
        assert conference.settings["date_format"] == "DD.MM.YYYY"
        assert conference.settings["time_format"] == "24h"

    async def test_no_locale_still_seeds_everything(self, db_session: AsyncSession, conference: Conference) -> None:
        """Even without locale, all other seed data should be created."""
        await seed_default_settings(db_session, conference.tenant_id, conference.id)
        await db_session.flush()
        assert await _count(db_session, PronounOption) == len(DEFAULT_PRONOUNS)
        assert await _count(db_session, BudgetCategory) == len(DEFAULT_BUDGET_CATEGORIES)
        assert await _count(db_session, EmailTemplate) == len(EmailTemplateType.CONFERENCE_TYPES)
