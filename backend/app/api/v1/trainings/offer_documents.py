"""Offer document management endpoints (nested under offers)."""

import base64
import re
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.api.v1.sponsor_contracts import _convert_to_html, _generate_docx_from_html, _generate_pdf_from_html
from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.email import send_email
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, validate_upload
from app.core.html_sanitize import sanitize_html
from app.core.rate_limiter import limiter
from app.core.security.pii_crypto import read_pii
from app.models.audit import AuditLog
from app.models.customer_offer import CustomerOffer
from app.models.offer_document import OfferDocument, OfferDocumentVersion
from app.models.user import User
from app.schemas.offer_document import (
    OfferDocumentResponse,
    OfferDocumentSendRequest,
    OfferDocumentSendResponse,
    OfferDocumentUpdateContent,
    OfferDocumentVersionResponse,
)

router = APIRouter(prefix="/offers/{offer_id}/documents", tags=["offer-documents"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sanitize_for_filename(text: str) -> str:
    """Sanitize a string for use in a filename."""
    text = re.sub(r"[^\w\s\-]", "", text)
    text = re.sub(r"\s+", "-", text.strip())
    return text or "unknown"


def _generate_document_filename(customer_name: str, user_first: str, user_last: str) -> str:
    """Generate document filename: YYYYMMDD_CustomerName_UserInitials."""
    date_str = datetime.now(UTC).strftime("%Y%m%d")
    customer_part = _sanitize_for_filename(customer_name)
    initials = (user_first[:1] + user_last[:1]).upper() if user_first and user_last else "XX"
    return f"{date_str}_{customer_part}_{initials}"


async def _get_offer(db: DbSessionDep, offer_id: UUID, tenant_id: UUID) -> CustomerOffer:
    """Fetch offer with customer loaded, or raise 404."""
    result = await db.execute(
        select(CustomerOffer)
        .options(joinedload(CustomerOffer.customer))
        .where(CustomerOffer.id == offer_id, CustomerOffer.tenant_id == tenant_id)
    )
    offer = result.unique().scalar_one_or_none()
    if not offer:
        raise NotFoundError(f"Offer '{offer_id}' not found")
    return offer


async def _get_document(db: DbSessionDep, doc_id: UUID, offer_id: UUID) -> OfferDocument:
    """Fetch a document for the given offer, or raise 404."""
    result = await db.execute(
        select(OfferDocument).where(OfferDocument.id == doc_id, OfferDocument.offer_id == offer_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError(f"Document '{doc_id}' not found")
    return doc


def _build_document_response(doc: OfferDocument, version_count: int = 0) -> OfferDocumentResponse:
    """Build response from model."""
    return OfferDocumentResponse(
        id=doc.id,
        offer_id=doc.offer_id,
        filename=doc.filename,
        content_type=doc.content_type,
        file_size=doc.file_size,
        html_content=doc.html_content,
        is_editable=doc.is_editable,
        version=doc.version,
        version_count=version_count,
        status=doc.status,
        last_sent_at=doc.last_sent_at,
        sent_to=doc.sent_to,
        created_by=doc.created_by,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


async def _snapshot_version(db: DbSessionDep, doc: OfferDocument) -> None:
    """Save the current document state as a version snapshot."""
    version = OfferDocumentVersion(
        document_id=doc.id,
        version=doc.version,
        html_content=doc.html_content,
        file_data=doc.file_data,
        content_type=doc.content_type,
        file_size=doc.file_size,
        filename=doc.filename,
        created_by=doc.created_by,
    )
    db.add(version)


async def _count_versions(db: DbSessionDep, document_id: UUID) -> int:
    """Count version snapshots for a document."""
    result = await db.execute(select(func.count()).where(OfferDocumentVersion.document_id == document_id))
    return result.scalar_one()


async def _get_user(db: DbSessionDep, user_id: UUID) -> User:
    """Fetch user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError(f"User '{user_id}' not found")
    return user


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=OfferDocumentResponse, status_code=201)
async def create_document(
    offer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    template_id: UUID | None = None,
    file: UploadFile | None = None,
) -> OfferDocumentResponse:
    """Create a new document from an offer template or uploaded file."""
    offer = await _get_offer(db, offer_id, current_user.tenant_id)

    if template_id:
        # Fetch template attachment
        from app.models.attachment import Attachment
        from app.models.offer_template import OfferTemplate

        tmpl = (
            await db.execute(
                select(OfferTemplate).where(
                    OfferTemplate.id == template_id,
                    OfferTemplate.tenant_id == current_user.tenant_id,
                )
            )
        ).scalar_one_or_none()
        if not tmpl:
            raise NotFoundError("Offer template not found")

        attachment = (
            await db.execute(
                select(Attachment).where(
                    Attachment.entity_type == "offer_template",
                    Attachment.entity_id == template_id,
                )
            )
        ).scalar_one_or_none()
        if not attachment or not attachment.file_data:
            raise ValidationError("Template has no file uploaded")

        file_data = attachment.file_data
        content_type = attachment.content_type or "application/octet-stream"
    elif file:
        file_data = await file.read()
        if not file_data:
            raise ValidationError("Uploaded file is empty")
        content_type = file.content_type or "application/octet-stream"
        validate_upload(file_data, content_type, "offer_document")
    else:
        raise ValidationError("Either template_id or file is required")

    # Fetch user for initials
    user = await _get_user(db, current_user.user_id)

    # Generate filename
    customer_name = offer.customer.name if offer.customer else "Unknown"
    base_filename = _generate_document_filename(customer_name, user.first_name or "", user.last_name or "")

    # Convert to HTML
    html_content = _convert_to_html(file_data, content_type)
    is_editable = html_content is not None

    # Sanitize HTML if present
    if html_content:
        html_content = sanitize_html(html_content)

    doc = OfferDocument(
        tenant_id=current_user.tenant_id,
        offer_id=offer_id,
        filename=base_filename,
        content_type=content_type,
        file_data=file_data,
        file_size=len(file_data),
        html_content=html_content,
        is_editable=is_editable,
        version=1,
        status="draft",
        created_by=current_user.user_id,
    )
    db.add(doc)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="offer_document.create",
        resource_type="offer_document",
        resource_id=doc.id,
        details={
            "offer_id": str(offer_id),
            "filename": base_filename,
            "content_type": content_type,
            "file_size": len(file_data),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(doc)

    return _build_document_response(doc, 0)


@router.get("", response_model=list[OfferDocumentResponse])
async def list_documents(
    offer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[OfferDocumentResponse]:
    """List all documents for an offer (without html_content for performance)."""
    await _get_offer(db, offer_id, current_user.tenant_id)

    result = await db.execute(
        select(OfferDocument)
        .where(OfferDocument.offer_id == offer_id, OfferDocument.tenant_id == current_user.tenant_id)
        .order_by(OfferDocument.created_at.desc())
    )
    docs = list(result.scalars().all())

    # Batch-load version counts to avoid N+1 queries
    version_counts: dict[UUID, int] = {}
    if docs:
        doc_ids = [d.id for d in docs]
        vc_result = await db.execute(
            select(OfferDocumentVersion.document_id, func.count())
            .where(OfferDocumentVersion.document_id.in_(doc_ids))
            .group_by(OfferDocumentVersion.document_id)
        )
        version_counts = {did: cnt for did, cnt in vc_result.all()}

    responses: list[OfferDocumentResponse] = []
    for doc in docs:
        resp = _build_document_response(doc, version_counts.get(doc.id, 0))
        resp.html_content = None  # Omit for list performance
        responses.append(resp)

    return responses


@router.get("/{doc_id}", response_model=OfferDocumentResponse)
async def get_document(
    offer_id: UUID,
    doc_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> OfferDocumentResponse:
    """Get a single document with full content."""
    await _get_offer(db, offer_id, current_user.tenant_id)
    doc = await _get_document(db, doc_id, offer_id)
    vc = await _count_versions(db, doc.id)
    return _build_document_response(doc, vc)


@router.put("/{doc_id}/content", response_model=OfferDocumentResponse)
async def save_document_content(
    offer_id: UUID,
    doc_id: UUID,
    body: OfferDocumentUpdateContent,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> OfferDocumentResponse:
    """Save edited HTML content (creates a new version)."""
    await _get_offer(db, offer_id, current_user.tenant_id)
    doc = await _get_document(db, doc_id, offer_id)

    if not doc.is_editable:
        raise ValidationError("This document is not editable (PDF)")

    # Snapshot current version
    await _snapshot_version(db, doc)

    # Update content
    doc.html_content = sanitize_html(body.html_content)
    doc.version += 1
    doc.created_by = current_user.user_id

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="offer_document.edit",
        resource_type="offer_document",
        resource_id=doc.id,
        details={"offer_id": str(offer_id), "version": doc.version},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(doc)

    vc = await _count_versions(db, doc.id)
    return _build_document_response(doc, vc)


@router.get("/{doc_id}/download")
async def download_document(
    offer_id: UUID,
    doc_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> Response:
    """Download the current document (DOCX for editable, original for PDF)."""
    await _get_offer(db, offer_id, current_user.tenant_id)
    doc = await _get_document(db, doc_id, offer_id)

    # For editable documents, generate a Word document from the current HTML
    if doc.is_editable and doc.html_content:
        docx_bytes = _generate_docx_from_html(doc.html_content)
        docx_filename = f"{doc.filename}.docx"
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": safe_content_disposition(docx_filename),
                "Content-Length": str(len(docx_bytes)),
            },
        )

    if not doc.file_data:
        raise NotFoundError("No file data available for this document")

    ext = ".pdf" if doc.content_type == "application/pdf" else ""
    filename = f"{doc.filename}{ext}" if ext else doc.filename
    return Response(
        content=doc.file_data,
        media_type=doc.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": safe_content_disposition(filename),
            "Content-Length": str(doc.file_size or len(doc.file_data)),
        },
    )


@router.get("/{doc_id}/pdf")
async def download_document_pdf(
    offer_id: UUID,
    doc_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> Response:
    """Generate and download a PDF from the current HTML content."""
    await _get_offer(db, offer_id, current_user.tenant_id)
    doc = await _get_document(db, doc_id, offer_id)

    if not doc.html_content:
        raise ValidationError("Cannot generate PDF: no HTML content available (PDF-only document)")

    pdf_bytes = _generate_pdf_from_html(doc.html_content)
    pdf_filename = f"{doc.filename}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": safe_content_disposition(pdf_filename),
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.post("/{doc_id}/send", response_model=OfferDocumentSendResponse)
@limiter.limit("5/minute")
async def send_document(
    offer_id: UUID,
    doc_id: UUID,
    body: OfferDocumentSendRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> OfferDocumentSendResponse:
    """Send the document via email to specified recipients."""
    await _get_offer(db, offer_id, current_user.tenant_id)
    doc = await _get_document(db, doc_id, offer_id)

    recipients: list[str] = list(body.recipient_emails)
    if not recipients:
        raise ValidationError("No recipients specified")

    # Build PDF attachment
    email_attachments: list[dict] | None = None

    if doc.content_type == "application/pdf" and doc.file_data:
        email_attachments = [
            {
                "filename": f"{doc.filename}.pdf",
                "content": base64.b64encode(doc.file_data).decode("ascii"),
            }
        ]
    elif body.send_as_pdf and doc.html_content:
        pdf_bytes = _generate_pdf_from_html(doc.html_content)
        email_attachments = [
            {
                "filename": f"{doc.filename}.pdf",
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
            }
        ]

    # Fetch user for email (CC)
    user = await _get_user(db, current_user.user_id)

    # Send to each recipient
    sent_count = 0
    failed: list[str] = []
    now = datetime.now(UTC)
    sender_email = read_pii(user, "email") or ""

    for recipient in recipients:
        success = await send_email(
            to=recipient,
            subject=body.subject,
            html=body.body_html,
            reply_to=sender_email,
            attachments=email_attachments,
            db=db,
            tenant_id=current_user.tenant_id,
            email_type="offer_document",
        )
        if success:
            sent_count += 1
        else:
            failed.append(recipient)

    # Send CC to current user
    if sent_count > 0 and sender_email:
        await send_email(
            to=sender_email,
            subject=f"[CC] {body.subject}",
            html=body.body_html,
            attachments=email_attachments,
            db=db,
            tenant_id=current_user.tenant_id,
            email_type="offer_document",
        )

    # Update document tracking
    if sent_count > 0:
        await _snapshot_version(db, doc)

        doc.last_sent_at = now
        sent_history = list(doc.sent_to or [])
        for recipient in recipients:
            if recipient not in failed:
                sent_history.append(
                    {
                        "email": recipient,
                        "sent_at": now.isoformat(),
                        "version": doc.version,
                    }
                )
        doc.sent_to = sent_history

        if doc.status == "draft":
            doc.status = "sent"

        # Also update the parent offer status to "sent" if it's still draft
        offer = await _get_offer(db, offer_id, current_user.tenant_id)
        if offer.status == "draft":
            offer.status = "sent"

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="offer_document.send",
        resource_type="offer_document",
        resource_id=doc.id,
        details={
            "offer_id": str(offer_id),
            "recipients": recipients,
            "sent_count": sent_count,
            "failed": failed,
            "version": doc.version,
            "send_as_pdf": body.send_as_pdf,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return OfferDocumentSendResponse(sent_count=sent_count, failed=failed)


@router.delete("/{doc_id}")
async def delete_document(
    offer_id: UUID,
    doc_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a document and all its versions."""
    await _get_offer(db, offer_id, current_user.tenant_id)
    doc = await _get_document(db, doc_id, offer_id)

    filename = doc.filename

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="offer_document.delete",
        resource_type="offer_document",
        resource_id=doc.id,
        details={"offer_id": str(offer_id), "filename": filename},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(doc)
    await db.commit()

    return {"message": f"Document '{filename}' deleted successfully"}


# ---------------------------------------------------------------------------
# Version history endpoints
# ---------------------------------------------------------------------------


@router.get("/{doc_id}/versions", response_model=list[OfferDocumentVersionResponse])
async def list_versions(
    offer_id: UUID,
    doc_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[OfferDocumentVersionResponse]:
    """List all version snapshots for a document."""
    await _get_offer(db, offer_id, current_user.tenant_id)
    await _get_document(db, doc_id, offer_id)

    result = await db.execute(
        select(OfferDocumentVersion)
        .where(OfferDocumentVersion.document_id == doc_id)
        .order_by(OfferDocumentVersion.version.desc())
    )
    versions = result.scalars().all()

    return [
        OfferDocumentVersionResponse(
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


@router.get("/{doc_id}/versions/{version_number}/download")
async def download_version(
    offer_id: UUID,
    doc_id: UUID,
    version_number: int,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> Response:
    """Download a specific version's file."""
    await _get_offer(db, offer_id, current_user.tenant_id)
    await _get_document(db, doc_id, offer_id)

    result = await db.execute(
        select(OfferDocumentVersion).where(
            OfferDocumentVersion.document_id == doc_id,
            OfferDocumentVersion.version == version_number,
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
        media_type=version.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": safe_content_disposition(version.filename),
            "Content-Length": str(version.file_size or len(version.file_data)),
        },
    )
