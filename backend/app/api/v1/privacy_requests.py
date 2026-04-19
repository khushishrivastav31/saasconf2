"""Privacy request admin endpoints (GDPR Art. 15 / 17 — Phase 2).

Tenant-admin self-serve path for data-subject requests:

* list / filter existing requests
* create new export or erasure requests
* approve erasure (Phase 2 terminal state — actual deletion is Phase 3)
* reject either type with a required reason
* generate the export ZIP on demand (rate-limited)
* download the previously-generated export for up to 7 days

All endpoints are ``TenantAdminDep``-gated and filter by
``current_user.tenant_id`` alongside the RLS policy as belt-and-braces
defence.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import calculate_pages, paginate
from app.core.rate_limiter import tenant_limiter
from app.core.security.pii_crypto import hash_email
from app.models.audit import AuditAction
from app.models.privacy_request import (
    PrivacyRequest,
    PrivacyRequestStatus,
    PrivacyRequestType,
)
from app.schemas.privacy_request import (
    GenerateExportResponse,
    PrivacyRequestCreate,
    PrivacyRequestListItem,
    PrivacyRequestReject,
    PrivacyRequestResponse,
)
from app.services.base import BaseService
from scripts.export_subject_data import build_export

router = APIRouter()

DOWNLOAD_WINDOW_DAYS = 7


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_tenant(current_user: Any) -> UUID:
    """Return ``current_user.tenant_id`` or raise if the user lacks one."""
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")
    return current_user.tenant_id


def _to_response(pr: PrivacyRequest) -> PrivacyRequestResponse:
    """Build a ``PrivacyRequestResponse`` (includes decrypted subject emails)."""
    return PrivacyRequestResponse(
        id=pr.id,
        tenant_id=pr.tenant_id,
        request_type=PrivacyRequestType(pr.request_type),
        subject_emails=pr.subject_emails,
        status=PrivacyRequestStatus(pr.status),
        created_by=pr.created_by,
        portal_user_id=pr.portal_user_id,
        created_at=pr.created_at,
        reviewed_by=pr.reviewed_by,
        reviewed_at=pr.reviewed_at,
        executed_at=pr.executed_at,
        completion_artifact_url=pr.completion_artifact_url,
        execution_manifest=pr.execution_manifest,
        rejection_reason=pr.rejection_reason,
        notes=pr.notes,
    )


def _to_list_item(pr: PrivacyRequest) -> PrivacyRequestListItem:
    """Build a lightweight list-view row (no decrypt)."""
    return PrivacyRequestListItem(
        id=pr.id,
        tenant_id=pr.tenant_id,
        request_type=PrivacyRequestType(pr.request_type),
        subject_count=len(pr.subject_email_hashes or []),
        status=PrivacyRequestStatus(pr.status),
        created_by=pr.created_by,
        created_at=pr.created_at,
        reviewed_by=pr.reviewed_by,
        reviewed_at=pr.reviewed_at,
        executed_at=pr.executed_at,
    )


async def _load_for_tenant(
    db: Any,
    request_id: UUID,
    tenant_id: UUID,
) -> PrivacyRequest:
    """Fetch a privacy request scoped to *tenant_id* or raise 404."""
    result = await db.execute(
        select(PrivacyRequest).where(
            PrivacyRequest.id == request_id,
            PrivacyRequest.tenant_id == tenant_id,
        )
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise NotFoundError("Privacy request not found")
    return pr


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("")
async def list_privacy_requests(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    status: PrivacyRequestStatus | None = Query(None),
    request_type: PrivacyRequestType | None = Query(None),
    q: str | None = Query(None, description="Plaintext email to match against subject_email_hashes."),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Paginated list of privacy requests for the current tenant."""
    tenant_id = _require_tenant(current_user)

    query = (
        select(PrivacyRequest).where(PrivacyRequest.tenant_id == tenant_id).order_by(desc(PrivacyRequest.created_at))
    )
    if status is not None:
        query = query.where(PrivacyRequest.status == status.value)
    if request_type is not None:
        query = query.where(PrivacyRequest.request_type == request_type.value)
    if q:
        query = query.where(PrivacyRequest.subject_email_hashes.contains([hash_email(q)]))

    result = await paginate(db, query, page=page, page_size=page_size)
    items = [_to_list_item(row) for row in result.items]
    return {
        "items": [item.model_dump(mode="json") for item in items],
        "total": result.total,
        "page": page,
        "page_size": page_size,
        "pages": calculate_pages(result.total, page_size),
    }


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post("", response_model=PrivacyRequestResponse, status_code=201)
async def create_privacy_request(
    payload: PrivacyRequestCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PrivacyRequestResponse:
    """Log a new privacy request. Defaults status to ``pending_review``."""
    tenant_id = _require_tenant(current_user)

    pr = PrivacyRequest(
        tenant_id=tenant_id,
        request_type=payload.request_type.value,
        created_by=current_user.user_id,
        notes=payload.notes,
    )
    pr.subject_emails = list(payload.subject_emails)
    db.add(pr)
    await db.flush()

    first_hash = pr.subject_email_hashes[0] if pr.subject_email_hashes else None
    db.add(
        BaseService.create_audit_log(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PRIVACY_REQUEST_CREATE,
            resource_type="privacy_request",
            resource_id=pr.id,
            details={
                "request_type": pr.request_type,
                "subject_count": len(pr.subject_email_hashes or []),
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
            subject_email_hash=first_hash,
        )
    )
    await db.commit()
    await db.refresh(pr)
    return _to_response(pr)


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


@router.get("/{request_id}", response_model=PrivacyRequestResponse)
async def get_privacy_request(
    request_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PrivacyRequestResponse:
    """Fetch a single privacy request. Emits a ``PRIVACY_REQUEST_VIEW`` audit row."""
    tenant_id = _require_tenant(current_user)
    pr = await _load_for_tenant(db, request_id, tenant_id)

    first_hash = pr.subject_email_hashes[0] if pr.subject_email_hashes else None
    db.add(
        BaseService.create_audit_log(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PRIVACY_REQUEST_VIEW,
            resource_type="privacy_request",
            resource_id=pr.id,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
            subject_email_hash=first_hash,
        )
    )
    await db.commit()
    return _to_response(pr)


# ---------------------------------------------------------------------------
# Approve (erasure only, Phase 2 terminal state)
# ---------------------------------------------------------------------------


@router.post("/{request_id}/approve", response_model=PrivacyRequestResponse)
async def approve_privacy_request(
    request_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PrivacyRequestResponse:
    """Approve an erasure request. Export requests use ``/generate-export`` instead."""
    tenant_id = _require_tenant(current_user)
    pr = await _load_for_tenant(db, request_id, tenant_id)

    if pr.request_type != PrivacyRequestType.ERASURE.value:
        raise ValidationError("Only erasure requests can be approved. Use /generate-export for exports.")
    if pr.status != PrivacyRequestStatus.PENDING_REVIEW.value:
        raise ValidationError(f"Cannot approve request in status '{pr.status}'")

    pr.status = PrivacyRequestStatus.APPROVED.value
    pr.reviewed_by = current_user.user_id
    pr.reviewed_at = datetime.now(UTC)

    first_hash = pr.subject_email_hashes[0] if pr.subject_email_hashes else None
    db.add(
        BaseService.create_audit_log(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PRIVACY_REQUEST_APPROVE,
            resource_type="privacy_request",
            resource_id=pr.id,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
            subject_email_hash=first_hash,
        )
    )
    await db.commit()
    await db.refresh(pr)
    return _to_response(pr)


# ---------------------------------------------------------------------------
# Reject (either type)
# ---------------------------------------------------------------------------


@router.post("/{request_id}/reject", response_model=PrivacyRequestResponse)
async def reject_privacy_request(
    request_id: UUID,
    payload: PrivacyRequestReject,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PrivacyRequestResponse:
    """Reject a privacy request with a mandatory reason."""
    tenant_id = _require_tenant(current_user)
    pr = await _load_for_tenant(db, request_id, tenant_id)

    if pr.status != PrivacyRequestStatus.PENDING_REVIEW.value:
        raise ValidationError(f"Cannot reject request in status '{pr.status}'")

    pr.status = PrivacyRequestStatus.REJECTED.value
    pr.reviewed_by = current_user.user_id
    pr.reviewed_at = datetime.now(UTC)
    pr.rejection_reason = payload.rejection_reason

    first_hash = pr.subject_email_hashes[0] if pr.subject_email_hashes else None
    db.add(
        BaseService.create_audit_log(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PRIVACY_REQUEST_REJECT,
            resource_type="privacy_request",
            resource_id=pr.id,
            details={"rejection_reason_length": len(payload.rejection_reason)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
            subject_email_hash=first_hash,
        )
    )
    await db.commit()
    await db.refresh(pr)
    return _to_response(pr)


# ---------------------------------------------------------------------------
# Generate export (export type only, rate-limited)
# ---------------------------------------------------------------------------


@router.post("/{request_id}/generate-export", response_model=GenerateExportResponse)
@tenant_limiter.limit("10/hour")
async def generate_privacy_export(
    request: Request,
    request_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> GenerateExportResponse:
    """Build the Art. 15 export ZIP and mark the request ``completed``.

    The ZIP bytes are not persisted — ``/download`` re-runs
    :func:`build_export` when the admin clicks through. We only store the
    manifest + the relative download path.
    """
    tenant_id = _require_tenant(current_user)
    pr = await _load_for_tenant(db, request_id, tenant_id)

    if pr.request_type != PrivacyRequestType.EXPORT.value:
        raise ValidationError("Only export requests can be exported.")
    if pr.status not in (
        PrivacyRequestStatus.PENDING_REVIEW.value,
        PrivacyRequestStatus.APPROVED.value,
    ):
        raise ValidationError(f"Cannot generate export in status '{pr.status}'")

    emails = pr.subject_emails
    if not emails:
        raise ValidationError("Privacy request has no subject emails on file.")

    _blob, manifest = await build_export(db, tenant_id, emails)

    now = datetime.now(UTC)
    pr.status = PrivacyRequestStatus.COMPLETED.value
    pr.reviewed_by = pr.reviewed_by or current_user.user_id
    pr.reviewed_at = pr.reviewed_at or now
    pr.executed_at = now
    pr.execution_manifest = manifest
    pr.completion_artifact_url = f"/api/v1/privacy-requests/{pr.id}/download"

    first_hash = pr.subject_email_hashes[0] if pr.subject_email_hashes else None
    db.add(
        BaseService.create_audit_log(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PRIVACY_REQUEST_EXECUTE,
            resource_type="privacy_request",
            resource_id=pr.id,
            details={"record_counts": manifest.get("record_counts", {})},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
            subject_email_hash=first_hash,
        )
    )
    await db.commit()
    await db.refresh(pr)

    return GenerateExportResponse(
        download_url=pr.completion_artifact_url or "",
        record_counts=manifest.get("record_counts", {}),
        executed_at=now,
    )


# ---------------------------------------------------------------------------
# Download (streams ZIP; 7-day window enforced by executed_at)
# ---------------------------------------------------------------------------


@router.get("/{request_id}/download")
async def download_privacy_export(
    request_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> StreamingResponse:
    """Stream the Art. 15 export ZIP. Returns 410 after the 7-day window."""
    tenant_id = _require_tenant(current_user)
    pr = await _load_for_tenant(db, request_id, tenant_id)

    if pr.request_type != PrivacyRequestType.EXPORT.value:
        raise ValidationError("Only export requests expose a download link.")
    if pr.status != PrivacyRequestStatus.COMPLETED.value:
        raise ValidationError(f"Export is not available to download in status '{pr.status}'")
    if pr.executed_at is None:
        raise ValidationError("Export has no executed_at timestamp; regenerate it.")

    executed_at = pr.executed_at
    if executed_at.tzinfo is None:
        executed_at = executed_at.replace(tzinfo=UTC)
    if datetime.now(UTC) - executed_at > timedelta(days=DOWNLOAD_WINDOW_DAYS):
        # HTTPException with 410 Gone — forces a fresh regenerate.
        from fastapi import HTTPException

        raise HTTPException(status_code=410, detail="Download window expired. Please regenerate the export.")

    emails = pr.subject_emails
    blob, _manifest = await build_export(db, tenant_id, emails)

    first_hash = pr.subject_email_hashes[0] if pr.subject_email_hashes else None
    db.add(
        BaseService.create_audit_log(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PRIVACY_REQUEST_EXPORT_DOWNLOAD,
            resource_type="privacy_request",
            resource_id=pr.id,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
            subject_email_hash=first_hash,
        )
    )
    await db.commit()

    filename = f"privacy-request-{pr.id}.zip"

    def _iter() -> Any:
        yield blob

    return StreamingResponse(
        _iter(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
