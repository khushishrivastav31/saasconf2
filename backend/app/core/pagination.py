"""Shared pagination utilities for list endpoints."""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class PaginatedResult:
    """Result of a paginated query."""

    items: list[Any]
    total: int


async def paginate(
    db: AsyncSession,
    query: Select,
    page: int = 1,
    page_size: int = 50,
) -> PaginatedResult:
    """
    Apply pagination to a SQLAlchemy query and return results with total count.

    Args:
        db: Async database session.
        query: Base SQLAlchemy Select query (with filters already applied).
        page: 1-based page number.
        page_size: Number of items per page.

    Returns:
        PaginatedResult with items list and total count.
    """
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination
    paginated = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(paginated)
    items = list(result.scalars().all())

    return PaginatedResult(items=items, total=total)
