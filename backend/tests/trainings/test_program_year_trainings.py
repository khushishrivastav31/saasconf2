"""Tests for program year training placements (GET/POST/DELETE)."""

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

from app.core.security import create_access_token, hash_password
from app.models.location import Location
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
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


def _base_url(year_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/trainings"


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_a(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Tenant A Placements", slug="tenant-a-place")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_a(db_session: AsyncSession, tenant_a: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        email="admin-a-place@test.com",
        first_name="Admin",
        last_name="A",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def program_year_a(db_session: AsyncSession, tenant_a: Tenant) -> TrainingProgramYear:
    py = TrainingProgramYear(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        year=2026,
    )
    db_session.add(py)
    await db_session.commit()
    return py


@pytest_asyncio.fixture
async def training_a(db_session: AsyncSession, tenant_a: Tenant) -> Training:
    t = Training(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        name="AWS Cloud Practitioner",
        slug="aws-cp",
        abbreviation="AWS-CP",
        duration=3,
        color="#4F46E5",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def training_b(db_session: AsyncSession, tenant_a: Tenant) -> Training:
    t = Training(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        name="Kubernetes Fundamentals",
        slug="k8s-fund",
        duration=5,
        color="#059669",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def location_a(db_session: AsyncSession, tenant_a: Tenant) -> Location:
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        name="Main Conference Center",
        code="MCC",
        location_type="venue",
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture
async def tenant_b(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Tenant B Placements", slug="tenant-b-place")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_b(db_session: AsyncSession, tenant_b: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_b.id,
        email="admin-b-place@test.com",
        first_name="Admin",
        last_name="B",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


# ── Tests ──────────────────────────────────────────────────────────────


class TestProgramYearTrainings:
    """Tests for the placement CRUD endpoints."""

    @pytest.mark.asyncio
    async def test_create_placement(
        self, client: AsyncClient, admin_a: User, program_year_a: TrainingProgramYear, training_a: Training
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.post(
            _base_url(program_year_a.id),
            json={"training_id": str(training_a.id), "start_date": "2026-03-02"},
            headers=auth_headers(token),
        )
        assert res.status_code == 201
        data = res.json()
        assert data["training_id"] == str(training_a.id)
        assert data["start_date"] == "2026-03-02"
        assert data["training_name"] == "AWS Cloud Practitioner"
        assert data["training_slug"] == "aws-cp"
        assert data["training_abbreviation"] == "AWS-CP"
        assert data["training_duration"] == 3
        assert data["training_color"] == "#4F46E5"

    @pytest.mark.asyncio
    async def test_list_placements(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        training_a: Training,
        training_b: Training,
    ):
        # Create two placements
        for t, d in [(training_a, date(2026, 3, 2)), (training_b, date(2026, 4, 6))]:
            db_session.add(
                ProgramYearTraining(
                    tenant_id=admin_a.tenant_id,
                    program_year_id=program_year_a.id,
                    training_id=t.id,
                    start_date=d,
                )
            )
        await db_session.commit()

        token = _make_token(admin_a, modules=["trainings"])
        res = await client.get(_base_url(program_year_a.id), headers=auth_headers(token))
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2
        # Should be ordered by start_date
        assert data[0]["start_date"] == "2026-03-02"
        assert data[1]["start_date"] == "2026-04-06"

    @pytest.mark.asyncio
    async def test_parallel_placement_allowed(
        self, client: AsyncClient, admin_a: User, program_year_a: TrainingProgramYear, training_a: Training
    ):
        """Same training on same date is allowed (parallel sessions with different trainers)."""
        token = _make_token(admin_a, modules=["trainings"])
        payload = {"training_id": str(training_a.id), "start_date": "2026-03-02"}
        # First placement
        res1 = await client.post(_base_url(program_year_a.id), json=payload, headers=auth_headers(token))
        assert res1.status_code == 201
        # Second placement on same date — should also succeed
        res2 = await client.post(_base_url(program_year_a.id), json=payload, headers=auth_headers(token))
        assert res2.status_code == 201
        # Both should appear in list
        res3 = await client.get(_base_url(program_year_a.id), headers=auth_headers(token))
        assert len(res3.json()) == 2

    @pytest.mark.asyncio
    async def test_delete_placement(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        training_a: Training,
    ):
        p = ProgramYearTraining(
            tenant_id=admin_a.tenant_id,
            program_year_id=program_year_a.id,
            training_id=training_a.id,
            start_date=date(2026, 5, 11),
        )
        db_session.add(p)
        await db_session.commit()

        token = _make_token(admin_a, modules=["trainings"])
        res = await client.delete(f"{_base_url(program_year_a.id)}/{p.id}", headers=auth_headers(token))
        assert res.status_code == 200

        # Verify it's gone
        res2 = await client.get(_base_url(program_year_a.id), headers=auth_headers(token))
        assert len(res2.json()) == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_returns_404(
        self, client: AsyncClient, admin_a: User, program_year_a: TrainingProgramYear
    ):
        token = _make_token(admin_a, modules=["trainings"])
        fake_id = uuid.uuid4()
        res = await client.delete(f"{_base_url(program_year_a.id)}/{fake_id}", headers=auth_headers(token))
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_create_for_nonexistent_program_year_returns_404(
        self, client: AsyncClient, admin_a: User, training_a: Training
    ):
        token = _make_token(admin_a, modules=["trainings"])
        fake_id = uuid.uuid4()
        res = await client.post(
            _base_url(fake_id),
            json={"training_id": str(training_a.id), "start_date": "2026-03-02"},
            headers=auth_headers(token),
        )
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_training_without_duration_can_be_placed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        tenant_a: Tenant,
    ):
        # Training with no duration
        t = Training(id=uuid.uuid4(), tenant_id=tenant_a.id, name="No Duration Training")
        db_session.add(t)
        await db_session.commit()

        token = _make_token(admin_a, modules=["trainings"])
        res = await client.post(
            _base_url(program_year_a.id),
            json={"training_id": str(t.id), "start_date": "2026-06-15"},
            headers=auth_headers(token),
        )
        assert res.status_code == 201
        data = res.json()
        assert data["training_duration"] is None


class TestPlacementLocations:
    """Tests for location assignment on placements."""

    @pytest.mark.asyncio
    async def test_create_placement_with_location(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        training_a: Training,
        location_a: Location,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.post(
            _base_url(program_year_a.id),
            json={
                "training_id": str(training_a.id),
                "start_date": "2026-03-02",
                "location_id": str(location_a.id),
            },
            headers=auth_headers(token),
        )
        assert res.status_code == 201
        data = res.json()
        assert data["location_id"] == str(location_a.id)
        assert data["location_name"] == "Main Conference Center"
        assert data["location_code"] == "MCC"

    @pytest.mark.asyncio
    async def test_create_placement_without_location(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        training_a: Training,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.post(
            _base_url(program_year_a.id),
            json={"training_id": str(training_a.id), "start_date": "2026-03-02"},
            headers=auth_headers(token),
        )
        assert res.status_code == 201
        data = res.json()
        assert data["location_id"] is None
        assert data["location_name"] is None
        assert data["location_code"] is None

    @pytest.mark.asyncio
    async def test_update_placement_location(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        training_a: Training,
        location_a: Location,
    ):
        p = ProgramYearTraining(
            tenant_id=admin_a.tenant_id,
            program_year_id=program_year_a.id,
            training_id=training_a.id,
            start_date=date(2026, 5, 4),
        )
        db_session.add(p)
        await db_session.commit()

        token = _make_token(admin_a, modules=["trainings"])
        # Assign location
        res = await client.put(
            f"{_base_url(program_year_a.id)}/{p.id}",
            json={"location_id": str(location_a.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["location_id"] == str(location_a.id)
        assert data["location_name"] == "Main Conference Center"

        # Clear location
        res2 = await client.put(
            f"{_base_url(program_year_a.id)}/{p.id}",
            json={"location_id": None},
            headers=auth_headers(token),
        )
        assert res2.status_code == 200
        assert res2.json()["location_id"] is None

    @pytest.mark.asyncio
    async def test_update_nonexistent_placement_returns_404(
        self, client: AsyncClient, admin_a: User, program_year_a: TrainingProgramYear
    ):
        token = _make_token(admin_a, modules=["trainings"])
        fake_id = uuid.uuid4()
        res = await client.put(
            f"{_base_url(program_year_a.id)}/{fake_id}",
            json={"location_id": None},
            headers=auth_headers(token),
        )
        assert res.status_code == 404


class TestTenantIsolation:
    """Ensure tenants cannot see each other's placements."""

    @pytest.mark.asyncio
    async def test_tenant_b_cannot_see_tenant_a_placements(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        admin_b: User,
        program_year_a: TrainingProgramYear,
        training_a: Training,
    ):
        # Create a placement for tenant A
        db_session.add(
            ProgramYearTraining(
                tenant_id=admin_a.tenant_id,
                program_year_id=program_year_a.id,
                training_id=training_a.id,
                start_date=date(2026, 7, 1),
            )
        )
        await db_session.commit()

        # Tenant B tries to list tenant A's program year placements
        token_b = _make_token(admin_b, modules=["trainings"])
        res = await client.get(_base_url(program_year_a.id), headers=auth_headers(token_b))
        assert res.status_code == 200
        assert len(res.json()) == 0  # Should see nothing
