"""Program year publishing, snapshots, and trainer email notifications."""

import asyncio
import base64
import datetime
import logging
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.program_snapshot import ProgramDiff, build_snapshot, compute_diff
from app.models.audit import AuditLog
from app.models.training_program import (
    PlacementTrainer,
    ProgramSnapshot,
    ProgramYearTraining,
    TrainingProgramYear,
)
from app.schemas.training_program import (
    PlacementChangeResponse,
    ProgramDiffResponse,
    ProgramSnapshotListItem,
    ProgramSnapshotResponse,
    TrainerChangeResponse,
    TrainingProgramYearResponse,
)

from .programs import _background_tasks, _tenant_filter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/programs/years", tags=["training-programs"])


# ── Helpers ──────────────────────────────────────────────────────────────────


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
    from app.models.trainer import Trainer

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


# ── Endpoints ────────────────────────────────────────────────────────────────


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
        raise NotFoundError("Program year not found")

    if program_year.published_version > 0:
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
        raise NotFoundError("Program year not found")

    if program_year.published_version == 0:
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
        raise NotFoundError("Program year not found")

    if program_year.published_version == 0:
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
        raise NotFoundError(f"Snapshot version {version} not found")

    return ProgramSnapshotResponse.model_validate(snapshot)
