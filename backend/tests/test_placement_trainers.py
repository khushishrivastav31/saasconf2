"""Tests for placement trainer assignments (assign, remove, availability check)."""

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
from app.models.tenant import Tenant
from app.models.trainer import Trainer, TrainerUnavailability
from app.models.training import Training
from app.models.training_program import PlacementTrainer, ProgramYearTraining, TrainingProgramYear
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


def _base_url(year_id: uuid.UUID, placement_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/trainings/{placement_id}/trainers"


def _check_url(year_id: uuid.UUID, placement_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/trainings/{placement_id}/check-trainer"


def _trainings_url(year_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/trainings"


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_a(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Tenant A Trainers", slug="tenant-a-trainers")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_a(db_session: AsyncSession, tenant_a: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        email="admin-a-trainers@test.com",
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
        slug="aws-cp-tr",
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
        slug="k8s-fund-tr",
        duration=5,
        color="#059669",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def trainer_1(db_session: AsyncSession, tenant_a: Tenant) -> Trainer:
    t = Trainer(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        first_name="John",
        last_name="Doe",
        email="john.doe@test.com",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def trainer_2(db_session: AsyncSession, tenant_a: Tenant) -> Trainer:
    t = Trainer(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        first_name="Maria",
        last_name="Silva",
        email="maria.silva@test.com",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def placement_a(
    db_session: AsyncSession,
    tenant_a: Tenant,
    program_year_a: TrainingProgramYear,
    training_a: Training,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        program_year_id=program_year_a.id,
        training_id=training_a.id,
        start_date=date(2026, 3, 2),
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def placement_b(
    db_session: AsyncSession,
    tenant_a: Tenant,
    program_year_a: TrainingProgramYear,
    training_b: Training,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        program_year_id=program_year_a.id,
        training_id=training_b.id,
        start_date=date(2026, 3, 2),  # Same start date — overlaps with placement_a
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def tenant_b(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Tenant B Trainers", slug="tenant-b-trainers")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_b(db_session: AsyncSession, tenant_b: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_b.id,
        email="admin-b-trainers@test.com",
        first_name="Admin",
        last_name="B",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


# ── Tests: Assign & Remove ────────────────────────────────────────────


class TestAssignTrainer:
    """Tests for assigning trainers to placements."""

    @pytest.mark.asyncio
    async def test_assign_trainer_success(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        trainer_1: Trainer,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 201
        data = res.json()
        assert data["trainer_id"] == str(trainer_1.id)
        assert data["placement_id"] == str(placement_a.id)
        assert data["trainer_first_name"] == "John"
        assert data["trainer_last_name"] == "Doe"
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_assign_multiple_trainers(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        trainer_1: Trainer,
        trainer_2: Trainer,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res1 = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res1.status_code == 201

        res2 = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(trainer_2.id)},
            headers=auth_headers(token),
        )
        assert res2.status_code == 201
        assert res2.json()["trainer_first_name"] == "Maria"

    @pytest.mark.asyncio
    async def test_assign_same_trainer_twice_returns_409(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        trainer_1: Trainer,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res1 = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res1.status_code == 201

        res2 = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res2.status_code == 409

    @pytest.mark.asyncio
    async def test_assign_nonexistent_trainer_returns_404(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(uuid.uuid4())},
            headers=auth_headers(token),
        )
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_assign_to_nonexistent_placement_returns_404(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        trainer_1: Trainer,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        fake_id = uuid.uuid4()
        res = await client.post(
            _base_url(program_year_a.id, fake_id),
            json={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 404


class TestRemoveTrainer:
    """Tests for removing trainer assignments."""

    @pytest.mark.asyncio
    async def test_remove_assignment(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        trainer_1: Trainer,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        # Assign first
        res = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 201
        assignment_id = res.json()["id"]

        # Remove
        res2 = await client.delete(
            f"{_base_url(program_year_a.id, placement_a.id)}/{assignment_id}",
            headers=auth_headers(token),
        )
        assert res2.status_code == 200

    @pytest.mark.asyncio
    async def test_remove_nonexistent_returns_404(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        fake_id = uuid.uuid4()
        res = await client.delete(
            f"{_base_url(program_year_a.id, placement_a.id)}/{fake_id}",
            headers=auth_headers(token),
        )
        assert res.status_code == 404


# ── Tests: Availability Check ─────────────────────────────────────────


class TestAvailabilityCheck:
    """Tests for trainer availability checking."""

    @pytest.mark.asyncio
    async def test_no_conflicts(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        trainer_1: Trainer,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.get(
            _check_url(program_year_a.id, placement_a.id),
            params={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["available"] is True
        assert data["conflicts"] == []

    @pytest.mark.asyncio
    async def test_unavailability_conflict(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        tenant_a: Tenant,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        trainer_1: Trainer,
    ):
        # Add unavailability overlapping with placement_a (Mar 2-4)
        unavail = TrainerUnavailability(
            id=uuid.uuid4(),
            tenant_id=tenant_a.id,
            trainer_id=trainer_1.id,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 3),
            description="Vacation",
        )
        db_session.add(unavail)
        await db_session.commit()

        token = _make_token(admin_a, modules=["trainings"])
        res = await client.get(
            _check_url(program_year_a.id, placement_a.id),
            params={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["available"] is False
        assert len(data["conflicts"]) == 1
        assert data["conflicts"][0]["type"] == "unavailability"
        assert data["conflicts"][0]["description"] == "Vacation"

    @pytest.mark.asyncio
    async def test_double_booking_conflict(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        tenant_a: Tenant,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        placement_b: ProgramYearTraining,
        trainer_1: Trainer,
    ):
        # Assign trainer_1 to placement_b (which overlaps with placement_a)
        assignment = PlacementTrainer(
            id=uuid.uuid4(),
            tenant_id=tenant_a.id,
            placement_id=placement_b.id,
            trainer_id=trainer_1.id,
        )
        db_session.add(assignment)
        await db_session.commit()

        # Check availability for placement_a — should detect double-booking
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.get(
            _check_url(program_year_a.id, placement_a.id),
            params={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["available"] is False
        assert len(data["conflicts"]) >= 1
        conflict = next(c for c in data["conflicts"] if c["type"] == "double_booking")
        assert "Kubernetes Fundamentals" in conflict["description"]
        assert conflict["other_placement_id"] == str(placement_b.id)

    @pytest.mark.asyncio
    async def test_no_conflict_non_overlapping(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        tenant_a: Tenant,
        program_year_a: TrainingProgramYear,
        training_a: Training,
        training_b: Training,
        trainer_1: Trainer,
    ):
        # placement_c: Mar 2-4 (3 days)
        placement_c = ProgramYearTraining(
            id=uuid.uuid4(),
            tenant_id=tenant_a.id,
            program_year_id=program_year_a.id,
            training_id=training_a.id,
            start_date=date(2026, 3, 2),
        )
        # placement_d: Mar 10-14 (5 days) — no overlap
        placement_d = ProgramYearTraining(
            id=uuid.uuid4(),
            tenant_id=tenant_a.id,
            program_year_id=program_year_a.id,
            training_id=training_b.id,
            start_date=date(2026, 3, 10),
        )
        db_session.add_all([placement_c, placement_d])
        await db_session.commit()

        # Assign trainer to placement_d
        assignment = PlacementTrainer(
            id=uuid.uuid4(),
            tenant_id=tenant_a.id,
            placement_id=placement_d.id,
            trainer_id=trainer_1.id,
        )
        db_session.add(assignment)
        await db_session.commit()

        # Check availability for placement_c — no overlap with placement_d
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.get(
            _check_url(program_year_a.id, placement_c.id),
            params={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["available"] is True
        assert data["conflicts"] == []

    @pytest.mark.asyncio
    async def test_check_nonexistent_trainer_returns_404(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.get(
            _check_url(program_year_a.id, placement_a.id),
            params={"trainer_id": str(uuid.uuid4())},
            headers=auth_headers(token),
        )
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_check_nonexistent_placement_returns_404(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        trainer_1: Trainer,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        fake_id = uuid.uuid4()
        res = await client.get(
            _check_url(program_year_a.id, fake_id),
            params={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 404


# ── Tests: List includes trainer_assignments ──────────────────────────


class TestListIncludesAssignments:
    """Verify that listing placements includes trainer_assignments."""

    @pytest.mark.asyncio
    async def test_list_placements_includes_trainer_assignments(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        tenant_a: Tenant,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        trainer_1: Trainer,
        trainer_2: Trainer,
    ):
        # Assign two trainers
        for trainer in [trainer_1, trainer_2]:
            db_session.add(
                PlacementTrainer(
                    id=uuid.uuid4(),
                    tenant_id=tenant_a.id,
                    placement_id=placement_a.id,
                    trainer_id=trainer.id,
                )
            )
        await db_session.commit()

        token = _make_token(admin_a, modules=["trainings"])
        res = await client.get(
            _trainings_url(program_year_a.id),
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assignments = data[0]["trainer_assignments"]
        assert len(assignments) == 2
        names = {a["trainer_first_name"] for a in assignments}
        assert names == {"John", "Maria"}

    @pytest.mark.asyncio
    async def test_list_placements_empty_assignments(
        self,
        client: AsyncClient,
        admin_a: User,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
    ):
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.get(
            _trainings_url(program_year_a.id),
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["trainer_assignments"] == []


# ── Tests: Cascade delete ─────────────────────────────────────────────


class TestCascadeDelete:
    """Verify cascade behavior when parent entities are deleted."""

    @pytest.mark.asyncio
    async def test_deleting_placement_removes_assignments(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_a: User,
        tenant_a: Tenant,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
        trainer_1: Trainer,
    ):
        # Assign trainer
        token = _make_token(admin_a, modules=["trainings"])
        res = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(trainer_1.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 201

        # Delete the placement
        res2 = await client.delete(
            f"{_trainings_url(program_year_a.id)}/{placement_a.id}",
            headers=auth_headers(token),
        )
        assert res2.status_code == 200

        # Verify placement and its assignments are gone
        res3 = await client.get(
            _trainings_url(program_year_a.id),
            headers=auth_headers(token),
        )
        assert len(res3.json()) == 0


# ── Tests: Tenant isolation ───────────────────────────────────────────


class TestTrainerAssignmentTenantIsolation:
    """Ensure tenant isolation for trainer assignments."""

    @pytest.mark.asyncio
    async def test_tenant_b_cannot_assign_to_tenant_a_placement(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_b: User,
        tenant_b: Tenant,
        program_year_a: TrainingProgramYear,
        placement_a: ProgramYearTraining,
    ):
        # Create a trainer in tenant B
        trainer_b = Trainer(
            id=uuid.uuid4(),
            tenant_id=tenant_b.id,
            first_name="Other",
            last_name="Trainer",
            is_active=True,
        )
        db_session.add(trainer_b)
        await db_session.commit()

        token = _make_token(admin_b, modules=["trainings"])
        res = await client.post(
            _base_url(program_year_a.id, placement_a.id),
            json={"trainer_id": str(trainer_b.id)},
            headers=auth_headers(token),
        )
        assert res.status_code == 404  # Placement not found for tenant B
