"""Training language CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.models.training import TrainingLanguage
from app.schemas.training import (
    TrainingLanguageCreate,
    TrainingLanguageListResponse,
    TrainingLanguageResponse,
    TrainingLanguageUpdate,
)

from ._shared import MODULE_CODE

router = APIRouter()


@router.get(
    "/languages",
    response_model=TrainingLanguageListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_languages(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> TrainingLanguageListResponse:
    """List all training languages for the current tenant."""
    query = (
        select(TrainingLanguage)
        .where(TrainingLanguage.tenant_id == current_user.tenant_id)
        .order_by(TrainingLanguage.name)
    )
    result = await db.execute(query)
    languages = list(result.scalars().all())

    items = [
        TrainingLanguageResponse(
            id=lang.id,
            tenant_id=lang.tenant_id,
            name=lang.name,
            created_at=lang.created_at,
            updated_at=lang.updated_at,
        )
        for lang in languages
    ]

    return TrainingLanguageListResponse(items=items, total=len(items))


@router.post(
    "/languages",
    response_model=TrainingLanguageResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_language(
    lang_data: TrainingLanguageCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TrainingLanguageResponse:
    """Create a new training language."""
    lang = TrainingLanguage(
        tenant_id=current_user.tenant_id,
        name=lang_data.name,
    )
    db.add(lang)
    await db.commit()
    await db.refresh(lang)

    return TrainingLanguageResponse(
        id=lang.id,
        tenant_id=lang.tenant_id,
        name=lang.name,
        created_at=lang.created_at,
        updated_at=lang.updated_at,
    )


@router.put(
    "/languages/{language_id}",
    response_model=TrainingLanguageResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_language(
    language_id: UUID,
    lang_data: TrainingLanguageUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TrainingLanguageResponse:
    """Update a training language."""
    result = await db.execute(
        select(TrainingLanguage).where(
            TrainingLanguage.id == language_id,
            TrainingLanguage.tenant_id == current_user.tenant_id,
        )
    )
    lang = result.scalar_one_or_none()

    if not lang:
        raise NotFoundError(f"Language with ID '{language_id}' not found")

    update_data = lang_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(lang, field, value)

    await db.commit()
    await db.refresh(lang)

    return TrainingLanguageResponse(
        id=lang.id,
        tenant_id=lang.tenant_id,
        name=lang.name,
        created_at=lang.created_at,
        updated_at=lang.updated_at,
    )


@router.delete("/languages/{language_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_language(
    language_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a training language."""
    result = await db.execute(
        select(TrainingLanguage).where(
            TrainingLanguage.id == language_id,
            TrainingLanguage.tenant_id == current_user.tenant_id,
        )
    )
    lang = result.scalar_one_or_none()

    if not lang:
        raise NotFoundError(f"Language with ID '{language_id}' not found")

    await db.delete(lang)
    await db.commit()

    return {"message": f"Language '{lang.name}' deleted successfully"}
