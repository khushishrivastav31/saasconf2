"""CSV export utilities.

Provides helpers for streaming and non-streaming CSV exports with
consistent formatting (UTF-8 BOM for Excel compatibility).
"""

import csv
import io
from collections.abc import Callable, Sequence
from typing import Any

from fastapi.responses import StreamingResponse
from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.file_validation import safe_content_disposition


def csv_response(
    headers: list[str],
    rows: Sequence[Any],
    row_mapper: Callable[[Any], list[str]],
    filename: str,
) -> StreamingResponse:
    """Build a CSV StreamingResponse from an in-memory list of rows.

    Use for small-to-medium exports (already fetched from DB).
    Adds UTF-8 BOM for Excel compatibility.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row_mapper(row))
    output.seek(0)
    csv_bytes = b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")

    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )


async def stream_csv_export(
    db: AsyncSession,
    query: Select,
    headers: list[str],
    row_mapper: Callable[[Any], list[str]],
    filename: str,
    batch_size: int = 1000,
) -> StreamingResponse:
    """Stream a CSV export in batches for large datasets.

    Fetches rows from the database in batches to avoid loading
    everything into memory. Adds UTF-8 BOM for Excel compatibility.
    """

    async def _generate():
        # BOM + header row
        header_buf = io.StringIO()
        writer = csv.writer(header_buf)
        writer.writerow(headers)
        yield b"\xef\xbb\xbf" + header_buf.getvalue().encode("utf-8")

        # Stream data in batches
        offset = 0
        while True:
            batch_query = query.offset(offset).limit(batch_size)
            result = await db.execute(batch_query)
            rows = result.scalars().all()
            if not rows:
                break

            chunk = io.StringIO()
            w = csv.writer(chunk)
            for row in rows:
                w.writerow(row_mapper(row))
            yield chunk.getvalue().encode("utf-8")

            if len(rows) < batch_size:
                break
            offset += batch_size

    return StreamingResponse(
        _generate(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )
