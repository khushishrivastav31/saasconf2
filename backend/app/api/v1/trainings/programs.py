"""Training program year endpoints."""

import asyncio
import base64
import datetime
import logging
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import literal, select
from sqlalchemy.orm import joinedload, selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.program_snapshot import ProgramDiff, build_snapshot, compute_diff
from app.models.audit import AuditLog
from app.models.trainer import Trainer, TrainerUnavailability
from app.models.training_program import (
    PlacementTrainer,
    ProgramSnapshot,
    ProgramYearTraining,
    TrainingProgramYear,
)
from app.schemas.training_program import (
    AvailabilityCheckResponse,
    PlacementChangeResponse,
    PlacementTrainerCreate,
    PlacementTrainerResponse,
    ProgramDiffResponse,
    ProgramSnapshotListItem,
    ProgramSnapshotResponse,
    ProgramYearTrainingCreate,
    ProgramYearTrainingResponse,
    ProgramYearTrainingUpdate,
    TrainerChangeResponse,
    TrainerConflict,
    TrainingProgramYearCreate,
    TrainingProgramYearResponse,
    TrainingProgramYearUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/programs/years", tags=["training-programs"])

# Store references to background tasks to prevent GC
_background_tasks: set[asyncio.Task[None]] = set()


def _tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return TrainingProgramYear.tenant_id == current_user.tenant_id


@router.get("", response_model=list[TrainingProgramYearResponse])
async def list_program_years(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[TrainingProgramYearResponse]:
    """List all training program years for the tenant, ordered by year descending."""
    query = select(TrainingProgramYear).where(_tenant_filter(current_user)).order_by(TrainingProgramYear.year.desc())
    result = await db.execute(query)
    years = list(result.scalars().all())
    return [TrainingProgramYearResponse.model_validate(y) for y in years]


@router.post("", response_model=TrainingProgramYearResponse, status_code=201)
async def create_program_year(
    payload: TrainingProgramYearCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Create a new training program year."""
    # Check uniqueness
    existing = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.tenant_id == current_user.tenant_id,
            TrainingProgramYear.year == payload.year,
        )
    )
    if existing.scalar_one_or_none():
        from app.core.exceptions import ConflictError

        raise ConflictError(f"Program year {payload.year} already exists")

    program_year = TrainingProgramYear(
        tenant_id=current_user.tenant_id,
        year=payload.year,
    )
    db.add(program_year)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.create",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={"year": payload.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    return TrainingProgramYearResponse.model_validate(program_year)


@router.put("/{year_id}", response_model=TrainingProgramYearResponse)
async def update_program_year(
    year_id: UUID,
    payload: TrainingProgramYearUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Update a training program year."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    if payload.notes is not None:
        program_year.notes = payload.notes or None

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.update",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={"year": program_year.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    return TrainingProgramYearResponse.model_validate(program_year)


@router.delete("/{year_id}")
async def delete_program_year(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a training program year (only if draft)."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    # Allow deleting past years regardless of status; current/future years must be draft
    from datetime import date

    current_calendar_year = date.today().year
    if program_year.year >= current_calendar_year and program_year.status != "draft":
        from app.core.exceptions import ValidationError

        raise ValidationError(
            "Only draft program years can be deleted. Published current/future years cannot be removed."
        )

    year_value = program_year.year
    await db.delete(program_year)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.delete",
        resource_type="training_program_year",
        resource_id=year_id,
        details={"year": year_value},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Program year deleted"}


async def _load_placements_with_relations(
    db: DbSessionDep, year_id: UUID, tenant_id: UUID
) -> list[ProgramYearTraining]:
    """Load all placements for a program year with training, location, and trainer relations."""
    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            selectinload(ProgramYearTraining.trainer_assignments).joinedload(PlacementTrainer.trainer),
        )
        .where(
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == tenant_id,
        )
        .order_by(ProgramYearTraining.start_date, ProgramYearTraining.created_at)
    )
    return list(result.scalars().unique().all())


def _diff_to_response(diff: ProgramDiff) -> ProgramDiffResponse:
    """Convert internal ProgramDiff to API response schema."""
    return ProgramDiffResponse(
        has_changes=diff.has_changes,
        placement_changes=[
            PlacementChangeResponse(
                change_type=c.change_type,
                placement_id=c.placement_id,
                training_name=c.training_name,
                training_slug=c.training_slug,
                start_date=c.start_date,
                duration=c.duration,
                location_name=c.location_name,
                location_code=c.location_code,
                changes=c.changes,
                old_trainer_names=c.old_trainer_names,
                new_trainer_names=c.new_trainer_names,
            )
            for c in diff.placement_changes
        ],
        affected_trainer_ids=list(diff.affected_trainer_ids),
        per_trainer_changes=[
            TrainerChangeResponse(
                trainer_id=tc.trainer_id,
                trainer_name=tc.trainer_name,
                added_trainings=tc.added_trainings,
                removed_trainings=tc.removed_trainings,
                modified_trainings=tc.modified_trainings,
            )
            for tc in diff.per_trainer_changes.values()
        ],
    )


async def _collect_holiday_date_strings(db: DbSessionDep, year: int, tenant_id: UUID) -> set[str]:
    """Collect blocked day date strings for the year from the tenant's config."""
    from app.models.holiday_config import CustomBlockedDay

    blocked_result = await db.execute(
        select(CustomBlockedDay.date).where(
            CustomBlockedDay.tenant_id == tenant_id,
        )
    )
    dates: set[str] = set()
    for row in blocked_result.all():
        d = row[0]
        if isinstance(d, datetime.date) and d.year == year:
            dates.add(d.isoformat())
    return dates


async def _send_trainer_emails(
    tenant_id: UUID,
    year: int,
    snapshot_data: list[dict],
    trainer_ids: set[str],
    holiday_date_strings: set[str],
    is_update: bool = False,
    diff: ProgramDiff | None = None,
) -> None:
    """Send schedule emails to trainers (fire-and-forget background tasks)."""
    from app.core.email import send_email, send_email_background
    from app.core.trainer_schedule_pdf import generate_trainer_schedule_pdf
    from app.db.session import async_session_maker
    from app.models.tenant import Tenant

    from .email_settings import TEMPLATES_KEY, TRAINING_DEFAULT_TEMPLATES

    async with async_session_maker() as db:
        trainer_result = await db.execute(
            select(Trainer).where(
                Trainer.id.in_([UUID(tid) for tid in trainer_ids]),
                Trainer.tenant_id == tenant_id,
            )
        )
        trainers = {str(t.id): t for t in trainer_result.scalars().all()}

        tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = tenant_result.scalar_one()

    # Load customizable templates (fall back to defaults)
    saved_templates = (tenant.settings or {}).get(TEMPLATES_KEY, {})
    company_name = tenant.name or ""

    def _get_template(template_type: str) -> tuple[str, str]:
        """Return (subject, body_html) from saved template or defaults."""
        saved = saved_templates.get(template_type, {})
        defaults = TRAINING_DEFAULT_TEMPLATES.get(template_type, {})
        subj = saved.get("subject") or defaults.get("subject", "")
        body = saved.get("body_html") or defaults.get("body_html", "")
        return subj, body

    for tid in trainer_ids:
        trainer = trainers.get(tid)
        if not trainer or not trainer.email:
            continue

        trainer_name = f"{trainer.first_name} {trainer.last_name}"

        # Filter placements for this trainer
        trainer_placements = [p for p in snapshot_data if tid in p.get("trainer_ids", [])]

        # Generate PDF
        try:
            pdf_bytes = await generate_trainer_schedule_pdf(
                trainer_name=trainer_name,
                year=year,
                placements=trainer_placements,
                holiday_date_strings=holiday_date_strings,
            )
        except Exception:
            logger.error(f"Failed to generate PDF for trainer {tid}", exc_info=True)
            continue

        pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
        attachment = {
            "filename": f"training_schedule_{year}.pdf",
            "content": pdf_b64,
            "type": "application/pdf",
        }

        # Build email from customizable template
        if is_update and diff:
            tc = diff.per_trainer_changes.get(tid)
            changes_html = ""
            if tc:
                items = []
                for t in tc.added_trainings:
                    items.append(f'<li style="color:#059669;">New: {t}</li>')
                for t in tc.removed_trainings:
                    items.append(f'<li style="color:#dc2626;">Removed: {t}</li>')
                for t in tc.modified_trainings:
                    items.append(f'<li style="color:#d97706;">Changed: {t}</li>')
                if items:
                    changes_html = f"<h3>Changes</h3><ul>{''.join(items)}</ul>"

            subject, html_body = _get_template("training_schedule_update")
        else:
            changes_html = ""
            subject, html_body = _get_template("training_schedule_publish")

        # Replace placeholders
        replacements = {
            "[First Name]": trainer.first_name or "",
            "[Last Name]": trainer.last_name or "",
            "[Year]": str(year),
            "[Training Count]": str(len(trainer_placements)),
            "[Changes]": changes_html,
            "[Company Name]": company_name,
        }
        for placeholder, value in replacements.items():
            subject = subject.replace(placeholder, value)
            html_body = html_body.replace(placeholder, value)

        send_email_background(
            send_email,
            trainer.email,
            subject,
            html_body,
            attachments=[attachment],
            tenant_id=tenant_id,
            email_type="trainer_schedule",
        )


@router.post("/{year_id}/publish", response_model=TrainingProgramYearResponse)
async def publish_program_year(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Publish a training program year (initial publish only).

    Creates the first snapshot and sends schedule emails to all assigned trainers.
    For subsequent updates, use preview-changes + confirm-update.
    """
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    if program_year.published_version > 0:
        from app.core.exceptions import ValidationError

        raise ValidationError("Program already published. Use preview-changes and confirm-update instead.")

    # Load placements and build snapshot
    placements = await _load_placements_with_relations(db, year_id, current_user.tenant_id)
    snapshot_data = build_snapshot(placements)

    # Create snapshot v1
    new_version = 1
    snapshot = ProgramSnapshot(
        tenant_id=current_user.tenant_id,
        program_year_id=year_id,
        version=new_version,
        snapshot_data=snapshot_data,
        published_by=current_user.user_id,
    )
    db.add(snapshot)

    # Update program year
    program_year.status = "published"
    program_year.published_version = new_version
    program_year.published_at = datetime.datetime.now(tz=datetime.UTC)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.publish",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={"year": program_year.year, "version": new_version},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    # Collect all trainer IDs and send emails in background
    all_trainer_ids: set[str] = set()
    for entry in snapshot_data:
        all_trainer_ids.update(entry.get("trainer_ids", []))

    if all_trainer_ids:
        holiday_dates = await _collect_holiday_date_strings(db, program_year.year, current_user.tenant_id)
        task = asyncio.create_task(
            _send_trainer_emails(
                tenant_id=current_user.tenant_id,
                year=program_year.year,
                snapshot_data=snapshot_data,
                trainer_ids=all_trainer_ids,
                holiday_date_strings=holiday_dates,
            )
        )
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

    return TrainingProgramYearResponse.model_validate(program_year)


@router.post("/{year_id}/unpublish", response_model=TrainingProgramYearResponse)
async def unpublish_program_year(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Unpublish a training program year (revert to draft)."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    program_year.status = "draft"

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.unpublish",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={"year": program_year.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    return TrainingProgramYearResponse.model_validate(program_year)


@router.get("/{year_id}/preview-changes", response_model=ProgramDiffResponse)
async def preview_program_changes(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ProgramDiffResponse:
    """Preview changes between current program state and last published snapshot."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    if program_year.published_version == 0:
        from app.core.exceptions import ValidationError

        raise ValidationError("Program has not been published yet. Use publish endpoint for initial publish.")

    # Get last snapshot
    snap_result = await db.execute(
        select(ProgramSnapshot).where(
            ProgramSnapshot.program_year_id == year_id,
            ProgramSnapshot.tenant_id == current_user.tenant_id,
            ProgramSnapshot.version == program_year.published_version,
        )
    )
    last_snapshot = snap_result.scalar_one_or_none()
    if not last_snapshot:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Last published snapshot not found")

    # Build current snapshot
    placements = await _load_placements_with_relations(db, year_id, current_user.tenant_id)
    current_data = build_snapshot(placements)

    diff = compute_diff(last_snapshot.snapshot_data, current_data)
    return _diff_to_response(diff)


@router.post("/{year_id}/confirm-update", response_model=TrainingProgramYearResponse)
async def confirm_program_update(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Confirm a program update: create new snapshot and notify affected trainers."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    if program_year.published_version == 0:
        from app.core.exceptions import ValidationError

        raise ValidationError("Program has not been published yet. Use publish endpoint first.")

    # Get last snapshot for diff
    snap_result = await db.execute(
        select(ProgramSnapshot).where(
            ProgramSnapshot.program_year_id == year_id,
            ProgramSnapshot.tenant_id == current_user.tenant_id,
            ProgramSnapshot.version == program_year.published_version,
        )
    )
    last_snapshot = snap_result.scalar_one_or_none()

    # Build current snapshot
    placements = await _load_placements_with_relations(db, year_id, current_user.tenant_id)
    current_data = build_snapshot(placements)

    # Compute diff
    old_data = last_snapshot.snapshot_data if last_snapshot else []
    diff = compute_diff(old_data, current_data)

    # Create new snapshot
    new_version = program_year.published_version + 1
    snapshot = ProgramSnapshot(
        tenant_id=current_user.tenant_id,
        program_year_id=year_id,
        version=new_version,
        snapshot_data=current_data,
        published_by=current_user.user_id,
    )
    db.add(snapshot)

    # Update program year
    program_year.status = "published"
    program_year.published_version = new_version
    program_year.published_at = datetime.datetime.now(tz=datetime.UTC)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.update_publish",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={
            "year": program_year.year,
            "version": new_version,
            "affected_trainers": len(diff.affected_trainer_ids),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    # Send emails only to affected trainers
    if diff.affected_trainer_ids:
        holiday_dates = await _collect_holiday_date_strings(db, program_year.year, current_user.tenant_id)
        task = asyncio.create_task(
            _send_trainer_emails(
                tenant_id=current_user.tenant_id,
                year=program_year.year,
                snapshot_data=current_data,
                trainer_ids=diff.affected_trainer_ids,
                holiday_date_strings=holiday_dates,
                is_update=True,
                diff=diff,
            )
        )
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

    return TrainingProgramYearResponse.model_validate(program_year)


@router.get("/{year_id}/snapshots", response_model=list[ProgramSnapshotListItem])
async def list_snapshots(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[ProgramSnapshotListItem]:
    """List all published snapshots (version history) for a program year."""
    result = await db.execute(
        select(ProgramSnapshot)
        .where(
            ProgramSnapshot.program_year_id == year_id,
            ProgramSnapshot.tenant_id == current_user.tenant_id,
        )
        .order_by(ProgramSnapshot.version.desc())
    )
    snapshots = list(result.scalars().all())
    return [ProgramSnapshotListItem.model_validate(s) for s in snapshots]


@router.get("/{year_id}/snapshots/{version}", response_model=ProgramSnapshotResponse)
async def get_snapshot(
    year_id: UUID,
    version: int,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ProgramSnapshotResponse:
    """Get a specific published snapshot by version number."""
    result = await db.execute(
        select(ProgramSnapshot).where(
            ProgramSnapshot.program_year_id == year_id,
            ProgramSnapshot.version == version,
            ProgramSnapshot.tenant_id == current_user.tenant_id,
        )
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        from app.core.exceptions import NotFoundError

        raise NotFoundError(f"Snapshot version {version} not found")

    return ProgramSnapshotResponse.model_validate(snapshot)


# --- Program Year Training Placements ---


def _placement_to_response(p: ProgramYearTraining) -> ProgramYearTrainingResponse:
    """Convert a ProgramYearTraining to its response schema with training details."""
    trainer_assignments = []
    for ta in p.trainer_assignments or []:
        trainer_assignments.append(
            PlacementTrainerResponse(
                id=ta.id,
                placement_id=ta.placement_id,
                trainer_id=ta.trainer_id,
                trainer_first_name=ta.trainer.first_name,
                trainer_last_name=ta.trainer.last_name,
                created_at=ta.created_at,
            )
        )
    return ProgramYearTrainingResponse(
        id=p.id,
        program_year_id=p.program_year_id,
        training_id=p.training_id,
        training_name=p.training.name,
        training_slug=p.training.slug,
        training_abbreviation=p.training.abbreviation,
        training_duration=p.training.duration,
        training_color=p.training.color,
        location_id=p.location_id,
        location_name=p.location.name if p.location else None,
        location_code=p.location.code if p.location else None,
        start_date=p.start_date,
        created_at=p.created_at,
        updated_at=p.updated_at,
        trainer_assignments=trainer_assignments,
    )


@router.get("/{year_id}/trainings", response_model=list[ProgramYearTrainingResponse])
async def list_year_trainings(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[ProgramYearTrainingResponse]:
    """List all training placements for a program year."""
    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            selectinload(ProgramYearTraining.trainer_assignments).joinedload(PlacementTrainer.trainer),
        )
        .where(
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
        .order_by(ProgramYearTraining.start_date, ProgramYearTraining.created_at)
    )
    placements = list(result.scalars().unique().all())
    return [_placement_to_response(p) for p in placements]


@router.post("/{year_id}/trainings", response_model=ProgramYearTrainingResponse, status_code=201)
async def create_year_training(
    year_id: UUID,
    payload: ProgramYearTrainingCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramYearTrainingResponse:
    """Place a training on the program year calendar."""
    # Verify program year exists and belongs to tenant
    py_result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            TrainingProgramYear.tenant_id == current_user.tenant_id,
        )
    )
    if not py_result.scalar_one_or_none():
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    placement = ProgramYearTraining(
        tenant_id=current_user.tenant_id,
        program_year_id=year_id,
        training_id=payload.training_id,
        start_date=payload.start_date,
        location_id=payload.location_id,
    )
    db.add(placement)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="program_year_training.create",
        resource_type="program_year_training",
        resource_id=placement.id,
        details={"training_id": str(payload.training_id), "start_date": str(payload.start_date)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    # Reload with training relationship
    result = await db.execute(
        select(ProgramYearTraining)
        .options(joinedload(ProgramYearTraining.training), joinedload(ProgramYearTraining.location))
        .where(ProgramYearTraining.id == placement.id)
    )
    placement = result.scalar_one()
    return _placement_to_response(placement)


@router.delete("/{year_id}/trainings/{placement_id}")
async def delete_year_training(
    year_id: UUID,
    placement_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Remove a training placement from the program year calendar."""
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Placement not found")

    await db.delete(placement)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="program_year_training.delete",
        resource_type="program_year_training",
        resource_id=placement_id,
        details={"training_id": str(placement.training_id), "start_date": str(placement.start_date)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Placement deleted"}


@router.put("/{year_id}/trainings/{placement_id}", response_model=ProgramYearTrainingResponse)
async def update_year_training(
    year_id: UUID,
    placement_id: UUID,
    payload: ProgramYearTrainingUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramYearTrainingResponse:
    """Update a training placement (location, start date)."""
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Placement not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(placement, field, value)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="program_year_training.update",
        resource_type="program_year_training",
        resource_id=placement_id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    # Expire cached instance so relationships are freshly loaded
    db.expire(placement)

    # Reload with relationships
    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            selectinload(ProgramYearTraining.trainer_assignments).joinedload(PlacementTrainer.trainer),
        )
        .where(ProgramYearTraining.id == placement_id)
    )
    placement = result.scalar_one()
    return _placement_to_response(placement)


# --- Placement Trainer Assignments ---


def _compute_placement_end(p: ProgramYearTraining) -> datetime.date:
    """Compute the end date of a placement based on training duration."""
    duration = p.training.duration if p.training.duration else 1
    return p.start_date + datetime.timedelta(days=duration - 1)


async def _check_trainer_conflicts(
    db: DbSessionDep,
    trainer_id: UUID,
    placement: ProgramYearTraining,
    tenant_id: UUID,
) -> list[TrainerConflict]:
    """Check for unavailability and double-booking conflicts."""
    conflicts: list[TrainerConflict] = []
    p_start = placement.start_date
    p_end = _compute_placement_end(placement)

    # 1. Check trainer unavailability
    unavail_result = await db.execute(
        select(TrainerUnavailability).where(
            TrainerUnavailability.trainer_id == trainer_id,
            TrainerUnavailability.tenant_id == tenant_id,
            TrainerUnavailability.start_date <= p_end,
            TrainerUnavailability.end_date >= p_start,
        )
    )
    for u in unavail_result.scalars().all():
        conflicts.append(
            TrainerConflict(
                type="unavailability",
                description=u.description or "Trainer is unavailable during this period",
                start_date=u.start_date,
                end_date=u.end_date,
            )
        )

    # 2. Check double-booking: trainer already assigned to another placement with overlapping dates
    other_assignments = await db.execute(
        select(PlacementTrainer)
        .join(ProgramYearTraining, PlacementTrainer.placement_id == ProgramYearTraining.id)
        .options(
            joinedload(PlacementTrainer.placement).joinedload(ProgramYearTraining.training),
        )
        .where(
            PlacementTrainer.trainer_id == trainer_id,
            PlacementTrainer.tenant_id == tenant_id,
            PlacementTrainer.placement_id != placement.id,
            ProgramYearTraining.program_year_id == placement.program_year_id,
        )
    )
    for oa in other_assignments.scalars().unique().all():
        other_p = oa.placement
        other_start = other_p.start_date
        other_end = _compute_placement_end(other_p)
        if other_start <= p_end and other_end >= p_start:
            training_name = other_p.training.name if other_p.training else "Unknown"
            conflicts.append(
                TrainerConflict(
                    type="double_booking",
                    description=f"Trainer is already assigned to '{training_name}' ({other_start} – {other_end})",
                    start_date=other_start,
                    end_date=other_end,
                    other_training_name=training_name,
                    other_placement_id=other_p.id,
                )
            )

    return conflicts


@router.get("/{year_id}/trainings/{placement_id}/check-trainer", response_model=AvailabilityCheckResponse)
async def check_trainer_availability(
    year_id: UUID,
    placement_id: UUID,
    trainer_id: UUID = Query(...),
    current_user: TenantAdminDep = ...,
    db: DbSessionDep = ...,
) -> AvailabilityCheckResponse:
    """Check if a trainer is available for a given placement."""
    result = await db.execute(
        select(ProgramYearTraining)
        .options(joinedload(ProgramYearTraining.training))
        .where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Placement not found")

    # Verify trainer exists and belongs to tenant
    trainer_result = await db.execute(
        select(Trainer).where(
            Trainer.id == trainer_id,
            Trainer.tenant_id == current_user.tenant_id,
        )
    )
    if not trainer_result.scalar_one_or_none():
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Trainer not found")

    conflicts = await _check_trainer_conflicts(db, trainer_id, placement, current_user.tenant_id)
    return AvailabilityCheckResponse(available=len(conflicts) == 0, conflicts=conflicts)


@router.post(
    "/{year_id}/trainings/{placement_id}/trainers",
    response_model=PlacementTrainerResponse,
    status_code=201,
)
async def assign_trainer_to_placement(
    year_id: UUID,
    placement_id: UUID,
    payload: PlacementTrainerCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PlacementTrainerResponse:
    """Assign a trainer to a training placement."""
    # Verify placement
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    if not result.scalar_one_or_none():
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Placement not found")

    # Verify trainer
    trainer_result = await db.execute(
        select(Trainer).where(
            Trainer.id == payload.trainer_id,
            Trainer.tenant_id == current_user.tenant_id,
        )
    )
    trainer = trainer_result.scalar_one_or_none()
    if not trainer:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Trainer not found")

    # Check uniqueness
    existing = await db.execute(
        select(PlacementTrainer).where(
            PlacementTrainer.placement_id == placement_id,
            PlacementTrainer.trainer_id == payload.trainer_id,
        )
    )
    if existing.scalar_one_or_none():
        from app.core.exceptions import ConflictError

        raise ConflictError("Trainer is already assigned to this placement")

    assignment = PlacementTrainer(
        tenant_id=current_user.tenant_id,
        placement_id=placement_id,
        trainer_id=payload.trainer_id,
    )
    db.add(assignment)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="placement_trainer.assign",
        resource_type="placement_trainer",
        resource_id=assignment.id,
        details={"placement_id": str(placement_id), "trainer_id": str(payload.trainer_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(assignment)

    return PlacementTrainerResponse(
        id=assignment.id,
        placement_id=assignment.placement_id,
        trainer_id=assignment.trainer_id,
        trainer_first_name=trainer.first_name,
        trainer_last_name=trainer.last_name,
        created_at=assignment.created_at,
    )


@router.delete("/{year_id}/trainings/{placement_id}/trainers/{assignment_id}")
async def remove_trainer_from_placement(
    year_id: UUID,
    placement_id: UUID,
    assignment_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Remove a trainer assignment from a placement."""
    result = await db.execute(
        select(PlacementTrainer).where(
            PlacementTrainer.id == assignment_id,
            PlacementTrainer.placement_id == placement_id,
            PlacementTrainer.tenant_id == current_user.tenant_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Trainer assignment not found")

    await db.delete(assignment)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="placement_trainer.remove",
        resource_type="placement_trainer",
        resource_id=assignment_id,
        details={"placement_id": str(placement_id), "trainer_id": str(assignment.trainer_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Trainer removed from placement"}
