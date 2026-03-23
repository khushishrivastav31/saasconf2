"""Sponsor contract management endpoints (nested under sponsors)."""

import base64
import io
import re
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, select

from app.constants import ContractStatus
from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip
from app.core.email import send_email
from app.core.email_templates import build_sponsor_contract_context, render_email
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.conference import Conference
from app.models.settings import SponsorPackage
from app.models.sponsor import Sponsor
from app.models.sponsor_contract import SponsorContract, SponsorContractVersion
from app.schemas.email_template import EmailTemplateType
from app.schemas.sponsor_contract import (
    SponsorContractResponse,
    SponsorContractSendPreview,
    SponsorContractSendRequest,
    SponsorContractSendResponse,
    SponsorContractUpdateContent,
    SponsorContractUpdateStatus,
    SponsorContractVersionResponse,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sanitize_for_filename(text: str) -> str:
    """Sanitize a string for use in a filename."""
    text = re.sub(r"[^\w\s\-]", "", text)
    text = re.sub(r"\s+", "-", text.strip())
    return text or "unknown"


def _generate_contract_filename(
    conference: Conference,
    package: SponsorPackage,
    company_name: str,
) -> str:
    """Generate contract filename: Date_ConferenceAbbr_Sponsorship_Package_Company."""
    date_str = datetime.now(UTC).strftime("%Y-%m-%d")
    conf_part = _sanitize_for_filename(conference.abbreviation or conference.name)
    pkg_part = _sanitize_for_filename(package.name)
    company_part = _sanitize_for_filename(company_name)
    return f"{date_str}_{conf_part}_Sponsorship_{pkg_part}_{company_part}"


def _convert_to_html(file_data: bytes, content_type: str) -> str | None:
    """Convert file content to editable HTML. Returns None for PDFs."""
    if content_type == "application/pdf":
        return None

    if content_type in {
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }:
        import mammoth

        result = mammoth.convert_to_html(io.BytesIO(file_data))
        return result.value

    if content_type in {"text/rtf", "application/rtf"}:
        try:
            from striprtf.striprtf import rtf_to_text

            text = rtf_to_text(file_data.decode("utf-8", errors="replace"))
            return f"<div>{text}</div>"
        except Exception:
            # Fall back to treating as plain text
            text = file_data.decode("utf-8", errors="replace")
            return f"<pre>{text}</pre>"

    if content_type == "text/plain":
        text = file_data.decode("utf-8", errors="replace")
        return f"<pre>{text}</pre>"

    return None


def _sanitize_for_pdf(text: str) -> str:
    """Replace Unicode characters unsupported by fpdf2 built-in fonts."""
    replacements = {
        "\u2013": "-",  # en-dash
        "\u2014": "--",  # em-dash
        "\u2018": "'",  # left single quote
        "\u2019": "'",  # right single quote
        "\u201c": '"',  # left double quote
        "\u201d": '"',  # right double quote
        "\u2026": "...",  # ellipsis
        "\u2022": "*",  # bullet
        "\u00a0": " ",  # non-breaking space
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text


def _generate_pdf_from_html(html_content: str) -> bytes:
    """Generate a PDF from HTML content using fpdf2."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.set_auto_page_break(auto=True, margin=25)
    pdf.write_html(_sanitize_for_pdf(html_content))
    return bytes(pdf.output())


def _generate_docx_from_html(html_content: str) -> bytes:
    """Generate a DOCX file from HTML content using html2docx."""
    from html2docx import html2docx

    buf = html2docx(html_content, title="Contract")
    return buf.getvalue()


async def _get_sponsor(
    db: DbSessionDep,
    conference_id: UUID,
    sponsor_id: UUID,
    tenant_id: UUID,
) -> Sponsor:
    """Fetch sponsor or raise 404."""
    result = await db.execute(
        select(Sponsor).where(
            Sponsor.id == sponsor_id,
            Sponsor.conference_id == conference_id,
            Sponsor.tenant_id == tenant_id,
        )
    )
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        raise NotFoundError(f"Sponsor '{sponsor_id}' not found")
    return sponsor


async def _get_contract(db: DbSessionDep, sponsor_id: UUID) -> SponsorContract:
    """Fetch the contract for a sponsor or raise 404."""
    result = await db.execute(select(SponsorContract).where(SponsorContract.sponsor_id == sponsor_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise NotFoundError("No contract found for this sponsor")
    return contract


def _build_contract_response(contract: SponsorContract, version_count: int = 0) -> SponsorContractResponse:
    """Build response from model."""
    return SponsorContractResponse(
        id=contract.id,
        tenant_id=contract.tenant_id,
        sponsor_id=contract.sponsor_id,
        conference_id=contract.conference_id,
        source_package_id=contract.source_package_id,
        filename=contract.filename,
        content_type=contract.content_type,
        file_size=contract.file_size,
        html_content=contract.html_content,
        is_editable=contract.is_editable,
        version=contract.version,
        version_count=version_count,
        status=contract.status,
        last_sent_at=contract.last_sent_at,
        sent_to=contract.sent_to,
        created_by=contract.created_by,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
    )


async def _snapshot_version(db: DbSessionDep, contract: SponsorContract) -> None:
    """Save the current contract state as a version snapshot."""
    version = SponsorContractVersion(
        contract_id=contract.id,
        version=contract.version,
        html_content=contract.html_content,
        file_data=contract.file_data,
        content_type=contract.content_type,
        file_size=contract.file_size,
        filename=contract.filename,
        created_by=contract.created_by,
    )
    db.add(version)


async def _count_versions(db: DbSessionDep, contract_id: UUID) -> int:
    """Count version snapshots for a contract."""
    result = await db.execute(select(func.count()).where(SponsorContractVersion.contract_id == contract_id))
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=SponsorContractResponse)
async def get_contract(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SponsorContractResponse:
    """Get the current contract for a sponsor."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)
    vc = await _count_versions(db, contract.id)
    return _build_contract_response(contract, vc)


@router.post("/generate", response_model=SponsorContractResponse, status_code=201)
async def generate_contract(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
    force: bool = Query(False, description="Overwrite existing contract (saves old as version)"),
) -> SponsorContractResponse:
    """Generate a contract from the sponsor's package template."""
    sponsor = await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)

    if not sponsor.sponsor_package_id:
        raise ValidationError("Sponsor must be assigned to a package to generate a contract")

    # Check for existing contract
    existing_result = await db.execute(select(SponsorContract).where(SponsorContract.sponsor_id == sponsor_id))
    existing = existing_result.scalar_one_or_none()

    if existing and not force:
        raise ValidationError("Contract already exists. Use force=true to regenerate (old version will be preserved).")

    # Get package template
    pkg_result = await db.execute(select(SponsorPackage).where(SponsorPackage.id == sponsor.sponsor_package_id))
    package = pkg_result.scalar_one_or_none()
    if not package:
        raise NotFoundError("Sponsor package not found")

    template_result = await db.execute(
        select(Attachment)
        .where(
            Attachment.entity_type == "sponsor_package_contract",
            Attachment.entity_id == sponsor.sponsor_package_id,
            Attachment.tenant_id == current_user.tenant_id,
        )
        .order_by(Attachment.created_at.desc())
    )
    template = template_result.scalar_one_or_none()
    if not template:
        raise NotFoundError("No contract template found for this package")

    # Get conference for filename
    conf_result = await db.execute(select(Conference).where(Conference.id == conference_id))
    conference = conf_result.scalar_one()

    # Generate filename and content
    base_filename = _generate_contract_filename(conference, package, sponsor.company_name)
    is_pdf = template.content_type == "application/pdf"
    html_content = _convert_to_html(template.file_data, template.content_type)

    if existing:
        # Snapshot old version before overwriting
        await _snapshot_version(db, existing)
        # Update existing
        existing.source_package_id = sponsor.sponsor_package_id
        existing.filename = base_filename
        existing.content_type = template.content_type
        existing.file_data = template.file_data
        existing.file_size = template.file_size
        existing.html_content = html_content
        existing.is_editable = not is_pdf
        existing.version = existing.version + 1
        existing.created_by = current_user.user_id
        contract = existing
    else:
        contract = SponsorContract(
            tenant_id=current_user.tenant_id,
            sponsor_id=sponsor_id,
            conference_id=conference_id,
            source_package_id=sponsor.sponsor_package_id,
            filename=base_filename,
            content_type=template.content_type,
            file_data=template.file_data,
            file_size=template.file_size,
            html_content=html_content,
            is_editable=not is_pdf,
            version=1,
            status=ContractStatus.DRAFT,
            created_by=current_user.user_id,
        )
        db.add(contract)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor_contract.generate",
        resource_type="sponsor_contract",
        resource_id=contract.id,
        details={
            "sponsor_id": str(sponsor_id),
            "package_id": str(sponsor.sponsor_package_id),
            "filename": base_filename,
            "regenerated": bool(existing),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(contract)

    vc = await _count_versions(db, contract.id)
    return _build_contract_response(contract, vc)


@router.put("/content", response_model=SponsorContractResponse)
async def save_contract_content(
    conference_id: UUID,
    sponsor_id: UUID,
    body: SponsorContractUpdateContent,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorContractResponse:
    """Save edited HTML content (creates a new version)."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    if not contract.is_editable:
        raise ValidationError("This contract is not editable (PDF)")

    # Snapshot current version
    await _snapshot_version(db, contract)

    # Update content
    contract.html_content = body.html_content
    contract.version += 1
    contract.created_by = current_user.user_id

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor_contract.edit",
        resource_type="sponsor_contract",
        resource_id=contract.id,
        details={"sponsor_id": str(sponsor_id), "version": contract.version},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(contract)

    vc = await _count_versions(db, contract.id)
    return _build_contract_response(contract, vc)


@router.put("/status", response_model=SponsorContractResponse)
async def update_contract_status(
    conference_id: UUID,
    sponsor_id: UUID,
    body: SponsorContractUpdateStatus,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorContractResponse:
    """Update contract status (draft/sent/signed)."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    if body.status not in ContractStatus.ALL:
        raise ValidationError(f"Invalid status '{body.status}'")

    contract.status = body.status

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor_contract.status_change",
        resource_type="sponsor_contract",
        resource_id=contract.id,
        details={"sponsor_id": str(sponsor_id), "status": body.status},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(contract)

    vc = await _count_versions(db, contract.id)
    return _build_contract_response(contract, vc)


@router.get("/download")
async def download_contract(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> Response:
    """Download the current contract (edited HTML or original binary)."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    # For editable contracts, generate a Word document from the current HTML
    if contract.is_editable and contract.html_content:
        docx_bytes = _generate_docx_from_html(contract.html_content)
        docx_filename = f"{contract.filename}.docx"
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": safe_content_disposition(docx_filename),
                "Content-Length": str(len(docx_bytes)),
            },
        )

    if not contract.file_data:
        raise NotFoundError("No file data available for this contract")

    return Response(
        content=contract.file_data,
        media_type=contract.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(contract.filename),
            "Content-Length": str(contract.file_size),
        },
    )


@router.get("/pdf")
async def download_contract_pdf(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> Response:
    """Generate and download a PDF from the current HTML content."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    if not contract.html_content:
        raise ValidationError("Cannot generate PDF: no HTML content available (PDF-only contract)")

    pdf_bytes = _generate_pdf_from_html(contract.html_content)
    pdf_filename = f"{contract.filename}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": safe_content_disposition(pdf_filename),
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.get("/send-preview", response_model=SponsorContractSendPreview)
async def send_preview(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SponsorContractSendPreview:
    """Render the email template with placeholders filled for preview/editing."""
    sponsor = await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    conf_result = await db.execute(select(Conference.name).where(Conference.id == conference_id))
    conference_name = conf_result.scalar_one_or_none() or ""

    package_name = ""
    if contract.source_package_id:
        pkg_result = await db.execute(
            select(SponsorPackage.name).where(SponsorPackage.id == contract.source_package_id)
        )
        package_name = pkg_result.scalar_one_or_none() or ""

    context = build_sponsor_contract_context(
        company_name=sponsor.company_name,
        conference_name=conference_name,
        package_name=package_name,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.SPONSOR_CONTRACT_SEND,
        context,
        conference_id=conference_id,
    )

    return SponsorContractSendPreview(subject=rendered.subject, body_html=rendered.body_html)


@router.post("/send", response_model=SponsorContractSendResponse)
async def send_contract(
    conference_id: UUID,
    sponsor_id: UUID,
    body: SponsorContractSendRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorContractSendResponse:
    """Send the contract via email to specified recipients."""
    sponsor = await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    # Collect all recipient emails
    recipients: list[str] = list(body.recipient_emails)
    contact_persons = sponsor.contact_persons or []
    for idx in body.include_contact_persons:
        if 0 <= idx < len(contact_persons):
            email = contact_persons[idx].get("email")
            if email and email not in recipients:
                recipients.append(email)

    if not recipients:
        raise ValidationError("No recipients specified")

    # Determine PDF attachment
    email_attachments: list[dict] | None = None

    if contract.content_type == "application/pdf" and contract.file_data:
        email_attachments = [
            {
                "filename": f"{contract.filename}.pdf",
                "content": base64.b64encode(contract.file_data).decode("ascii"),
            }
        ]
    elif body.send_as_pdf and contract.html_content:
        pdf_bytes = _generate_pdf_from_html(contract.html_content)
        email_attachments = [
            {
                "filename": f"{contract.filename}.pdf",
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
            }
        ]

    # Send to each recipient using the user-edited body
    sent_count = 0
    failed: list[str] = []
    now = datetime.now(UTC)

    for recipient in recipients:
        success = await send_email(
            to=recipient,
            subject=body.subject,
            html=body.body_html,
            attachments=email_attachments,
            db=db,
            tenant_id=current_user.tenant_id,
            email_type="sponsor_contract",
        )
        if success:
            sent_count += 1
        else:
            failed.append(recipient)

    # Update contract tracking
    if sent_count > 0:
        # Snapshot current version before modifying status/send history
        await _snapshot_version(db, contract)

        contract.last_sent_at = now
        sent_history = list(contract.sent_to or [])  # Copy BEFORE mutating — SQLAlchemy compares old vs new
        for recipient in recipients:
            if recipient not in failed:
                sent_history.append(
                    {
                        "email": recipient,
                        "sent_at": now.isoformat(),
                        "version": contract.version,
                    }
                )
        contract.sent_to = sent_history

        if contract.status == ContractStatus.DRAFT:
            contract.status = ContractStatus.SENT

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor_contract.send",
        resource_type="sponsor_contract",
        resource_id=contract.id,
        details={
            "sponsor_id": str(sponsor_id),
            "recipients": recipients,
            "sent_count": sent_count,
            "failed": failed,
            "version": contract.version,
            "send_as_pdf": body.send_as_pdf,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return SponsorContractSendResponse(sent_count=sent_count, failed=failed)


@router.delete("")
async def delete_contract(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete the contract and all its versions."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    filename = contract.filename

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor_contract.delete",
        resource_type="sponsor_contract",
        resource_id=contract.id,
        details={"sponsor_id": str(sponsor_id), "filename": filename},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(contract)
    await db.commit()

    return {"message": f"Contract '{filename}' deleted successfully"}


# ---------------------------------------------------------------------------
# Version history endpoints
# ---------------------------------------------------------------------------


@router.get("/versions", response_model=list[SponsorContractVersionResponse])
async def list_versions(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[SponsorContractVersionResponse]:
    """List all version snapshots for a contract."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    result = await db.execute(
        select(SponsorContractVersion)
        .where(SponsorContractVersion.contract_id == contract.id)
        .order_by(SponsorContractVersion.version.desc())
    )
    versions = result.scalars().all()

    return [
        SponsorContractVersionResponse(
            id=v.id,
            version=v.version,
            filename=v.filename,
            content_type=v.content_type,
            file_size=v.file_size,
            html_content=v.html_content,
            created_by=v.created_by,
            created_at=v.created_at,
        )
        for v in versions
    ]


@router.get("/versions/{version_number}", response_model=SponsorContractVersionResponse)
async def get_version(
    conference_id: UUID,
    sponsor_id: UUID,
    version_number: int,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SponsorContractVersionResponse:
    """Get a specific version's content."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    result = await db.execute(
        select(SponsorContractVersion).where(
            SponsorContractVersion.contract_id == contract.id,
            SponsorContractVersion.version == version_number,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise NotFoundError(f"Version {version_number} not found")

    return SponsorContractVersionResponse(
        id=version.id,
        version=version.version,
        filename=version.filename,
        content_type=version.content_type,
        file_size=version.file_size,
        html_content=version.html_content,
        created_by=version.created_by,
        created_at=version.created_at,
    )


@router.get("/versions/{version_number}/download")
async def download_version(
    conference_id: UUID,
    sponsor_id: UUID,
    version_number: int,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> Response:
    """Download a specific version's file."""
    await _get_sponsor(db, conference_id, sponsor_id, current_user.tenant_id)
    contract = await _get_contract(db, sponsor_id)

    result = await db.execute(
        select(SponsorContractVersion).where(
            SponsorContractVersion.contract_id == contract.id,
            SponsorContractVersion.version == version_number,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise NotFoundError(f"Version {version_number} not found")

    # For HTML versions, generate a Word document
    if version.html_content:
        docx_bytes = _generate_docx_from_html(version.html_content)
        docx_filename = f"{version.filename}.docx"
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": safe_content_disposition(docx_filename),
                "Content-Length": str(len(docx_bytes)),
            },
        )

    if not version.file_data:
        raise NotFoundError("No file data available for this version")

    return Response(
        content=version.file_data,
        media_type=version.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(version.filename),
            "Content-Length": str(version.file_size),
        },
    )
