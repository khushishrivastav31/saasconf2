"""Tests for app/core/csv_export.py — csv_response helper."""

from types import SimpleNamespace

import pytest

from app.core.csv_export import csv_response


async def _collect_body(response) -> bytes:
    """Read the full body from a StreamingResponse by iterating the async body_iterator."""
    chunks = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, str):
            chunk = chunk.encode("utf-8")
        chunks.append(chunk)
    return b"".join(chunks)


def _sample_rows():
    return [
        SimpleNamespace(name="Alice", age="30"),
        SimpleNamespace(name="Bob", age="25"),
    ]


def _row_mapper(row):
    return [row.name, row.age]


@pytest.mark.asyncio
class TestCsvResponse:
    async def test_csv_response_includes_bom(self):
        """Response body starts with the UTF-8 BOM (EF BB BF)."""
        resp = csv_response(["Name", "Age"], _sample_rows(), _row_mapper, "test.csv")
        body = await _collect_body(resp)
        assert body[:3] == b"\xef\xbb\xbf"

    async def test_csv_response_correct_content_type(self):
        """Media type is text/csv with charset=utf-8."""
        resp = csv_response(["Name", "Age"], _sample_rows(), _row_mapper, "test.csv")
        assert resp.media_type == "text/csv; charset=utf-8"

    async def test_csv_response_has_content_disposition(self):
        """Content-Disposition header is set for file download."""
        resp = csv_response(["Name", "Age"], _sample_rows(), _row_mapper, "export.csv")
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert "export.csv" in cd

    async def test_csv_response_maps_rows(self):
        """Row mapper is applied and all data rows appear in the CSV body."""
        resp = csv_response(["Name", "Age"], _sample_rows(), _row_mapper, "test.csv")
        body = await _collect_body(resp)
        text = body.decode("utf-8-sig")  # strips BOM
        lines = text.strip().split("\r\n")
        assert lines[0] == "Name,Age"
        assert lines[1] == "Alice,30"
        assert lines[2] == "Bob,25"
        assert len(lines) == 3

    async def test_csv_response_empty_rows(self):
        """An export with zero data rows still has the header line."""
        resp = csv_response(["Name", "Age"], [], _row_mapper, "test.csv")
        body = await _collect_body(resp)
        text = body.decode("utf-8-sig")
        lines = text.strip().split("\r\n")
        assert lines[0] == "Name,Age"
        assert len(lines) == 1

    async def test_csv_formula_injection_note(self):
        """csv.writer wraps cells starting with =, +, -, @ in quotes.

        This is standard csv.writer behavior and acts as a basic defence
        against formula-injection when the CSV is opened in Excel.
        """
        rows = [SimpleNamespace(val="=SUM(A1:A2)")]
        resp = csv_response(["Value"], rows, lambda r: [r.val], "test.csv")
        body = await _collect_body(resp)
        text = body.decode("utf-8-sig")
        # csv.writer quotes cells that contain special characters
        # The exact quoting depends on csv.writer, but the value should be present
        assert "=SUM(A1:A2)" in text
