"""Paper form schema endpoints for designing custom paper submission forms."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.associations import ConferenceCFP
from app.models.cfp import CFPPaper
from app.models.conference import Conference
from app.models.form_schema import ConferencePaperFormSchema, PaperFormField
from app.schemas.form_schema import (
    FieldReorderRequest,
    HasSubmissionsResponse,
    PaperFormFieldCreate,
    PaperFormFieldResponse,
    PaperFormFieldUpdate,
    PaperFormSchemaResponse,
    PaperFormSchemaUpdate,
)

router = APIRouter()


async def get_conference_or_404(db: DbSessionDep, conference_id: UUID, tenant_id: UUID) -> Conference:
    """Get conference by ID or raise 404."""
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")
    return conference


async def get_or_create_schema(db: DbSessionDep, conference_id: UUID, tenant_id: UUID) -> ConferencePaperFormSchema:
    """Get existing schema or create a new one with defaults."""
    result = await db.execute(
        select(ConferencePaperFormSchema)
        .options(selectinload(ConferencePaperFormSchema.fields))
        .where(
            ConferencePaperFormSchema.conference_id == conference_id,
            ConferencePaperFormSchema.tenant_id == tenant_id,
        )
    )
    schema = result.scalar_one_or_none()

    if not schema:
        # Create default schema with all builtin fields visible
        default_config = {
            "title": {"visible": True, "required": True},
            "abstract_short": {"visible": True, "required": False},
            "abstract_long": {"visible": True, "required": False},
            "level": {"visible": True, "required": False},
            "learning_objectives": {"visible": True, "required": False},
            "importance": {"visible": True, "required": False},
            "session_type": {"visible": True, "required": False},
            "topics": {"visible": True, "required": False},
        }
        schema = ConferencePaperFormSchema(
            tenant_id=tenant_id,
            conference_id=conference_id,
            builtin_fields_config=default_config,
        )
        db.add(schema)
        await db.commit()
        await db.refresh(schema)
        # Re-fetch with eager loading
        result = await db.execute(
            select(ConferencePaperFormSchema)
            .options(selectinload(ConferencePaperFormSchema.fields))
            .where(ConferencePaperFormSchema.id == schema.id)
        )
        schema = result.scalar_one()

    return schema


@router.get("", response_model=PaperFormSchemaResponse)
async def get_paper_form_schema(
    conference_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormSchemaResponse:
    """Get the paper form schema for a conference."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)

    return PaperFormSchemaResponse(
        id=schema.id,
        tenant_id=schema.tenant_id,
        conference_id=schema.conference_id,
        version=schema.version,
        builtin_fields_config=schema.builtin_fields_config,
        fields=[
            PaperFormFieldResponse(
                id=f.id,
                tenant_id=f.tenant_id,
                schema_id=f.schema_id,
                field_key=f.field_key,
                field_type=f.field_type,
                label=f.label,
                description=f.description,
                placeholder=f.placeholder,
                help_text=f.help_text,
                display_order=f.display_order,
                is_visible=f.is_visible,
                is_required=f.is_required,
                validation_rules=f.validation_rules,
                options=f.options,
                created_at=f.created_at,
                updated_at=f.updated_at,
            )
            for f in sorted(schema.fields, key=lambda x: x.display_order)
        ],
        created_at=schema.created_at,
        updated_at=schema.updated_at,
    )


@router.put("", response_model=PaperFormSchemaResponse)
async def update_paper_form_schema(
    conference_id: UUID,
    data: PaperFormSchemaUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormSchemaResponse:
    """Update the paper form schema (builtin fields config)."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)

    if data.builtin_fields_config is not None:
        # Ensure title is always required
        config = {k: v.model_dump() for k, v in data.builtin_fields_config.items()}
        if "title" in config:
            config["title"]["required"] = True
        schema.builtin_fields_config = config

    await db.commit()
    await db.refresh(schema)

    # Re-fetch with eager loading
    result = await db.execute(
        select(ConferencePaperFormSchema)
        .options(selectinload(ConferencePaperFormSchema.fields))
        .where(ConferencePaperFormSchema.id == schema.id)
    )
    schema = result.scalar_one()

    return PaperFormSchemaResponse(
        id=schema.id,
        tenant_id=schema.tenant_id,
        conference_id=schema.conference_id,
        version=schema.version,
        builtin_fields_config=schema.builtin_fields_config,
        fields=[
            PaperFormFieldResponse(
                id=f.id,
                tenant_id=f.tenant_id,
                schema_id=f.schema_id,
                field_key=f.field_key,
                field_type=f.field_type,
                label=f.label,
                description=f.description,
                placeholder=f.placeholder,
                help_text=f.help_text,
                display_order=f.display_order,
                is_visible=f.is_visible,
                is_required=f.is_required,
                validation_rules=f.validation_rules,
                options=f.options,
                created_at=f.created_at,
                updated_at=f.updated_at,
            )
            for f in sorted(schema.fields, key=lambda x: x.display_order)
        ],
        created_at=schema.created_at,
        updated_at=schema.updated_at,
    )


@router.post("/fields", response_model=PaperFormFieldResponse, status_code=201)
async def create_paper_form_field(
    conference_id: UUID,
    data: PaperFormFieldCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormFieldResponse:
    """Add a custom field to the paper form schema."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)

    # Check for duplicate field_key
    result = await db.execute(
        select(PaperFormField).where(
            PaperFormField.schema_id == schema.id,
            PaperFormField.field_key == data.field_key,
        )
    )
    if result.scalar_one_or_none():
        raise ValidationError(f"Field with key '{data.field_key}' already exists")

    # Validate options for dropdown/checkbox_group
    if data.field_type in ["dropdown", "checkbox_group"]:
        if not data.options or len(data.options) == 0:
            raise ValidationError(f"Field type '{data.field_type}' requires at least one option")

    field = PaperFormField(
        tenant_id=tenant_id,
        schema_id=schema.id,
        field_key=data.field_key,
        field_type=data.field_type.value,
        label=data.label,
        description=data.description,
        placeholder=data.placeholder,
        help_text=data.help_text,
        display_order=data.display_order,
        is_visible=data.is_visible,
        is_required=data.is_required,
        validation_rules=data.validation_rules.model_dump() if data.validation_rules else None,
        options=[opt.model_dump() for opt in data.options] if data.options else None,
    )
    db.add(field)
    await db.commit()
    await db.refresh(field)

    return PaperFormFieldResponse(
        id=field.id,
        tenant_id=field.tenant_id,
        schema_id=field.schema_id,
        field_key=field.field_key,
        field_type=field.field_type,
        label=field.label,
        description=field.description,
        placeholder=field.placeholder,
        help_text=field.help_text,
        display_order=field.display_order,
        is_visible=field.is_visible,
        is_required=field.is_required,
        validation_rules=field.validation_rules,
        options=field.options,
        created_at=field.created_at,
        updated_at=field.updated_at,
    )


@router.put("/fields/reorder")
async def reorder_paper_form_fields(
    conference_id: UUID,
    data: FieldReorderRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Reorder custom fields in the paper form schema."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)

    for item in data.fields:
        result = await db.execute(
            select(PaperFormField).where(
                PaperFormField.id == item.id,
                PaperFormField.schema_id == schema.id,
            )
        )
        field = result.scalar_one_or_none()
        if field:
            field.display_order = item.display_order

    await db.commit()

    return {"message": "Fields reordered successfully"}


@router.put("/fields/{field_id}", response_model=PaperFormFieldResponse)
async def update_paper_form_field(
    conference_id: UUID,
    field_id: UUID,
    data: PaperFormFieldUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormFieldResponse:
    """Update a custom field in the paper form schema."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormField).where(
            PaperFormField.id == field_id,
            PaperFormField.schema_id == schema.id,
        )
    )
    field = result.scalar_one_or_none()
    if not field:
        raise NotFoundError(f"Field with ID '{field_id}' not found")

    # Check for duplicate field_key if changing
    if data.field_key is not None and data.field_key != field.field_key:
        result = await db.execute(
            select(PaperFormField).where(
                PaperFormField.schema_id == schema.id,
                PaperFormField.field_key == data.field_key,
            )
        )
        if result.scalar_one_or_none():
            raise ValidationError(f"Field with key '{data.field_key}' already exists")
        field.field_key = data.field_key

    if data.field_type is not None:
        field.field_type = data.field_type.value
    if data.label is not None:
        field.label = data.label
    if data.description is not None:
        field.description = data.description
    if data.placeholder is not None:
        field.placeholder = data.placeholder
    if data.help_text is not None:
        field.help_text = data.help_text
    if data.display_order is not None:
        field.display_order = data.display_order
    if data.is_visible is not None:
        field.is_visible = data.is_visible
    if data.is_required is not None:
        field.is_required = data.is_required
    if data.validation_rules is not None:
        field.validation_rules = data.validation_rules.model_dump()
    if data.options is not None:
        field.options = [opt.model_dump() for opt in data.options]

    await db.commit()
    await db.refresh(field)

    return PaperFormFieldResponse(
        id=field.id,
        tenant_id=field.tenant_id,
        schema_id=field.schema_id,
        field_key=field.field_key,
        field_type=field.field_type,
        label=field.label,
        description=field.description,
        placeholder=field.placeholder,
        help_text=field.help_text,
        display_order=field.display_order,
        is_visible=field.is_visible,
        is_required=field.is_required,
        validation_rules=field.validation_rules,
        options=field.options,
        created_at=field.created_at,
        updated_at=field.updated_at,
    )


@router.delete("/fields/{field_id}")
async def delete_paper_form_field(
    conference_id: UUID,
    field_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a custom field from the paper form schema."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormField).where(
            PaperFormField.id == field_id,
            PaperFormField.schema_id == schema.id,
        )
    )
    field = result.scalar_one_or_none()
    if not field:
        raise NotFoundError(f"Field with ID '{field_id}' not found")

    field_key = field.field_key
    await db.delete(field)
    await db.commit()

    return {"message": f"Field '{field_key}' deleted successfully"}


@router.get("/has-submissions", response_model=HasSubmissionsResponse)
async def check_has_submissions(
    conference_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> HasSubmissionsResponse:
    """Check if any papers have been submitted for CFPs linked to this conference."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)

    result = await db.execute(
        select(func.count(CFPPaper.id))
        .join(ConferenceCFP, CFPPaper.cfp_id == ConferenceCFP.cfp_id)
        .where(
            ConferenceCFP.conference_id == conference_id,
            CFPPaper.tenant_id == tenant_id,
        )
    )
    count = result.scalar() or 0

    return HasSubmissionsResponse(
        has_submissions=count > 0,
        submission_count=count,
    )
