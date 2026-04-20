"""Tests for trainer unavailability CRUD endpoints."""

import os
import uuid
from datetime import date

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.tenant import Tenant
from app.models.trainer import Trainer, TrainerUnavailability
from app.models.user import User, UserRole
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _url(trainer_id: uuid.UUID, entry_id: uuid.UUID | None = None) -> str:
    base = f"/api/v1/trainings/trainers/{trainer_id}/unavailability"
    if entry_id:
        return f"{base}/{entry_id}"
    return base


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["trainings"])


@pytest_asyncio.fixture()
async def trainer(db_session: AsyncSession, tenant: Tenant) -> Trainer:
    t = Trainer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Doe",
        is_active=True,
        is_internal=True,
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)
    return t


@pytest_asyncio.fixture()
async def sample_entry(db_session: AsyncSession, tenant: Tenant, trainer: Trainer) -> TrainerUnavailability:
    entry = TrainerUnavailability(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        trainer_id=trainer.id,
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 15),
        description="Summer vacation",
    )
    db_session.add(entry)
    await db_session.commit()
    await db_session.refresh(entry)
    return entry


@pytest_asyncio.fixture()
async def other_tenant_setup(db_session: AsyncSession) -> tuple[Tenant, Trainer, str]:
    """Create a second tenant with its own trainer and admin token."""
    tenant2 = Tenant(
        id=uuid.uuid4(),
        name="Other Corp",
        slug=f"other-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(tenant2)
    await db_session.flush()

    admin2 = User(
        id=uuid.uuid4(),
        tenant_id=tenant2.id,
        email=f"admin2-{uuid.uuid4().hex[:8]}@test.com",
        password_hash="hashed",
        first_name="Other",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(admin2)
    await db_session.flush()

    trainer2 = Trainer(
        id=uuid.uuid4(),
        tenant_id=tenant2.id,
        first_name="Other",
        last_name="Trainer",
        is_active=True,
        is_internal=True,
    )
    db_session.add(trainer2)
    await db_session.commit()

    token2 = _make_token(admin2, modules=["trainings"])
    return tenant2, trainer2, token2


# ═══════════════════════════════════════════════════════════════════════
# 1. LIST UNAVAILABILITY
# ═══════════════════════════════════════════════════════════════════════


class TestListUnavailability:
    """GET /trainers/{trainer_id}/unavailability"""

    async def test_list_empty(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
    ) -> None:
        response = await client.get(_url(trainer.id), headers=auth_headers(admin_token))
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_with_entries(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
    ) -> None:
        response = await client.get(_url(trainer.id), headers=auth_headers(admin_token))
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(sample_entry.id)
        assert data[0]["start_date"] == "2026-06-01"
        assert data[0]["end_date"] == "2026-06-15"
        assert data[0]["description"] == "Summer vacation"

    async def test_list_sorted_by_start_date(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
    ) -> None:
        # Create entries out of order
        for start_day in [15, 1, 10]:
            entry = TrainerUnavailability(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                trainer_id=trainer.id,
                start_date=date(2026, 7, start_day),
                end_date=date(2026, 7, start_day + 2),
            )
            db_session.add(entry)
        await db_session.commit()

        response = await client.get(_url(trainer.id), headers=auth_headers(admin_token))
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        dates = [d["start_date"] for d in data]
        assert dates == sorted(dates)

    async def test_list_trainer_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        response = await client.get(_url(uuid.uuid4()), headers=auth_headers(admin_token))
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 2. CREATE UNAVAILABILITY
# ═══════════════════════════════════════════════════════════════════════


class TestCreateUnavailability:
    """POST /trainers/{trainer_id}/unavailability"""

    async def test_create_success(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
    ) -> None:
        payload = {
            "start_date": "2026-08-01",
            "end_date": "2026-08-10",
            "description": "Conference trip",
        }
        response = await client.post(_url(trainer.id), json=payload, headers=auth_headers(admin_token))
        assert response.status_code == 201
        data = response.json()
        assert data["start_date"] == "2026-08-01"
        assert data["end_date"] == "2026-08-10"
        assert data["description"] == "Conference trip"
        assert data["trainer_id"] == str(trainer.id)
        assert "id" in data

    async def test_create_same_day_range(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
    ) -> None:
        payload = {"start_date": "2026-09-15", "end_date": "2026-09-15"}
        response = await client.post(_url(trainer.id), json=payload, headers=auth_headers(admin_token))
        assert response.status_code == 201
        data = response.json()
        assert data["start_date"] == data["end_date"] == "2026-09-15"
        assert data["description"] is None

    async def test_create_end_before_start_422(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
    ) -> None:
        payload = {"start_date": "2026-08-10", "end_date": "2026-08-01"}
        response = await client.post(_url(trainer.id), json=payload, headers=auth_headers(admin_token))
        assert response.status_code == 422

    async def test_create_trainer_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        payload = {"start_date": "2026-08-01", "end_date": "2026-08-10"}
        response = await client.post(_url(uuid.uuid4()), json=payload, headers=auth_headers(admin_token))
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 3. UPDATE UNAVAILABILITY
# ═══════════════════════════════════════════════════════════════════════


class TestUpdateUnavailability:
    """PUT /trainers/{trainer_id}/unavailability/{entry_id}"""

    async def test_update_description(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
    ) -> None:
        payload = {"description": "Sick leave"}
        response = await client.put(
            _url(trainer.id, sample_entry.id),
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == "Sick leave"
        # Dates unchanged
        assert data["start_date"] == "2026-06-01"
        assert data["end_date"] == "2026-06-15"

    async def test_update_dates(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
    ) -> None:
        payload = {"start_date": "2026-06-05", "end_date": "2026-06-20"}
        response = await client.put(
            _url(trainer.id, sample_entry.id),
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["start_date"] == "2026-06-05"
        assert data["end_date"] == "2026-06-20"

    async def test_update_invalid_date_range(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
    ) -> None:
        """Moving end_date before existing start_date should fail."""
        payload = {"end_date": "2026-05-01"}
        response = await client.put(
            _url(trainer.id, sample_entry.id),
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400

    async def test_update_entry_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
    ) -> None:
        payload = {"description": "test"}
        response = await client.put(
            _url(trainer.id, uuid.uuid4()),
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 4. DELETE UNAVAILABILITY
# ═══════════════════════════════════════════════════════════════════════


class TestDeleteUnavailability:
    """DELETE /trainers/{trainer_id}/unavailability/{entry_id}"""

    async def test_delete_success(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
    ) -> None:
        response = await client.delete(_url(trainer.id, sample_entry.id), headers=auth_headers(admin_token))
        assert response.status_code == 200

        # Verify gone
        response = await client.get(_url(trainer.id), headers=auth_headers(admin_token))
        assert response.json() == []

    async def test_delete_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
    ) -> None:
        response = await client.delete(_url(trainer.id, uuid.uuid4()), headers=auth_headers(admin_token))
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 5. INCLUDED IN TRAINER RESPONSE
# ═══════════════════════════════════════════════════════════════════════


class TestTrainerResponseIncludesUnavailability:
    """GET /trainers/{trainer_id} should include unavailability entries."""

    async def test_trainer_detail_includes_unavailability(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
    ) -> None:
        response = await client.get(
            f"/api/v1/trainings/trainers/{trainer.id}",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["unavailability"]) == 1
        assert data["unavailability"][0]["id"] == str(sample_entry.id)

    async def test_trainer_list_includes_unavailability(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
    ) -> None:
        response = await client.get(
            "/api/v1/trainings/trainers",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        items = response.json()["items"]
        assert len(items) == 1
        assert len(items[0]["unavailability"]) == 1


# ═══════════════════════════════════════════════════════════════════════
# 6. CASCADE DELETE
# ═══════════════════════════════════════════════════════════════════════


class TestCascadeDelete:
    """Deleting a trainer should cascade delete unavailability entries."""

    async def test_cascade_on_trainer_delete(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        admin_token: str,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
    ) -> None:
        # Delete requires super user — must include tenant_roles with super_user level
        super_token = create_access_token(
            user_id=tenant_admin_user.id,
            tenant_id=tenant_admin_user.tenant_id,
            role=tenant_admin_user.role,
            modules=["trainings"],
            tenant_roles=[{"scope": "all", "level": "super_user"}],
        )
        response = await client.delete(
            f"/api/v1/trainings/trainers/{trainer.id}",
            headers=auth_headers(super_token),
        )
        assert response.status_code == 200

        # Verify unavailability entry is gone
        from sqlalchemy import select

        result = await db_session.execute(
            select(TrainerUnavailability).where(TrainerUnavailability.id == sample_entry.id)
        )
        assert result.scalar_one_or_none() is None


# ═══════════════════════════════════════════════════════════════════════
# 7. TENANT ISOLATION
# ═══════════════════════════════════════════════════════════════════════


class TestTenantIsolation:
    """Cross-tenant access should be blocked."""

    async def test_cannot_list_other_tenant_trainer_unavailability(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
        other_tenant_setup: tuple[Tenant, Trainer, str],
    ) -> None:
        _, _, token2 = other_tenant_setup
        response = await client.get(_url(trainer.id), headers=auth_headers(token2))
        assert response.status_code == 404

    async def test_cannot_create_on_other_tenant_trainer(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        trainer: Trainer,
        other_tenant_setup: tuple[Tenant, Trainer, str],
    ) -> None:
        _, _, token2 = other_tenant_setup
        payload = {"start_date": "2026-08-01", "end_date": "2026-08-10"}
        response = await client.post(_url(trainer.id), json=payload, headers=auth_headers(token2))
        assert response.status_code == 404

    async def test_cannot_delete_other_tenant_entry(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        trainer: Trainer,
        sample_entry: TrainerUnavailability,
        other_tenant_setup: tuple[Tenant, Trainer, str],
    ) -> None:
        _, _, token2 = other_tenant_setup
        response = await client.delete(_url(trainer.id, sample_entry.id), headers=auth_headers(token2))
        assert response.status_code == 404
