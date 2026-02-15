"""Search utilities for accent-insensitive queries."""

from sqlalchemy import ColumnElement, func


def unaccent_ilike(column: ColumnElement, term: str) -> ColumnElement:
    """Accent-insensitive ILIKE using PostgreSQL unaccent extension.

    Wraps both the column and the search term with unaccent() so that
    'müller' matches 'Muller', 'café' matches 'cafe', etc.

    Args:
        column: SQLAlchemy column to search in.
        term: Raw search term (without % wildcards).
    """
    return func.unaccent(column).ilike(func.unaccent(f"%{term}%"))
