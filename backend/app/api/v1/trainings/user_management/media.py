"""Training portal users — profile picture + video upload/delete."""

from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, TenantAdminDep

from ._helpers import get_portal_user

router = APIRouter(prefix="/users", tags=["training-users"])


@router.post("/{user_id}/picture")
async def upload_portal_user_picture(
    user_id: UUID,
    file: UploadFile = File(...),
    *,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Upload or replace portal user picture."""
    from app.core.file_validation import validate_upload
    from app.models.attachment import Attachment

    user = await get_portal_user(db, user_id, current_user.tenant_id)
    file_data = await file.read()

    if not file_data:
        raise HTTPException(status_code=422, detail="Empty file")
    if len(file_data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="File too large (max 5MB)")

    content_type = validate_upload(file_data, file.content_type or "", "portal_user_picture")

    existing = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "portal_user_picture",
            Attachment.entity_id == user.id,
            Attachment.tenant_id == current_user.tenant_id,
        )
    )
    old = existing.scalar_one_or_none()
    if old:
        old.file_data = file_data
        old.filename = file.filename or "picture"
        old.content_type = content_type
        old.file_size = len(file_data)
    else:
        db.add(
            Attachment(
                tenant_id=current_user.tenant_id,
                entity_type="portal_user_picture",
                entity_id=user.id,
                filename=file.filename or "picture",
                content_type=content_type,
                file_size=len(file_data),
                file_data=file_data,
                uploaded_by=current_user.user_id,
            )
        )

    await db.commit()
    return {"message": "Picture uploaded"}


@router.delete("/{user_id}/picture")
async def delete_portal_user_picture(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete portal user picture."""
    from app.models.attachment import Attachment

    user = await get_portal_user(db, user_id, current_user.tenant_id)
    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "portal_user_picture",
            Attachment.entity_id == user.id,
            Attachment.tenant_id == current_user.tenant_id,
        )
    )
    att = result.scalar_one_or_none()
    if att:
        await db.delete(att)
        await db.commit()
    return {"message": "Picture deleted"}


@router.post("/{user_id}/video")
async def upload_portal_user_video(
    user_id: UUID,
    file: UploadFile = File(...),
    *,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Upload or replace portal user video."""
    from app.core.file_validation import validate_upload
    from app.models.attachment import Attachment

    user = await get_portal_user(db, user_id, current_user.tenant_id)
    file_data = await file.read()

    if not file_data:
        raise HTTPException(status_code=422, detail="Empty file")
    if len(file_data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="File too large (max 50MB)")

    content_type = validate_upload(file_data, file.content_type or "", "portal_user_video")

    existing = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "portal_user_video",
            Attachment.entity_id == user.id,
            Attachment.tenant_id == current_user.tenant_id,
        )
    )
    old = existing.scalar_one_or_none()
    if old:
        old.file_data = file_data
        old.filename = file.filename or "video"
        old.content_type = content_type
        old.file_size = len(file_data)
    else:
        db.add(
            Attachment(
                tenant_id=current_user.tenant_id,
                entity_type="portal_user_video",
                entity_id=user.id,
                filename=file.filename or "video",
                content_type=content_type,
                file_size=len(file_data),
                file_data=file_data,
                uploaded_by=current_user.user_id,
            )
        )

    await db.commit()
    return {"message": "Video uploaded"}


@router.delete("/{user_id}/video")
async def delete_portal_user_video(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete portal user video."""
    from app.models.attachment import Attachment

    user = await get_portal_user(db, user_id, current_user.tenant_id)
    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "portal_user_video",
            Attachment.entity_id == user.id,
            Attachment.tenant_id == current_user.tenant_id,
        )
    )
    att = result.scalar_one_or_none()
    if att:
        await db.delete(att)
        await db.commit()
    return {"message": "Video deleted"}
