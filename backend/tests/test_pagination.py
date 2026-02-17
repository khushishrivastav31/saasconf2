"""Unit tests for the pagination module."""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault(
    "JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars"
)
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PaginatedResult, calculate_pages, paginate
from app.models.tenant import Tenant


# ---------------------------------------------------------------------------
# PaginatedResult dataclass tests
# ---------------------------------------------------------------------------


class TestPaginatedResult:
    """Tests for the PaginatedResult dataclass."""

    def test_paginated_result_creation(self):
        """Can create a PaginatedResult with items and total."""
        result = PaginatedResult(items=["a", "b", "c"], total=10)
        assert result.items == ["a", "b", "c"]
        assert result.total == 10

    def test_paginated_result_empty(self):
        """Can create a PaginatedResult with empty items."""
        result = PaginatedResult(items=[], total=0)
        assert result.items == []
        assert result.total == 0

    def test_paginated_result_with_objects(self):
        """Can store complex objects in items list."""
        obj1 = {"id": 1, "name": "Item 1"}
        obj2 = {"id": 2, "name": "Item 2"}
        result = PaginatedResult(items=[obj1, obj2], total=100)
        assert len(result.items) == 2
        assert result.items[0]["name"] == "Item 1"


# ---------------------------------------------------------------------------
# calculate_pages helper tests
# ---------------------------------------------------------------------------


class TestCalculatePages:
    """Tests for the calculate_pages helper function."""

    def test_exact_division(self):
        """Pages divide evenly."""
        assert calculate_pages(10, 5) == 2

    def test_remainder(self):
        """Extra items get an additional page."""
        assert calculate_pages(11, 5) == 3

    def test_single_item(self):
        """Single item needs one page."""
        assert calculate_pages(1, 10) == 1

    def test_zero_total(self):
        """Zero items means zero pages."""
        assert calculate_pages(0, 10) == 0

    def test_page_size_one(self):
        """Page size of 1 means total equals pages."""
        assert calculate_pages(7, 1) == 7

    def test_page_size_zero(self):
        """Page size of 0 returns 0 (guarded)."""
        assert calculate_pages(10, 0) == 0

    def test_negative_page_size(self):
        """Negative page size returns 0 (guarded)."""
        assert calculate_pages(10, -1) == 0

    def test_large_numbers(self):
        """Works with large totals."""
        assert calculate_pages(1_000_000, 50) == 20_000

    def test_total_equals_page_size(self):
        """Total equal to page size gives one page."""
        assert calculate_pages(50, 50) == 1

    def test_total_less_than_page_size(self):
        """Total less than page size gives one page."""
        assert calculate_pages(3, 50) == 1


# ---------------------------------------------------------------------------
# paginate function integration tests
# ---------------------------------------------------------------------------


class TestPaginate:
    """Integration tests for the paginate function."""

    @pytest.mark.asyncio
    async def test_paginate_returns_correct_total(self, db_session: AsyncSession):
        """Returns correct total count."""
        # Create 5 test tenants
        for i in range(5):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Tenant {i}",
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant)
        result = await paginate(db_session, query, page=1, page_size=10)

        assert result.total == 5
        assert len(result.items) == 5

    @pytest.mark.asyncio
    async def test_paginate_first_page(self, db_session: AsyncSession):
        """Returns first page of results."""
        # Create 10 test tenants
        for i in range(10):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Tenant {i:02d}",
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant).order_by(Tenant.name)
        result = await paginate(db_session, query, page=1, page_size=3)

        assert result.total == 10
        assert len(result.items) == 3

    @pytest.mark.asyncio
    async def test_paginate_second_page(self, db_session: AsyncSession):
        """Returns second page of results."""
        # Create 10 test tenants
        for i in range(10):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Tenant {i:02d}",
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant).order_by(Tenant.name)
        result = await paginate(db_session, query, page=2, page_size=3)

        assert result.total == 10
        assert len(result.items) == 3
        # Second page should have items 3, 4, 5
        names = [t.name for t in result.items]
        assert "Tenant 03" in names
        assert "Tenant 04" in names
        assert "Tenant 05" in names

    @pytest.mark.asyncio
    async def test_paginate_last_page_partial(self, db_session: AsyncSession):
        """Returns partial last page when items don't divide evenly."""
        # Create 7 test tenants
        for i in range(7):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Tenant {i}",
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant)
        result = await paginate(db_session, query, page=3, page_size=3)

        assert result.total == 7
        assert len(result.items) == 1  # Only 1 item on last page (7 - 6 = 1)

    @pytest.mark.asyncio
    async def test_paginate_empty_result(self, db_session: AsyncSession):
        """Returns empty results when no items match."""
        # No tenants created
        query = select(Tenant).where(Tenant.name == "nonexistent")
        result = await paginate(db_session, query, page=1, page_size=10)

        assert result.total == 0
        assert result.items == []

    @pytest.mark.asyncio
    async def test_paginate_page_beyond_results(self, db_session: AsyncSession):
        """Returns empty items when page is beyond available results."""
        # Create 3 test tenants
        for i in range(3):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Tenant {i}",
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant)
        result = await paginate(db_session, query, page=10, page_size=10)

        assert result.total == 3
        assert result.items == []

    @pytest.mark.asyncio
    async def test_paginate_default_values(self, db_session: AsyncSession):
        """Uses default page=1 and page_size=50."""
        # Create 5 test tenants
        for i in range(5):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Tenant {i}",
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant)
        # Call without page and page_size to use defaults
        result = await paginate(db_session, query)

        assert result.total == 5
        assert len(result.items) == 5  # All fit on first page with default size 50

    @pytest.mark.asyncio
    async def test_paginate_with_filter(self, db_session: AsyncSession):
        """Works correctly with filtered queries."""
        # Create tenants with different active states
        for i in range(5):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Active Tenant {i}",
                slug=f"active-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)

        for i in range(3):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Inactive Tenant {i}",
                slug=f"inactive-{uuid.uuid4().hex[:8]}",
                is_active=False,
            )
            db_session.add(tenant)

        await db_session.commit()

        # Query only active tenants
        query = select(Tenant).where(Tenant.is_active == True)
        result = await paginate(db_session, query, page=1, page_size=10)

        assert result.total == 5
        assert len(result.items) == 5
        assert all(t.is_active for t in result.items)

    @pytest.mark.asyncio
    async def test_paginate_with_order_by(self, db_session: AsyncSession):
        """Preserves ordering from the query."""
        # Create tenants with specific names
        names = ["Zebra Corp", "Alpha Inc", "Delta Ltd"]
        for name in names:
            tenant = Tenant(
                id=uuid.uuid4(),
                name=name,
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant).order_by(Tenant.name)
        result = await paginate(db_session, query, page=1, page_size=10)

        assert result.total == 3
        assert result.items[0].name == "Alpha Inc"
        assert result.items[1].name == "Delta Ltd"
        assert result.items[2].name == "Zebra Corp"

    @pytest.mark.asyncio
    async def test_paginate_large_page_size(self, db_session: AsyncSession):
        """Handles large page sizes gracefully."""
        # Create 5 test tenants
        for i in range(5):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Tenant {i}",
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant)
        result = await paginate(db_session, query, page=1, page_size=1000)

        assert result.total == 5
        assert len(result.items) == 5

    @pytest.mark.asyncio
    async def test_paginate_page_size_one(self, db_session: AsyncSession):
        """Handles page_size=1 correctly."""
        # Create 3 test tenants
        for i in range(3):
            tenant = Tenant(
                id=uuid.uuid4(),
                name=f"Tenant {i:02d}",
                slug=f"tenant-{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            db_session.add(tenant)
        await db_session.commit()

        query = select(Tenant).order_by(Tenant.name)
        result = await paginate(db_session, query, page=1, page_size=1)

        assert result.total == 3
        assert len(result.items) == 1
        assert result.items[0].name == "Tenant 00"
