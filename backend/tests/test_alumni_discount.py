"""Tests for alumni discount validation logic."""

from datetime import date, timedelta

import pytest

from app.core.alumni_discount import check_alumni_only, validate_alumni_discount
from app.models.alumni import Alumni
from app.models.booking import DiscountCode
from app.models.conference import Conference


@pytest.mark.asyncio
async def test_validate_alumni_discount_not_alumni(db_session, tenant, conference):
    """Test user who is not alumni."""
    is_alumni, discount, conferences = await validate_alumni_discount(
        db=db_session,
        tenant_id=tenant.id,
        conference_id=conference.id,
        user_email="new.user@example.com",
    )

    assert is_alumni is False
    assert discount is None
    assert conferences == []


@pytest.mark.asyncio
async def test_validate_alumni_discount_is_alumni_no_discount(db_session, tenant, conference):
    """Test alumni user but no ALUMNI discount code exists."""
    # Create past conference
    past_conference = Conference(
        tenant_id=tenant.id,
        name="Past Conference 2024",
        abbreviation="PAST24",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 1, 3),
        is_active=True,
    )
    db_session.add(past_conference)
    await db_session.flush()

    # Add user to alumni table
    alumni = Alumni(
        tenant_id=tenant.id,
        conference_id=past_conference.id,
        email="alumni@example.com",
        first_name="John",
        last_name="Doe",
    )
    db_session.add(alumni)
    await db_session.commit()

    is_alumni, discount, conferences = await validate_alumni_discount(
        db=db_session,
        tenant_id=tenant.id,
        conference_id=conference.id,
        user_email="alumni@example.com",
    )

    assert is_alumni is True
    assert discount is None
    assert len(conferences) == 1
    assert conferences[0]["conference_name"] == "Past Conference 2024"


@pytest.mark.asyncio
async def test_validate_alumni_discount_with_valid_discount(db_session, tenant, conference):
    """Test alumni user with valid ALUMNI discount code."""
    # Create past conference
    past_conference = Conference(
        tenant_id=tenant.id,
        name="Past Conference 2024",
        abbreviation="PAST24",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 1, 3),
        is_active=True,
    )
    db_session.add(past_conference)
    await db_session.flush()

    # Add user to alumni
    alumni = Alumni(
        tenant_id=tenant.id,
        conference_id=past_conference.id,
        email="alumni@example.com",
        first_name="John",
        last_name="Doe",
    )
    db_session.add(alumni)
    await db_session.flush()

    # Create ALUMNI discount code
    discount_code = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="ALUMNI",
        description="Alumni discount for past attendees",
        discount_type="percentage",
        discount_value=20.0,
        max_uses=0,  # Unlimited
        usage_count=0,
        is_active=True,
        start_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=30),
    )
    db_session.add(discount_code)
    await db_session.commit()

    is_alumni, discount, conferences = await validate_alumni_discount(
        db=db_session,
        tenant_id=tenant.id,
        conference_id=conference.id,
        user_email="alumni@example.com",
    )

    assert is_alumni is True
    assert discount is not None
    assert discount.code == "ALUMNI"
    assert len(conferences) == 1


@pytest.mark.asyncio
async def test_validate_alumni_discount_expired(db_session, tenant, conference):
    """Test alumni discount that has expired."""
    # Create past conference
    past_conference = Conference(
        tenant_id=tenant.id,
        name="Past Conference 2024",
        abbreviation="PAST24",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 1, 3),
        is_active=True,
    )
    db_session.add(past_conference)
    await db_session.flush()

    # Add user to alumni
    alumni = Alumni(
        tenant_id=tenant.id,
        conference_id=past_conference.id,
        email="alumni@example.com",
        first_name="John",
        last_name="Doe",
    )
    db_session.add(alumni)
    await db_session.flush()

    # Create expired ALUMNI discount code
    discount_code = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="ALUMNI",
        description="Alumni discount for past attendees",
        discount_type="percentage",
        discount_value=20.0,
        max_uses=0,
        usage_count=0,
        is_active=True,
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() - timedelta(days=1),  # Expired yesterday
    )
    db_session.add(discount_code)
    await db_session.commit()

    is_alumni, discount, conferences = await validate_alumni_discount(
        db=db_session,
        tenant_id=tenant.id,
        conference_id=conference.id,
        user_email="alumni@example.com",
    )

    assert is_alumni is True
    assert discount is None  # Expired
    assert len(conferences) == 1


@pytest.mark.asyncio
async def test_validate_alumni_discount_max_uses_reached(db_session, tenant, conference):
    """Test alumni discount with max uses reached."""
    # Create past conference
    past_conference = Conference(
        tenant_id=tenant.id,
        name="Past Conference 2024",
        abbreviation="PAST24",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 1, 3),
        is_active=True,
    )
    db_session.add(past_conference)
    await db_session.flush()

    # Add user to alumni
    alumni = Alumni(
        tenant_id=tenant.id,
        conference_id=past_conference.id,
        email="alumni@example.com",
        first_name="John",
        last_name="Doe",
    )
    db_session.add(alumni)
    await db_session.flush()

    # Create ALUMNI discount code with max uses reached
    discount_code = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="ALUMNI",
        description="Alumni discount for past attendees",
        discount_type="percentage",
        discount_value=20.0,
        max_uses=10,
        usage_count=10,  # Max reached
        is_active=True,
        start_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=30),
    )
    db_session.add(discount_code)
    await db_session.commit()

    is_alumni, discount, conferences = await validate_alumni_discount(
        db=db_session,
        tenant_id=tenant.id,
        conference_id=conference.id,
        user_email="alumni@example.com",
    )

    assert is_alumni is True
    assert discount is None  # Max uses reached
    assert len(conferences) == 1


@pytest.mark.asyncio
async def test_validate_alumni_discount_case_insensitive_email(db_session, tenant, conference):
    """Test alumni check with case-insensitive email matching."""
    # Create past conference
    past_conference = Conference(
        tenant_id=tenant.id,
        name="Past Conference 2024",
        abbreviation="PAST24",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 1, 3),
        is_active=True,
    )
    db_session.add(past_conference)
    await db_session.flush()

    # Add user with lowercase email
    alumni = Alumni(
        tenant_id=tenant.id,
        conference_id=past_conference.id,
        email="alumni@example.com",
        first_name="John",
        last_name="Doe",
    )
    db_session.add(alumni)
    await db_session.commit()

    # Check with uppercase email
    is_alumni, _discount, conferences = await validate_alumni_discount(
        db=db_session,
        tenant_id=tenant.id,
        conference_id=conference.id,
        user_email="ALUMNI@EXAMPLE.COM",
    )

    assert is_alumni is True
    assert len(conferences) == 1


@pytest.mark.asyncio
async def test_validate_alumni_discount_multiple_conferences(db_session, tenant, conference):
    """Test alumni who attended multiple conferences."""
    # Create multiple past conferences
    conf1 = Conference(
        tenant_id=tenant.id,
        name="Conference 2023",
        abbreviation="CONF23",
        start_date=date(2023, 1, 1),
        end_date=date(2023, 1, 3),
        is_active=True,
    )
    conf2 = Conference(
        tenant_id=tenant.id,
        name="Conference 2024",
        abbreviation="CONF24",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 1, 3),
        is_active=True,
    )
    db_session.add_all([conf1, conf2])
    await db_session.flush()

    # Add user to alumni for both conferences
    alumni1 = Alumni(
        tenant_id=tenant.id,
        conference_id=conf1.id,
        email="alumni@example.com",
        first_name="John",
        last_name="Doe",
    )
    alumni2 = Alumni(
        tenant_id=tenant.id,
        conference_id=conf2.id,
        email="alumni@example.com",
        first_name="John",
        last_name="Doe",
    )
    db_session.add_all([alumni1, alumni2])
    await db_session.commit()

    is_alumni, _discount, conferences = await validate_alumni_discount(
        db=db_session,
        tenant_id=tenant.id,
        conference_id=conference.id,
        user_email="alumni@example.com",
    )

    assert is_alumni is True
    assert len(conferences) == 2
    # Should be ordered by most recent first
    assert conferences[0]["conference_name"] == "Conference 2024"
    assert conferences[1]["conference_name"] == "Conference 2023"


@pytest.mark.asyncio
async def test_check_alumni_only_true(db_session, tenant, conference):
    """Test simple alumni check returns True."""
    # Create past conference
    past_conference = Conference(
        tenant_id=tenant.id,
        name="Past Conference 2024",
        abbreviation="PAST24",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 1, 3),
        is_active=True,
    )
    db_session.add(past_conference)
    await db_session.flush()

    # Add user to alumni
    alumni = Alumni(
        tenant_id=tenant.id,
        conference_id=past_conference.id,
        email="alumni@example.com",
        first_name="John",
        last_name="Doe",
    )
    db_session.add(alumni)
    await db_session.commit()

    is_alumni = await check_alumni_only(
        db=db_session,
        tenant_id=tenant.id,
        user_email="alumni@example.com",
    )

    assert is_alumni is True


@pytest.mark.asyncio
async def test_check_alumni_only_false(db_session, tenant):
    """Test simple alumni check returns False."""
    is_alumni = await check_alumni_only(
        db=db_session,
        tenant_id=tenant.id,
        user_email="new.user@example.com",
    )

    assert is_alumni is False
