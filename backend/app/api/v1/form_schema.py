"""Paper form schema endpoints for designing custom paper submission forms."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.associations import ConferenceCFP
from app.models.cfp import CFPPaper
from app.models.conference import Conference
from app.models.form_schema import ConferencePaperFormSchema, PaperFormField
from app.models.paper_form_variant import PaperFormVariant, PaperFormVariantField
from app.models.settings import UserRole
from app.schemas.form_schema import (
    FieldReorderRequest,
    HasSubmissionsResponse,
    PaperFormFieldCreate,
    PaperFormFieldResponse,
    PaperFormFieldUpdate,
    PaperFormSchemaResponse,
    PaperFormSchemaUpdate,
    PaperFormVariantCreate,
    PaperFormVariantListResponse,
    PaperFormVariantResponse,
    PaperFormVariantUpdate,
    VariantFieldCreate,
    VariantFieldReorderRequest,
    VariantFieldResponse,
    VariantFieldUpdate,
)

router = APIRouter()


async def get_conference_or_404(db: DbSessionDep, conference_id: UUID, tenant_id: UUID | None) -> Conference:
    """Get conference by ID or raise 404.

    ``tenant_id`` is typed optional to accept ``CurrentUser.tenant_id`` directly;
    a ``None`` value translates to ``WHERE tenant_id IS NULL`` and still produces
    a 404, so behaviour is unchanged.
    """
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


def _build_field_response(f: PaperFormField) -> PaperFormFieldResponse:
    return PaperFormFieldResponse(
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


def _build_variant_field_response(f: PaperFormVariantField) -> VariantFieldResponse:
    return VariantFieldResponse(
        id=f.id,
        tenant_id=f.tenant_id,
        variant_id=f.variant_id,
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


def _build_variant_response(v: PaperFormVariant, role_name: str) -> PaperFormVariantResponse:
    return PaperFormVariantResponse(
        id=v.id,
        tenant_id=v.tenant_id,
        schema_id=v.schema_id,
        user_role_id=v.user_role_id,
        role_name=role_name,
        name=v.name,
        description=v.description,
        builtin_fields_config=v.builtin_fields_config,
        is_active=v.is_active,
        fields=[_build_variant_field_response(f) for f in sorted(v.fields, key=lambda x: x.display_order)],
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


async def _build_schema_response(db: DbSessionDep, schema: ConferencePaperFormSchema) -> PaperFormSchemaResponse:
    """Build full schema response including variants."""
    # Load variants with their fields and roles
    variant_result = await db.execute(
        select(PaperFormVariant)
        .options(selectinload(PaperFormVariant.fields))
        .where(PaperFormVariant.schema_id == schema.id)
    )
    variants = list(variant_result.scalars().all())

    # Batch-load role names
    role_ids = [v.user_role_id for v in variants]
    role_names: dict[UUID, str] = {}
    if role_ids:
        role_result = await db.execute(select(UserRole).where(UserRole.id.in_(role_ids)))
        role_names = {r.id: r.name for r in role_result.scalars().all()}

    return PaperFormSchemaResponse(
        id=schema.id,
        tenant_id=schema.tenant_id,
        conference_id=schema.conference_id,
        version=schema.version,
        builtin_fields_config=schema.builtin_fields_config,
        fields=[_build_field_response(f) for f in sorted(schema.fields, key=lambda x: x.display_order)],
        variants=[_build_variant_response(v, role_names.get(v.user_role_id, "Unknown")) for v in variants],
        created_at=schema.created_at,
        updated_at=schema.updated_at,
    )


# ---------------------------------------------------------------------------
# Base schema endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=PaperFormSchemaResponse)
async def get_paper_form_schema(
    conference_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormSchemaResponse:
    """Get the paper form schema for a conference."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)
    return await _build_schema_response(db, schema)


@router.put("", response_model=PaperFormSchemaResponse)
async def update_paper_form_schema(
    conference_id: UUID,
    data: PaperFormSchemaUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormSchemaResponse:
    """Update the paper form schema (builtin fields config)."""
    tenant_id = current_user.require_tenant_id()
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
    return await _build_schema_response(db, schema)


# ---------------------------------------------------------------------------
# Custom field endpoints
# ---------------------------------------------------------------------------


@router.post("/fields", response_model=PaperFormFieldResponse, status_code=201)
async def create_paper_form_field(
    conference_id: UUID,
    data: PaperFormFieldCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormFieldResponse:
    """Add a custom field to the paper form schema."""
    tenant_id = current_user.require_tenant_id()
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

    return _build_field_response(field)


@router.put("/fields/reorder")
async def reorder_paper_form_fields(
    conference_id: UUID,
    data: FieldReorderRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Reorder custom fields in the paper form schema."""
    tenant_id = current_user.require_tenant_id()
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
    tenant_id = current_user.require_tenant_id()
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

    return _build_field_response(field)


@router.delete("/fields/{field_id}")
async def delete_paper_form_field(
    conference_id: UUID,
    field_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a custom field from the paper form schema."""
    tenant_id = current_user.require_tenant_id()
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
    tenant_id = current_user.require_tenant_id()
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


# ---------------------------------------------------------------------------
# Variant CRUD endpoints
# ---------------------------------------------------------------------------


@router.get("/variants", response_model=PaperFormVariantListResponse)
async def list_variants(
    conference_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormVariantListResponse:
    """List all form variants for a conference."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormVariant)
        .options(selectinload(PaperFormVariant.fields))
        .where(PaperFormVariant.schema_id == schema.id)
    )
    variants = list(result.scalars().all())

    # Batch-load role names
    role_ids = [v.user_role_id for v in variants]
    role_names: dict[UUID, str] = {}
    if role_ids:
        role_result = await db.execute(select(UserRole).where(UserRole.id.in_(role_ids)))
        role_names = {r.id: r.name for r in role_result.scalars().all()}

    items = [_build_variant_response(v, role_names.get(v.user_role_id, "Unknown")) for v in variants]
    return PaperFormVariantListResponse(items=items, total=len(items))


@router.post("/variants", response_model=PaperFormVariantResponse, status_code=201)
async def create_variant(
    conference_id: UUID,
    data: PaperFormVariantCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormVariantResponse:
    """Create a new form variant for a role. Copies the base schema's builtin config and custom fields."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)
    schema = await get_or_create_schema(db, conference_id, tenant_id)

    # Verify role exists and belongs to this conference
    role_result = await db.execute(
        select(UserRole).where(
            UserRole.id == data.user_role_id,
            UserRole.conference_id == conference_id,
        )
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise NotFoundError("User role not found for this conference")

    # Check uniqueness: one variant per role per schema
    existing = await db.execute(
        select(PaperFormVariant).where(
            PaperFormVariant.schema_id == schema.id,
            PaperFormVariant.user_role_id == data.user_role_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A variant already exists for role '{role.name}'")

    # Use provided builtin config or copy from base schema
    builtin_config = (
        {k: v.model_dump() for k, v in data.builtin_fields_config.items()}
        if data.builtin_fields_config
        else dict(schema.builtin_fields_config)
    )

    variant = PaperFormVariant(
        tenant_id=tenant_id,
        schema_id=schema.id,
        user_role_id=data.user_role_id,
        name=data.name,
        description=data.description,
        builtin_fields_config=builtin_config,
        is_active=data.is_active,
    )
    db.add(variant)
    await db.flush()

    # Copy custom fields from base schema
    for base_field in schema.fields:
        variant_field = PaperFormVariantField(
            tenant_id=tenant_id,
            variant_id=variant.id,
            field_key=base_field.field_key,
            field_type=base_field.field_type,
            label=base_field.label,
            description=base_field.description,
            placeholder=base_field.placeholder,
            help_text=base_field.help_text,
            display_order=base_field.display_order,
            is_visible=base_field.is_visible,
            is_required=base_field.is_required,
            validation_rules=base_field.validation_rules,
            options=base_field.options,
        )
        db.add(variant_field)

    await db.commit()

    # Re-fetch with eager loading
    result = await db.execute(
        select(PaperFormVariant).options(selectinload(PaperFormVariant.fields)).where(PaperFormVariant.id == variant.id)
    )
    variant = result.scalar_one()

    return _build_variant_response(variant, role.name)


@router.get("/variants/{variant_id}", response_model=PaperFormVariantResponse)
async def get_variant(
    conference_id: UUID,
    variant_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormVariantResponse:
    """Get a single form variant."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormVariant)
        .options(selectinload(PaperFormVariant.fields))
        .where(
            PaperFormVariant.id == variant_id,
            PaperFormVariant.tenant_id == tenant_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise NotFoundError("Variant not found")

    role_result = await db.execute(select(UserRole).where(UserRole.id == variant.user_role_id))
    role = role_result.scalar_one_or_none()

    return _build_variant_response(variant, role.name if role else "Unknown")


@router.put("/variants/{variant_id}", response_model=PaperFormVariantResponse)
async def update_variant(
    conference_id: UUID,
    variant_id: UUID,
    data: PaperFormVariantUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperFormVariantResponse:
    """Update a form variant's metadata and builtin field config."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormVariant).where(
            PaperFormVariant.id == variant_id,
            PaperFormVariant.tenant_id == tenant_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise NotFoundError("Variant not found")

    if data.name is not None:
        variant.name = data.name
    if data.description is not None:
        variant.description = data.description
    if data.is_active is not None:
        variant.is_active = data.is_active
    if data.builtin_fields_config is not None:
        config = {k: v.model_dump() for k, v in data.builtin_fields_config.items()}
        if "title" in config:
            config["title"]["required"] = True
        variant.builtin_fields_config = config

    await db.commit()

    # Re-fetch with eager loading
    result = await db.execute(
        select(PaperFormVariant).options(selectinload(PaperFormVariant.fields)).where(PaperFormVariant.id == variant.id)
    )
    variant = result.scalar_one()

    role_result = await db.execute(select(UserRole).where(UserRole.id == variant.user_role_id))
    role = role_result.scalar_one_or_none()

    return _build_variant_response(variant, role.name if role else "Unknown")


@router.delete("/variants/{variant_id}")
async def delete_variant(
    conference_id: UUID,
    variant_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a form variant and all its fields."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormVariant).where(
            PaperFormVariant.id == variant_id,
            PaperFormVariant.tenant_id == tenant_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise NotFoundError("Variant not found")

    name = variant.name
    await db.delete(variant)
    await db.commit()

    return {"message": f"Variant '{name}' deleted successfully"}


# ---------------------------------------------------------------------------
# Variant field endpoints
# ---------------------------------------------------------------------------


@router.post("/variants/{variant_id}/fields", response_model=VariantFieldResponse, status_code=201)
async def create_variant_field(
    conference_id: UUID,
    variant_id: UUID,
    data: VariantFieldCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> VariantFieldResponse:
    """Add a custom field to a variant."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormVariant).where(
            PaperFormVariant.id == variant_id,
            PaperFormVariant.tenant_id == tenant_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise NotFoundError("Variant not found")

    # Check duplicate field_key
    dup = await db.execute(
        select(PaperFormVariantField).where(
            PaperFormVariantField.variant_id == variant_id,
            PaperFormVariantField.field_key == data.field_key,
        )
    )
    if dup.scalar_one_or_none():
        raise ValidationError(f"Field with key '{data.field_key}' already exists in this variant")

    if data.field_type in ["dropdown", "checkbox_group"]:
        if not data.options or len(data.options) == 0:
            raise ValidationError(f"Field type '{data.field_type}' requires at least one option")

    field = PaperFormVariantField(
        tenant_id=tenant_id,
        variant_id=variant_id,
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

    return _build_variant_field_response(field)


@router.put("/variants/{variant_id}/fields/reorder")
async def reorder_variant_fields(
    conference_id: UUID,
    variant_id: UUID,
    data: VariantFieldReorderRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Reorder custom fields in a variant."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)

    variant_result = await db.execute(
        select(PaperFormVariant).where(
            PaperFormVariant.id == variant_id,
            PaperFormVariant.tenant_id == tenant_id,
        )
    )
    if not variant_result.scalar_one_or_none():
        raise NotFoundError("Variant not found")

    for item in data.fields:
        field_result = await db.execute(
            select(PaperFormVariantField).where(
                PaperFormVariantField.id == item.id,
                PaperFormVariantField.variant_id == variant_id,
            )
        )
        field = field_result.scalar_one_or_none()
        if field:
            field.display_order = item.display_order

    await db.commit()
    return {"message": "Variant fields reordered successfully"}


@router.put("/variants/{variant_id}/fields/{field_id}", response_model=VariantFieldResponse)
async def update_variant_field(
    conference_id: UUID,
    variant_id: UUID,
    field_id: UUID,
    data: VariantFieldUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> VariantFieldResponse:
    """Update a custom field in a variant."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormVariantField).where(
            PaperFormVariantField.id == field_id,
            PaperFormVariantField.variant_id == variant_id,
        )
    )
    field = result.scalar_one_or_none()
    if not field:
        raise NotFoundError("Variant field not found")

    if data.field_key is not None and data.field_key != field.field_key:
        dup = await db.execute(
            select(PaperFormVariantField).where(
                PaperFormVariantField.variant_id == variant_id,
                PaperFormVariantField.field_key == data.field_key,
            )
        )
        if dup.scalar_one_or_none():
            raise ValidationError(f"Field with key '{data.field_key}' already exists in this variant")
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

    return _build_variant_field_response(field)


@router.delete("/variants/{variant_id}/fields/{field_id}")
async def delete_variant_field(
    conference_id: UUID,
    variant_id: UUID,
    field_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a custom field from a variant."""
    tenant_id = current_user.require_tenant_id()
    if current_user.is_super_admin and tenant_id is None:
        raise ValidationError("Super admin must have tenant context")

    await get_conference_or_404(db, conference_id, tenant_id)

    result = await db.execute(
        select(PaperFormVariantField).where(
            PaperFormVariantField.id == field_id,
            PaperFormVariantField.variant_id == variant_id,
        )
    )
    field = result.scalar_one_or_none()
    if not field:
        raise NotFoundError("Variant field not found")

    field_key = field.field_key
    await db.delete(field)
    await db.commit()

    return {"message": f"Variant field '{field_key}' deleted successfully"}
