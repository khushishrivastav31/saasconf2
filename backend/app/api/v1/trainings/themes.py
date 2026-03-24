"""Training theme CRUD endpoints."""

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
from app.models.training import TrainingTheme
from app.schemas.training import (
    TrainingThemeCreate,
    TrainingThemeListResponse,
    TrainingThemeResponse,
    TrainingThemeUpdate,
)

from ._shared import MODULE_CODE

router = APIRouter()


def _theme_response(t: TrainingTheme) -> TrainingThemeResponse:
    return TrainingThemeResponse(
        id=t.id,
        tenant_id=t.tenant_id,
        name=t.name,
        description=t.description,
        language_id=t.language_id,
        language_name=t.language.name if t.language else None,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.get("/themes", response_model=TrainingThemeListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_themes(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> TrainingThemeListResponse:
    """List all training themes for the current tenant."""
    query = select(TrainingTheme).where(TrainingTheme.tenant_id == current_user.tenant_id).order_by(TrainingTheme.name)
    result = await db.execute(query)
    themes = list(result.unique().scalars().all())

    return TrainingThemeListResponse(items=[_theme_response(t) for t in themes], total=len(themes))


@router.post(
    "/themes",
    response_model=TrainingThemeResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_theme(
    theme_data: TrainingThemeCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TrainingThemeResponse:
    """Create a new training theme."""
    theme = TrainingTheme(
        tenant_id=current_user.tenant_id,
        name=theme_data.name,
        description=theme_data.description,
        language_id=theme_data.language_id,
    )
    db.add(theme)
    await db.commit()
    await db.refresh(theme)

    return _theme_response(theme)


@router.put(
    "/themes/{theme_id}",
    response_model=TrainingThemeResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_theme(
    theme_id: UUID,
    theme_data: TrainingThemeUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TrainingThemeResponse:
    """Update a training theme."""
    result = await db.execute(
        select(TrainingTheme).where(
            TrainingTheme.id == theme_id,
            TrainingTheme.tenant_id == current_user.tenant_id,
        )
    )
    theme = result.unique().scalar_one_or_none()

    if not theme:
        raise NotFoundError(f"Theme with ID '{theme_id}' not found")

    update_data = theme_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(theme, field, value)

    await db.commit()
    await db.refresh(theme)

    return _theme_response(theme)


@router.delete("/themes/{theme_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_theme(
    theme_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a training theme."""
    result = await db.execute(
        select(TrainingTheme).where(
            TrainingTheme.id == theme_id,
            TrainingTheme.tenant_id == current_user.tenant_id,
        )
    )
    theme = result.unique().scalar_one_or_none()

    if not theme:
        raise NotFoundError(f"Theme with ID '{theme_id}' not found")

    await db.delete(theme)
    await db.commit()

    return {"message": f"Theme '{theme.name}' deleted successfully"}
