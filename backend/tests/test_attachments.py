"""Tests for attachment download MIME normalization (MAIN-13346)."""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.attachment import Attachment
from app.models.cfp import CFPApplicant
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# Minimal ftyp box: major-brand "qt  " — exactly what macOS/iOS produces
_QT_MP4_BYTES = (
    b"\x00\x00\x00\x14"  # box size = 20
    b"ftyp"              # box type
    b"qt  "              # major brand
    b"\x00\x00\x02\x00"  # minor version
    b"qt  "              # compatible brand
    + b"\x00" * 100
)


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Test",
        last_name="Speaker",
        email=f"speaker-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def quicktime_attachment(db_session: AsyncSession, tenant: Tenant) -> Attachment:
    att = Attachment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        entity_type="applicant_video",
        entity_id=uuid.uuid4(),
        filename="video-2.MP4",
        content_type="video/quicktime",
        file_size=len(_QT_MP4_BYTES),
        file_data=_QT_MP4_BYTES,
    )
    db_session.add(att)
    await db_session.commit()
    return att


async def test_admin_download_serves_quicktime_as_mp4(
    client: AsyncClient,
    tenant_admin_user: User,
    tenant_admin_token: str,
    quicktime_attachment: Attachment,
) -> None:
    """Admin download endpoint must remap video/quicktime → video/mp4."""
    response = await client.get(
        f"/api/v1/attachments/{quicktime_attachment.id}/download",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("video/mp4")


async def test_admin_download_preserves_mp4_content_type(
    client: AsyncClient,
    tenant_admin_user: User,
    tenant_admin_token: str,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """A video/mp4 attachment must still be served as video/mp4 (no regression)."""
    att = Attachment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        entity_type="applicant_video",
        entity_id=uuid.uuid4(),
        filename="video.mp4",
        content_type="video/mp4",
        file_size=len(_QT_MP4_BYTES),
        file_data=_QT_MP4_BYTES,
    )
    db_session.add(att)
    await db_session.commit()

    response = await client.get(
        f"/api/v1/attachments/{att.id}/download",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("video/mp4")


async def test_portal_download_serves_quicktime_as_mp4(
    client: AsyncClient,
    applicant: CFPApplicant,
    tenant: Tenant,
    db_session: AsyncSession,
) -> None:
    """Portal download endpoint must remap video/quicktime → video/mp4."""
    att = Attachment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        entity_type="applicant_video",
        entity_id=applicant.id,
        filename="video-2.MP4",
        content_type="video/quicktime",
        file_size=len(_QT_MP4_BYTES),
        file_data=_QT_MP4_BYTES,
    )
    db_session.add(att)
    await db_session.commit()

    token = create_applicant_access_token(applicant.id, tenant.id)
    response = await client.get(
        f"/api/v1/portal/attachments/{att.id}/download",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("video/mp4")
