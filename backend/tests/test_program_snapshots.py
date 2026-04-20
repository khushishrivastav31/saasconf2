"""Tests for program snapshot publishing, diff computation, and update workflow."""

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
os.environ.setdefault("TESTING", "true")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.program_snapshot import compute_diff
from app.core.security import create_access_token, hash_password
from app.models.tenant import Tenant
from app.models.trainer import Trainer
from app.models.training import Training
from app.models.training_program import (
    PlacementTrainer,
    ProgramYearTraining,
    TrainingProgramYear,
)
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


def _years_url() -> str:
    return "/api/v1/trainings/programs/years"


def _publish_url(year_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/publish"


def _preview_url(year_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/preview-changes"


def _confirm_url(year_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/confirm-update"


def _snapshots_url(year_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/snapshots"


def _trainings_url(year_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/programs/years/{year_id}/trainings"


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Snapshot Test Tenant", slug="snapshot-test")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin(db_session: AsyncSession, tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="admin-snapshot@test.com",
        first_name="Admin",
        last_name="Snap",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def program_year(db_session: AsyncSession, tenant: Tenant) -> TrainingProgramYear:
    py = TrainingProgramYear(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        year=2027,
    )
    db_session.add(py)
    await db_session.commit()
    return py


@pytest_asyncio.fixture
async def training_aws(db_session: AsyncSession, tenant: Tenant) -> Training:
    t = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="AWS Cloud Practitioner",
        slug="aws-cp-snap",
        abbreviation="AWS-CP",
        duration=3,
        color="#4F46E5",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def training_k8s(db_session: AsyncSession, tenant: Tenant) -> Training:
    t = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Kubernetes Fundamentals",
        slug="k8s-snap",
        duration=5,
        color="#059669",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def trainer_john(db_session: AsyncSession, tenant: Tenant) -> Trainer:
    t = Trainer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="John",
        last_name="Doe",
        email="john.snap@test.com",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def trainer_maria(db_session: AsyncSession, tenant: Tenant) -> Trainer:
    t = Trainer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Maria",
        last_name="Silva",
        email="maria.snap@test.com",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def placement_aws(
    db_session: AsyncSession,
    tenant: Tenant,
    program_year: TrainingProgramYear,
    training_aws: Training,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=program_year.id,
        training_id=training_aws.id,
        start_date=date(2027, 3, 10),
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def placement_k8s(
    db_session: AsyncSession,
    tenant: Tenant,
    program_year: TrainingProgramYear,
    training_k8s: Training,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=program_year.id,
        training_id=training_k8s.id,
        start_date=date(2027, 6, 2),
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def assign_john_aws(
    db_session: AsyncSession,
    tenant: Tenant,
    placement_aws: ProgramYearTraining,
    trainer_john: Trainer,
) -> PlacementTrainer:
    a = PlacementTrainer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement_aws.id,
        trainer_id=trainer_john.id,
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture
async def assign_maria_k8s(
    db_session: AsyncSession,
    tenant: Tenant,
    placement_k8s: ProgramYearTraining,
    trainer_maria: Trainer,
) -> PlacementTrainer:
    a = PlacementTrainer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement_k8s.id,
        trainer_id=trainer_maria.id,
    )
    db_session.add(a)
    await db_session.commit()
    return a


# ── Unit tests: compute_diff ──────────────────────────────────────────


class TestComputeDiff:
    """Unit tests for the snapshot diff computation."""

    def test_no_changes(self):
        snap = [
            {
                "placement_id": "p1",
                "training_name": "AWS",
                "training_slug": "aws",
                "start_date": "2027-03-10",
                "duration": 3,
                "location_name": "Berlin",
                "location_code": "BER",
                "trainer_ids": ["t1"],
                "trainer_names": ["John Doe"],
            }
        ]
        diff = compute_diff(snap, snap)
        assert not diff.has_changes
        assert len(diff.placement_changes) == 0
        assert len(diff.affected_trainer_ids) == 0

    def test_added_placement(self):
        old: list = []
        new = [
            {
                "placement_id": "p1",
                "training_name": "AWS",
                "training_slug": "aws",
                "start_date": "2027-03-10",
                "duration": 3,
                "location_name": None,
                "location_code": None,
                "trainer_ids": ["t1"],
                "trainer_names": ["John"],
            }
        ]
        diff = compute_diff(old, new)
        assert diff.has_changes
        assert len(diff.placement_changes) == 1
        assert diff.placement_changes[0].change_type == "added"
        assert "t1" in diff.affected_trainer_ids

    def test_removed_placement(self):
        old = [
            {
                "placement_id": "p1",
                "training_name": "AWS",
                "training_slug": "aws",
                "start_date": "2027-03-10",
                "duration": 3,
                "location_name": None,
                "location_code": None,
                "trainer_ids": ["t1"],
                "trainer_names": ["John"],
            }
        ]
        diff = compute_diff(old, [])
        assert diff.has_changes
        assert diff.placement_changes[0].change_type == "removed"
        assert "t1" in diff.affected_trainer_ids
        tc = diff.per_trainer_changes["t1"]
        assert len(tc.removed_trainings) == 1

    def test_modified_location(self):
        old = [
            {
                "placement_id": "p1",
                "training_name": "AWS",
                "training_slug": "aws",
                "start_date": "2027-03-10",
                "duration": 3,
                "location_name": "Berlin",
                "location_code": "BER",
                "trainer_ids": ["t1"],
                "trainer_names": ["John"],
            }
        ]
        new = [
            {
                **old[0],
                "location_name": "Munich",
                "location_code": "MUC",
            }
        ]
        diff = compute_diff(old, new)
        assert diff.has_changes
        assert diff.placement_changes[0].change_type == "modified"
        assert any("Location:" in c for c in diff.placement_changes[0].changes)

    def test_modified_trainers(self):
        old = [
            {
                "placement_id": "p1",
                "training_name": "AWS",
                "training_slug": "aws",
                "start_date": "2027-03-10",
                "duration": 3,
                "location_name": None,
                "location_code": None,
                "trainer_ids": ["t1"],
                "trainer_names": ["John"],
            }
        ]
        new = [
            {
                **old[0],
                "trainer_ids": ["t1", "t2"],
                "trainer_names": ["John", "Maria"],
            }
        ]
        diff = compute_diff(old, new)
        assert diff.has_changes
        assert "t2" in diff.affected_trainer_ids
        tc = diff.per_trainer_changes["t2"]
        assert len(tc.added_trainings) == 1

    def test_modified_date(self):
        old = [
            {
                "placement_id": "p1",
                "training_name": "AWS",
                "training_slug": "aws",
                "start_date": "2027-03-10",
                "duration": 3,
                "location_name": None,
                "location_code": None,
                "trainer_ids": ["t1"],
                "trainer_names": ["John"],
            }
        ]
        new = [{**old[0], "start_date": "2027-04-14"}]
        diff = compute_diff(old, new)
        assert diff.has_changes
        assert any("Date:" in c for c in diff.placement_changes[0].changes)


# ── API Integration Tests ─────────────────────────────────────────────


class TestPublishEndpoint:
    """Tests for the publish endpoint (initial publish)."""

    @pytest.mark.asyncio
    async def test_publish_creates_snapshot(
        self,
        client: AsyncClient,
        admin: User,
        program_year: TrainingProgramYear,
        placement_aws: ProgramYearTraining,
        assign_john_aws: PlacementTrainer,
    ):
        token = _make_token(admin)
        resp = await client.post(
            _publish_url(program_year.id),
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "published"
        assert data["published_version"] == 1

        # Verify snapshot exists
        snap_resp = await client.get(
            _snapshots_url(program_year.id),
            headers=auth_headers(token),
        )
        assert snap_resp.status_code == 200
        snaps = snap_resp.json()
        assert len(snaps) == 1
        assert snaps[0]["version"] == 1

    @pytest.mark.asyncio
    async def test_publish_twice_rejects(
        self,
        client: AsyncClient,
        admin: User,
        program_year: TrainingProgramYear,
        placement_aws: ProgramYearTraining,
        assign_john_aws: PlacementTrainer,
    ):
        token = _make_token(admin)
        # First publish
        resp1 = await client.post(
            _publish_url(program_year.id),
            headers=auth_headers(token),
        )
        assert resp1.status_code == 200

        # Second publish should fail
        resp2 = await client.post(
            _publish_url(program_year.id),
            headers=auth_headers(token),
        )
        assert resp2.status_code == 400  # ValidationError


class TestPreviewChanges:
    """Tests for the preview-changes endpoint."""

    @pytest.mark.asyncio
    async def test_preview_requires_published(
        self,
        client: AsyncClient,
        admin: User,
        program_year: TrainingProgramYear,
        placement_aws: ProgramYearTraining,
    ):
        token = _make_token(admin)
        resp = await client.get(
            _preview_url(program_year.id),
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_preview_no_changes(
        self,
        client: AsyncClient,
        admin: User,
        program_year: TrainingProgramYear,
        placement_aws: ProgramYearTraining,
        assign_john_aws: PlacementTrainer,
    ):
        token = _make_token(admin)
        # Publish first
        await client.post(_publish_url(program_year.id), headers=auth_headers(token))

        # Preview with no changes
        resp = await client.get(
            _preview_url(program_year.id),
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_changes"] is False
        assert len(data["placement_changes"]) == 0

    @pytest.mark.asyncio
    async def test_preview_detects_new_placement(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin: User,
        tenant: Tenant,
        program_year: TrainingProgramYear,
        placement_aws: ProgramYearTraining,
        training_k8s: Training,
        assign_john_aws: PlacementTrainer,
    ):
        token = _make_token(admin)
        # Publish
        await client.post(_publish_url(program_year.id), headers=auth_headers(token))

        # Add new placement via API
        resp = await client.post(
            _trainings_url(program_year.id),
            headers=auth_headers(token),
            json={"training_id": str(training_k8s.id), "start_date": "2027-06-02"},
        )
        assert resp.status_code == 201

        # Preview changes
        resp = await client.get(
            _preview_url(program_year.id),
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_changes"] is True
        added = [c for c in data["placement_changes"] if c["change_type"] == "added"]
        assert len(added) == 1


class TestConfirmUpdate:
    """Tests for the confirm-update endpoint."""

    @pytest.mark.asyncio
    async def test_confirm_update_increments_version(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin: User,
        tenant: Tenant,
        program_year: TrainingProgramYear,
        placement_aws: ProgramYearTraining,
        training_k8s: Training,
        assign_john_aws: PlacementTrainer,
    ):
        token = _make_token(admin)
        # Publish v1
        await client.post(_publish_url(program_year.id), headers=auth_headers(token))

        # Add placement
        await client.post(
            _trainings_url(program_year.id),
            headers=auth_headers(token),
            json={"training_id": str(training_k8s.id), "start_date": "2027-06-02"},
        )

        # Confirm update
        resp = await client.post(
            _confirm_url(program_year.id),
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["published_version"] == 2

        # Verify 2 snapshots
        snap_resp = await client.get(
            _snapshots_url(program_year.id),
            headers=auth_headers(token),
        )
        assert len(snap_resp.json()) == 2


class TestGetSnapshot:
    """Tests for retrieving specific snapshot versions."""

    @pytest.mark.asyncio
    async def test_get_snapshot_by_version(
        self,
        client: AsyncClient,
        admin: User,
        program_year: TrainingProgramYear,
        placement_aws: ProgramYearTraining,
        assign_john_aws: PlacementTrainer,
    ):
        token = _make_token(admin)
        await client.post(_publish_url(program_year.id), headers=auth_headers(token))

        resp = await client.get(
            f"{_snapshots_url(program_year.id)}/1",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 1
        assert len(data["snapshot_data"]) == 1
        assert data["snapshot_data"][0]["training_name"] == "AWS Cloud Practitioner"

    @pytest.mark.asyncio
    async def test_get_nonexistent_version_404(
        self,
        client: AsyncClient,
        admin: User,
        program_year: TrainingProgramYear,
        placement_aws: ProgramYearTraining,
        assign_john_aws: PlacementTrainer,
    ):
        token = _make_token(admin)
        await client.post(_publish_url(program_year.id), headers=auth_headers(token))

        resp = await client.get(
            f"{_snapshots_url(program_year.id)}/99",
            headers=auth_headers(token),
        )
        assert resp.status_code == 404
