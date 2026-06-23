import re


def strip_html(html: str) -> str:
    """Strip HTML tags and return plain text."""
    return re.sub(r"<[^>]+>", "", html or "")
