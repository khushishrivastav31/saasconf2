"""Server-side HTML sanitization for user-supplied rich text content.

Uses nh3 (Rust-based) to strip dangerous tags/attributes while preserving
safe formatting. This is a defense-in-depth measure — the frontend also
sanitizes with DOMPurify, but server-side sanitization ensures safety
regardless of client.
"""

import nh3

# Tags allowed in rich text content (messaging, CFP fields)
_ALLOWED_TAGS = {
    # Block
    "p",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "pre",
    "code",
    # Lists
    "ul",
    "ol",
    "li",
    # Inline
    "a",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "del",
    "ins",
    "sub",
    "sup",
    "small",
    "mark",
    "span",
    # Tables
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    # Media (images only — no script, no iframe)
    "img",
}

# Attributes allowed per tag
_ALLOWED_ATTRIBUTES: dict[str, set[str]] = {
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "title", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
    "span": {"class"},
    "p": {"class"},
    "pre": {"class"},
    "code": {"class"},
}

# URL schemes allowed in href/src attributes
_ALLOWED_URL_SCHEMES = {"http", "https", "mailto"}


def sanitize_html(html: str) -> str:
    """Sanitize HTML content, stripping dangerous tags and attributes.

    Safe for rich text messaging, CFP fields, and email template bodies.
    """
    if not html:
        return html
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        url_schemes=_ALLOWED_URL_SCHEMES,
        link_rel="noopener noreferrer",
    )
