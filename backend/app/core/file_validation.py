"""File upload validation utilities — magic-byte MIME verification and filename sanitization."""

import re
import filetype

from app.core.exceptions import ValidationError

# Allowed MIME types per entity type
ALLOWED_MIME_TYPES: dict[str, set[str]] = {
    "applicant_picture": {"image/jpeg", "image/png", "image/webp"},
    "applicant_video": {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"},
    "paper_video": {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"},
    "conference_logo": {"image/jpeg", "image/png", "image/webp", "image/gif"},
}

# Default allowed types for general attachments
DEFAULT_ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
    "video/mp4", "video/quicktime", "video/webm",
}

# MIME types that filetype library cannot detect from magic bytes
# These require falling back to the claimed Content-Type
_FALLBACK_MIME_TYPES = {
    "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def sanitize_filename(name: str) -> str:
    """Strip path traversal characters and dangerous sequences from a filename."""
    # Remove null bytes
    name = name.replace("\x00", "")
    # Remove path separators and traversal
    name = name.replace("/", "").replace("\\", "").replace("..", "")
    # Strip leading/trailing whitespace and dots
    name = name.strip().strip(".")
    return name or "unnamed"


def validate_upload(
    file_data: bytes,
    claimed_content_type: str,
    entity_type: str,
) -> str:
    """Validate an uploaded file's MIME type using magic bytes.

    Args:
        file_data: Raw file bytes
        claimed_content_type: The Content-Type header sent by the client
        entity_type: The entity type (e.g. "applicant_picture", "location")

    Returns:
        The verified MIME type string to store

    Raises:
        ValidationError: If the file type is not allowed or doesn't match
    """
    if not file_data:
        raise ValidationError("Empty file upload is not allowed")

    allowed_types = ALLOWED_MIME_TYPES.get(entity_type, DEFAULT_ALLOWED_MIME_TYPES)

    # Try magic byte detection
    kind = filetype.guess(file_data)

    if kind is not None:
        detected_mime = kind.mime
        if detected_mime not in allowed_types:
            raise ValidationError(
                f"File content detected as '{detected_mime}' which is not allowed for {entity_type}. "
                f"Allowed types: {', '.join(sorted(allowed_types))}"
            )
        return detected_mime

    # filetype couldn't detect — fall back to claimed type for text/office formats
    if claimed_content_type in _FALLBACK_MIME_TYPES and claimed_content_type in allowed_types:
        return claimed_content_type

    # Claimed type not in fallback set or not allowed
    if claimed_content_type not in allowed_types:
        raise ValidationError(
            f"File type '{claimed_content_type}' is not allowed for {entity_type}. "
            f"Allowed types: {', '.join(sorted(allowed_types))}"
        )

    # Claimed type is allowed but we couldn't verify it — reject for safety
    raise ValidationError(
        f"Could not verify file content matches claimed type '{claimed_content_type}'. "
        "Please ensure the file is not corrupted."
    )
