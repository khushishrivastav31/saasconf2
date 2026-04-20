"""Alumni management endpoints (conference-scoped)."""

import csv
import io
import re
from uuid import UUID

from fastapi import APIRouter, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.constants import ResourceType
from app.core.conference_helpers import check_conference_admin
from app.core.csv_export import csv_response
from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip
from app.core.exceptions import NotFoundError
from app.core.search import unaccent_ilike
from app.models.alumni import Alumni, AlumniSource
from app.models.audit import AuditAction, AuditLog
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
from app.models.registration import Registration
from app.schemas.alumni import (
    AlumniCheckResponse,
    AlumniConferenceInfo,
    AlumniCreate,
    AlumniImportResult,
    AlumniListResponse,
    AlumniResponse,
    AlumniUpdate,
)
from app.services.conference import ConferenceService

router = APIRouter()

svc = ConferenceService

# Simple email regex for CSV validation (not as strict as Pydantic EmailStr)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Column aliases for flexible CSV headers
_EMAIL_ALIASES = {"email", "e-mail", "e_mail", "emailaddress", "email_address"}
_FIRST_NAME_ALIASES = {"first_name", "firstname", "first name", "given_name", "givenname", "vorname"}
_LAST_NAME_ALIASES = {"last_name", "lastname", "last name", "family_name", "familyname", "nachname", "surname"}
_COMPANY_ALIASES = {"company", "company_name", "companyname", "organization", "organisation", "firma"}


def _build_response(alumni: Alumni) -> AlumniResponse:
    return AlumniResponse.model_validate(alumni)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=AlumniListResponse)
async def list_alumni(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
) -> AlumniListResponse:
    """List alumni for a conference with pagination and search."""
    await svc.resolve_conference(db, conference_id, current_user.require_tenant_id())

    query = select(Alumni).where(
        Alumni.conference_id == conference_id,
        Alumni.tenant_id == current_user.require_tenant_id(),
    )

    if search:
        query = query.where(
            unaccent_ilike(Alumni.first_name, search)
            | unaccent_ilike(Alumni.last_name, search)
            | unaccent_ilike(Alumni.email, search)
            | unaccent_ilike(Alumni.company, search)
        )

    query = query.order_by(Alumni.last_name, Alumni.first_name)

    result = await svc.list_resources(db, query, page, page_size)

    return AlumniListResponse(
        items=[_build_response(a) for a in result.items],
        total=result.total,
    )


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post("", response_model=AlumniResponse, status_code=201)
async def create_alumni(
    conference_id: UUID,
    data: AlumniCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> AlumniResponse:
    """Add a single alumni record."""
    await check_conference_admin(conference_id, current_user, db)
    await svc.resolve_conference(db, conference_id, current_user.require_tenant_id())

    # Check uniqueness
    existing = await db.execute(
        select(Alumni).where(
            Alumni.conference_id == conference_id,
            func.lower(Alumni.email) == data.email.lower(),
        )
    )
    if existing.scalar_one_or_none():
        from app.core.exceptions import ConflictError

        raise ConflictError(f"Alumni with email '{data.email}' already exists for this conference")

    alumni = Alumni(
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        email=data.email.lower(),
        first_name=data.first_name,
        last_name=data.last_name,
        company=data.company,
        notes=data.notes,
        source=AlumniSource.MANUAL.value,
    )

    audit = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=AuditAction.ALUMNI_CREATE,
        resource_type=ResourceType.ALUMNI,
        resource_id=alumni.id,
        details={"conference_id": str(conference_id), "email": data.email},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    alumni = await svc.create_resource(db, alumni, audit_log=audit)
    return _build_response(alumni)


# ---------------------------------------------------------------------------
# Update (with data propagation)
# ---------------------------------------------------------------------------


@router.put("/{alumni_id}", response_model=AlumniResponse)
async def update_alumni(
    conference_id: UUID,
    alumni_id: UUID,
    data: AlumniUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> AlumniResponse:
    """Update an alumni record. Propagates email/name changes to linked records."""
    await check_conference_admin(conference_id, current_user, db)

    alumni = await svc.get_resource(
        db,
        Alumni,
        alumni_id,
        conference_id=conference_id,
        tenant_id=current_user.require_tenant_id(),
        label="Alumni",
    )

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        return _build_response(alumni)

    old_email = alumni.email
    old_first_name = alumni.first_name
    old_last_name = alumni.last_name

    # Normalise email to lowercase
    if update_data.get("email"):
        update_data["email"] = update_data["email"].lower()

        # Check uniqueness if email changed
        if update_data["email"] != old_email:
            dup = await db.execute(
                select(Alumni).where(
                    Alumni.conference_id == conference_id,
                    func.lower(Alumni.email) == update_data["email"],
                    Alumni.id != alumni_id,
                )
            )
            if dup.scalar_one_or_none():
                from app.core.exceptions import ConflictError

                raise ConflictError(f"Alumni with email '{update_data['email']}' already exists")

    propagated_to: list[str] = []
    new_email = update_data.get("email", old_email)
    new_first = update_data.get("first_name", old_first_name)
    new_last = update_data.get("last_name", old_last_name)

    email_changed = new_email != old_email
    name_changed = new_first != old_first_name or new_last != old_last_name

    # Propagate to Registration
    if email_changed or name_changed:
        reg_result = await db.execute(
            select(Registration).where(
                Registration.conference_id == conference_id,
                func.lower(Registration.email) == old_email,
            )
        )
        reg = reg_result.scalar_one_or_none()
        if reg:
            if email_changed:
                reg.email = new_email
            if "first_name" in update_data:
                reg.first_name = new_first
            if "last_name" in update_data:
                reg.last_name = new_last
            propagated_to.append("registration")

    # Propagate to CFPApplicant (portal user)
    if email_changed or name_changed:
        applicant_result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.tenant_id == current_user.require_tenant_id(),
                func.lower(CFPApplicant.email) == old_email,
            )
        )
        applicant = applicant_result.scalar_one_or_none()
        if applicant:
            if email_changed:
                applicant.email = new_email
            if "first_name" in update_data:
                applicant.first_name = new_first
            if "last_name" in update_data:
                applicant.last_name = new_last
            propagated_to.append("portal_user")

    audit = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=AuditAction.ALUMNI_UPDATE,
        resource_type=ResourceType.ALUMNI,
        resource_id=alumni_id,
        details={
            "conference_id": str(conference_id),
            "old_email": old_email,
            "new_email": new_email,
            "propagated_to": propagated_to,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    alumni = await svc.update_resource(db, alumni, update_data, audit_log=audit)
    return _build_response(alumni)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete("/{alumni_id}")
async def delete_alumni(
    conference_id: UUID,
    alumni_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a single alumni record."""
    await check_conference_admin(conference_id, current_user, db)

    alumni = await svc.get_resource(
        db,
        Alumni,
        alumni_id,
        conference_id=conference_id,
        tenant_id=current_user.require_tenant_id(),
        label="Alumni",
    )

    name = f"{alumni.first_name} {alumni.last_name}"
    audit = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=AuditAction.ALUMNI_DELETE,
        resource_type=ResourceType.ALUMNI,
        resource_id=alumni_id,
        details={"email": alumni.email, "name": name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    await svc.delete_resource(db, alumni, audit_log=audit)
    return {"message": f"Alumni '{name}' deleted successfully"}


# ---------------------------------------------------------------------------
# CSV Import
# ---------------------------------------------------------------------------


@router.post("/import", response_model=AlumniImportResult)
async def import_alumni_csv(
    conference_id: UUID,
    file: UploadFile,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> AlumniImportResult:
    """Bulk import alumni from a CSV file."""
    await check_conference_admin(conference_id, current_user, db)
    await svc.resolve_conference(db, conference_id, current_user.require_tenant_id())

    content = await file.read()
    # Try UTF-8 BOM first, then plain UTF-8, then latin-1
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        return AlumniImportResult(imported=0, skipped=0, errors=["Could not decode file. Use UTF-8 encoding."])

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return AlumniImportResult(imported=0, skipped=0, errors=["CSV file has no header row."])

    # Map headers to normalised keys
    normalised = {h.strip().lower().replace(" ", "_").replace("-", "_"): h for h in reader.fieldnames}
    email_col = next((normalised[k] for k in normalised if k in _EMAIL_ALIASES), None)
    first_col = next((normalised[k] for k in normalised if k in _FIRST_NAME_ALIASES), None)
    last_col = next((normalised[k] for k in normalised if k in _LAST_NAME_ALIASES), None)
    company_col = next((normalised[k] for k in normalised if k in _COMPANY_ALIASES), None)

    if not email_col:
        return AlumniImportResult(imported=0, skipped=0, errors=["CSV must have an 'email' column."])

    # Pre-load existing emails for this conference
    existing_result = await db.execute(
        select(func.lower(Alumni.email)).where(
            Alumni.conference_id == conference_id,
            Alumni.tenant_id == current_user.require_tenant_id(),
        )
    )
    existing_emails: set[str] = {row[0] for row in existing_result.all()}

    imported = 0
    skipped = 0
    errors: list[str] = []
    batch: list[Alumni] = []

    for row_num, row in enumerate(reader, start=2):  # row 1 is header
        email_raw = (row.get(email_col) or "").strip()
        if not email_raw:
            errors.append(f"Row {row_num}: missing email")
            continue

        email = email_raw.lower()
        if not _EMAIL_RE.match(email):
            errors.append(f"Row {row_num}: invalid email '{email_raw}'")
            continue

        if email in existing_emails:
            skipped += 1
            continue

        first_name = (row.get(first_col) or "").strip() if first_col else ""
        last_name = (row.get(last_col) or "").strip() if last_col else ""
        company = (row.get(company_col) or "").strip() if company_col else None

        if not first_name:
            first_name = email.split("@")[0]
        if not last_name:
            last_name = "-"

        alumni = Alumni(
            tenant_id=current_user.require_tenant_id(),
            conference_id=conference_id,
            email=email,
            first_name=first_name[:255],
            last_name=last_name[:255],
            company=company[:255] if company else None,
            source=AlumniSource.IMPORT.value,
        )
        batch.append(alumni)
        existing_emails.add(email)
        imported += 1

    if batch:
        db.add_all(batch)
        await db.flush()

    # Audit log
    audit = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=AuditAction.ALUMNI_IMPORT,
        resource_type=ResourceType.ALUMNI,
        details={
            "conference_id": str(conference_id),
            "imported": imported,
            "skipped": skipped,
            "errors": len(errors),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.add(audit)
    await db.commit()

    return AlumniImportResult(imported=imported, skipped=skipped, errors=errors[:50])


# ---------------------------------------------------------------------------
# CSV Export
# ---------------------------------------------------------------------------


@router.get("/export")
async def export_alumni_csv(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Export alumni for a conference as CSV."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await svc.resolve_conference(db, conference_id, current_user.require_tenant_id())

    result = await db.execute(
        select(Alumni)
        .where(
            Alumni.conference_id == conference_id,
            Alumni.tenant_id == current_user.require_tenant_id(),
        )
        .order_by(Alumni.last_name, Alumni.first_name)
        .limit(50000)
    )
    alumni_list = result.scalars().all()

    safe_name = (conference.name or "conference").replace(" ", "_")
    filename = f"alumni_{safe_name}.csv"

    return csv_response(
        headers=["Email", "First Name", "Last Name", "Company", "Source", "Date Added"],
        rows=alumni_list,
        row_mapper=lambda a: [
            a.email,
            a.first_name,
            a.last_name,
            a.company or "",
            a.source,
            a.created_at.strftime("%Y-%m-%d") if a.created_at else "",
        ],
        filename=filename,
    )


# ---------------------------------------------------------------------------
# Alumni Check (cross-conference)
# ---------------------------------------------------------------------------


@router.get("/check", response_model=AlumniCheckResponse)
async def check_alumni(
    conference_id: UUID,
    email: str = Query(..., min_length=3),
    db: DbSessionDep = None,  # type: ignore[assignment]
) -> AlumniCheckResponse:
    """Check if an email belongs to an alumni across all tenant conferences.

    This looks up the tenant from the conference_id, then searches for the
    email in the alumni table across ALL conferences for that tenant.
    """
    # Resolve tenant from conference
    conf_result = await db.execute(select(Conference).where(Conference.id == conference_id))
    conf = conf_result.scalar_one_or_none()
    if not conf:
        raise NotFoundError("Conference not found")

    result = await db.execute(
        select(Alumni, Conference.name)
        .join(Conference, Alumni.conference_id == Conference.id)
        .where(
            Alumni.tenant_id == conf.tenant_id,
            func.lower(Alumni.email) == email.strip().lower(),
            Alumni.conference_id != conference_id,  # Exclude current conference
        )
        .order_by(Conference.start_date.desc())
    )
    rows = result.all()

    return AlumniCheckResponse(
        is_alumni=len(rows) > 0,
        conferences=[
            AlumniConferenceInfo(
                conference_id=alumni.conference_id,
                conference_name=conf_name,
            )
            for alumni, conf_name in rows
        ],
    )
