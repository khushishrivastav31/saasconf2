"""Tests for file upload validation utilities."""

import pytest

from app.core.exceptions import ValidationError
from app.core.file_validation import playback_content_type, sanitize_filename, validate_upload

# Minimal valid JPEG (SOI marker + minimal data)
JPEG_MAGIC = b"\xff\xd8\xff\xe0" + b"\x00" * 20

# Minimal valid PNG (PNG signature)
PNG_MAGIC = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20

# Minimal valid PDF
PDF_MAGIC = b"%PDF-1.4" + b"\x00" * 20

# EXE/PE magic bytes
EXE_MAGIC = b"MZ" + b"\x00" * 50


class TestSanitizeFilename:
    def test_normal_filename(self):
        assert sanitize_filename("photo.jpg") == "photo.jpg"

    def test_path_traversal(self):
        assert sanitize_filename("../../etc/passwd") == "etcpasswd"

    def test_backslash_traversal(self):
        assert sanitize_filename("..\\..\\windows\\system32") == "windowssystem32"

    def test_null_bytes(self):
        assert sanitize_filename("file\x00.jpg") == "file.jpg"

    def test_empty_string(self):
        assert sanitize_filename("") == "unnamed"

    def test_only_dots(self):
        assert sanitize_filename("...") == "unnamed"

    def test_leading_trailing_whitespace(self):
        assert sanitize_filename("  photo.jpg  ") == "photo.jpg"

    def test_forward_slashes(self):
        assert sanitize_filename("path/to/file.txt") == "pathtofile.txt"


class TestValidateUpload:
    def test_valid_jpeg_for_picture(self):
        result = validate_upload(JPEG_MAGIC, "image/jpeg", "applicant_picture")
        assert result == "image/jpeg"

    def test_valid_png_for_picture(self):
        result = validate_upload(PNG_MAGIC, "image/png", "applicant_picture")
        assert result == "image/png"

    def test_valid_pdf_for_general(self):
        result = validate_upload(PDF_MAGIC, "application/pdf", "location")
        assert result == "application/pdf"

    def test_exe_rejected_as_image(self):
        with pytest.raises(ValidationError):
            validate_upload(EXE_MAGIC, "image/jpeg", "applicant_picture")

    def test_exe_rejected_for_general(self):
        with pytest.raises(ValidationError):
            validate_upload(EXE_MAGIC, "application/pdf", "location")

    def test_spoofed_content_type(self):
        """EXE bytes with image/jpeg content type should be rejected."""
        with pytest.raises(ValidationError):
            validate_upload(EXE_MAGIC, "image/jpeg", "location")

    def test_empty_file_rejected(self):
        with pytest.raises(ValidationError, match="Empty file"):
            validate_upload(b"", "image/jpeg", "applicant_picture")

    def test_text_plain_fallback(self):
        """Text files don't have reliable magic bytes — use claimed type."""
        text_data = b"Hello, this is a plain text file content."
        result = validate_upload(text_data, "text/plain", "location")
        assert result == "text/plain"

    def test_csv_fallback(self):
        csv_data = b"name,email\nJohn,john@example.com\n"
        result = validate_upload(csv_data, "text/csv", "location")
        assert result == "text/csv"

    def test_text_not_allowed_for_picture(self):
        """Text files should be rejected for picture entity type."""
        text_data = b"Hello, this is plain text."
        with pytest.raises(ValidationError):
            validate_upload(text_data, "text/plain", "applicant_picture")

    def test_disallowed_claimed_type(self):
        """Random bytes with a disallowed claimed type."""
        with pytest.raises(ValidationError):
            validate_upload(b"\x00" * 50, "application/x-executable", "location")

    def test_jpeg_detected_even_with_wrong_claim(self):
        """Magic bytes should override claimed content type."""
        result = validate_upload(JPEG_MAGIC, "image/png", "location")
        assert result == "image/jpeg"


class TestPlaybackContentType:
    def test_quicktime_maps_to_mp4(self):
        assert playback_content_type("video/quicktime") == "video/mp4"

    def test_mp4_passes_through(self):
        assert playback_content_type("video/mp4") == "video/mp4"

    def test_webm_passes_through(self):
        assert playback_content_type("video/webm") == "video/webm"

    def test_image_jpeg_passes_through(self):
        assert playback_content_type("image/jpeg") == "image/jpeg"

    def test_pdf_passes_through(self):
        assert playback_content_type("application/pdf") == "application/pdf"
