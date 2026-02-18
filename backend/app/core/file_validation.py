"""File upload validation utilities — magic-byte MIME verification, filename sanitization, and metadata stripping."""

import io

import filetype
from PIL import Image

from app.core.exceptions import ValidationError

# Allowed MIME types per entity type
ALLOWED_MIME_TYPES: dict[str, set[str]] = {
    "applicant_picture": {"image/jpeg", "image/png", "image/webp"},
    "applicant_video": {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"},
    "paper_video": {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"},
    "conference_logo": {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "tenant_logo": {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "sponsor_logo": {"image/jpeg", "image/png", "image/webp", "image/gif"},
}

# Default allowed types for general attachments
DEFAULT_ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
    "video/mp4",
    "video/quicktime",
    "video/webm",
}

# MIME types that filetype library cannot detect from magic bytes
# These require falling back to the claimed Content-Type
_FALLBACK_MIME_TYPES = {
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

# Extensions commonly associated with executable/script types — stripped from filenames
_DANGEROUS_EXTENSIONS = {
    ".php",
    ".phtml",
    ".php3",
    ".php4",
    ".php5",
    ".exe",
    ".bat",
    ".cmd",
    ".com",
    ".msi",
    ".sh",
    ".bash",
    ".csh",
    ".py",
    ".rb",
    ".pl",
    ".cgi",
    ".jsp",
    ".asp",
    ".aspx",
    ".js",
    ".vbs",
    ".ps1",
    ".svg",
    ".html",
    ".htm",
    ".xhtml",
}


def sanitize_filename(name: str) -> str:
    """Strip path traversal characters, dangerous sequences, and double extensions."""
    # Remove null bytes
    name = name.replace("\x00", "")
    # Remove path separators and traversal
    name = name.replace("/", "").replace("\\", "").replace("..", "")
    # Strip leading/trailing whitespace and dots
    name = name.strip().strip(".")
    if not name:
        return "unnamed"
    # Strip dangerous extensions from double-extension attacks
    # e.g. "file.php.jpg" → "file.jpg"
    parts = name.split(".")
    if len(parts) > 2:
        safe_parts = [parts[0]]
        for part in parts[1:]:
            if f".{part.lower()}" not in _DANGEROUS_EXTENSIONS:
                safe_parts.append(part)
        name = ".".join(safe_parts) if len(safe_parts) > 1 else safe_parts[0]
    return name or "unnamed"


def safe_content_disposition(filename: str, disposition: str = "attachment") -> str:
    """Build a safe Content-Disposition header value.

    Escapes quotes and backslashes in filenames to prevent header injection.
    Uses ASCII-safe fallback with RFC 5987 filename* for non-ASCII names.
    """
    from urllib.parse import quote

    # Escape backslashes and quotes for the ASCII fallback
    safe = filename.replace("\\", "\\\\").replace('"', '\\"')

    # Check if filename contains non-ASCII characters
    try:
        filename.encode("ascii")
        # Pure ASCII — simple header is fine
        return f'{disposition}; filename="{safe}"'
    except UnicodeEncodeError:
        # Non-ASCII — use RFC 5987 filename* with UTF-8 encoding,
        # plus an ASCII-safe fallback for older clients
        ascii_fallback = filename.encode("ascii", errors="replace").decode("ascii")
        ascii_fallback = ascii_fallback.replace("\\", "\\\\").replace('"', '\\"')
        utf8_encoded = quote(filename, safe="")
        return f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{utf8_encoded}"


def strip_image_metadata(file_data: bytes, content_type: str) -> bytes:
    """Re-encode an image to strip EXIF and other metadata.

    Returns the original bytes unchanged for non-image or unsupported formats.
    """
    _STRIPPABLE = {"image/jpeg", "image/png", "image/webp"}
    if content_type not in _STRIPPABLE:
        return file_data
    try:
        img = Image.open(io.BytesIO(file_data))
        # Create a clean image without metadata
        clean = Image.new(img.mode, img.size)
        clean.putdata(list(img.getdata()))
        buf = io.BytesIO()
        fmt = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}[content_type]
        save_kwargs = {"quality": 95} if fmt == "JPEG" else {}
        clean.save(buf, format=fmt, **save_kwargs)
        return buf.getvalue()
    except Exception:
        # If re-encoding fails, return original (validation already verified it)
        return file_data


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
