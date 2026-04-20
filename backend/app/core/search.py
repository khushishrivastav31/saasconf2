"""Search utilities for accent-insensitive queries."""

from typing import Any

from sqlalchemy import ColumnElement, ColumnExpressionArgument, func


def unaccent_ilike(column: ColumnExpressionArgument[Any], term: str) -> ColumnElement[bool]:
    """Accent-insensitive ILIKE using PostgreSQL unaccent extension.

    Wraps both the column and the search term with unaccent() so that
    'müller' matches 'Muller', 'café' matches 'cafe', etc.

    Args:
        column: SQLAlchemy column or ORM attribute to search in.
        term: Raw search term (without % wildcards).
    """
    return func.unaccent(column).ilike(func.unaccent(f"%{term}%"))
