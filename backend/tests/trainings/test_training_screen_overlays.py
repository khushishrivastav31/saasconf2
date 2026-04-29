"""Trainings-side screen-overlay CRUD.

Mirrors the per-conference overlay tests but checks tenant-wide,
training-domain rows (migration 216 + the new
``/trainings/screen-overlays`` router).
"""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.module import Module, TenantModule
from app.models.screen_overlay import OVERLAY_DOMAIN_TRAINING, ScreenOverlay
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers
from tests.trainings.conftest import training_admin_token

URL = "/api/v1/trainings/screen-overlays"


class TestTrainingScreenOverlays:
    @pytest.mark.asyncio
    async def test_list_empty(self, client: AsyncClient, training_tenant: Tenant, training_admin: User) -> None:
        resp = await client.get(URL, headers=auth_headers(training_admin_token(training_admin)))
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_create_persists_with_training_domain(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        resp = await client.post(
            URL,
            headers=auth_headers(training_admin_token(training_admin)),
            json={
                "trigger_type": "always",
                "title": "Welcome to trainings",
                "body_text": "<p>Hi!</p>",
                "animation_style": "confetti",
                "duration_seconds": 5,
                "is_active": True,
                "display_order": 0,
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["title"] == "Welcome to trainings"
        assert body["domain"] == OVERLAY_DOMAIN_TRAINING
        assert body["conference_id"] is None

        # The row exists with domain='training' and conference_id NULL.
        row = (
            await db_session.execute(ScreenOverlay.__table__.select().where(ScreenOverlay.id == uuid.UUID(body["id"])))
        ).first()
        assert row is not None
        assert row.domain == OVERLAY_DOMAIN_TRAINING
        assert row.conference_id is None

    @pytest.mark.asyncio
    async def test_update_round_trip(
        self,
        client: AsyncClient,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        created = await client.post(
            URL,
            headers=auth_headers(training_admin_token(training_admin)),
            json={
                "trigger_type": "always",
                "title": "Initial",
                "animation_style": "confetti",
                "duration_seconds": 5,
            },
        )
        oid = created.json()["id"]
        resp = await client.put(
            f"{URL}/{oid}",
            headers=auth_headers(training_admin_token(training_admin)),
            json={"title": "Updated", "is_active": True},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated"
        assert resp.json()["is_active"] is True

    @pytest.mark.asyncio
    async def test_delete(
        self,
        client: AsyncClient,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        created = await client.post(
            URL,
            headers=auth_headers(training_admin_token(training_admin)),
            json={
                "trigger_type": "always",
                "title": "Doomed",
                "animation_style": "confetti",
                "duration_seconds": 5,
            },
        )
        oid = created.json()["id"]
        resp = await client.delete(f"{URL}/{oid}", headers=auth_headers(training_admin_token(training_admin)))
        assert resp.status_code == 200
        # Subsequent GET 404s.
        get_resp = await client.get(f"{URL}/{oid}", headers=auth_headers(training_admin_token(training_admin)))
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_other_tenant_cannot_see(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        # Create an overlay as the original admin.
        await client.post(
            URL,
            headers=auth_headers(training_admin_token(training_admin)),
            json={
                "trigger_type": "always",
                "title": "Tenant-A overlay",
                "animation_style": "confetti",
                "duration_seconds": 5,
            },
        )
        # Spin up a second tenant + admin.
        other = Tenant(id=uuid.uuid4(), name="Other", slug=f"other-{uuid.uuid4().hex[:6]}")
        db_session.add(other)
        await db_session.flush()
        mod = Module(id=uuid.uuid4(), name="T", code=f"t-{uuid.uuid4().hex[:6]}", description="T", is_active=True)
        db_session.add(mod)
        await db_session.flush()
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=other.id, module_id=mod.id, is_enabled=True))
        other_admin = User(
            id=uuid.uuid4(),
            tenant_id=other.id,
            email=f"other-{uuid.uuid4().hex[:8]}@example.com",
            first_name="Other",
            last_name="Admin",
            role=UserRole.TENANT_ADMIN.value,
            password_hash=hash_password("Password123!"),
            is_active=True,
        )
        db_session.add(other_admin)
        await db_session.commit()

        listing = await client.get(URL, headers=auth_headers(training_admin_token(other_admin)))
        assert listing.status_code == 200
        assert listing.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_image_upload_and_serve(
        self,
        client: AsyncClient,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        # Minimal valid 1x1 white PNG (67 bytes).
        valid_png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
            b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
            b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        created = await client.post(
            URL,
            headers=auth_headers(training_admin_token(training_admin)),
            json={
                "trigger_type": "always",
                "title": "With image",
                "animation_style": "confetti",
                "duration_seconds": 5,
            },
        )
        oid = created.json()["id"]
        upload = await client.post(
            f"{URL}/{oid}/image",
            headers=auth_headers(training_admin_token(training_admin)),
            files={"file": ("logo.png", valid_png, "image/png")},
        )
        assert upload.status_code == 200, upload.text
        assert upload.json()["filename"] == "logo.png"

        # Public download — no auth needed.
        served = await client.get(f"{URL}/{oid}/image")
        assert served.status_code == 200
        assert served.headers["content-type"].startswith("image/")
