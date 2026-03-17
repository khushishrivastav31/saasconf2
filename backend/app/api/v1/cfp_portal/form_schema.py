"""Portal endpoint for getting paper form schema."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers
from app.models.form_schema import ConferencePaperFormSchema
from app.models.paper_form_variant import PaperFormVariant
from app.models.settings import UserRole, UserRoleAssignment
from app.schemas.form_schema import (
    PaperFormFieldResponse,
    PaperFormSchemaResponse,
    PaperFormVariantResponse,
    VariantFieldResponse,
)

router = APIRouter()


def _build_field_response(f: object) -> PaperFormFieldResponse:
    return PaperFormFieldResponse(
        id=f.id,  # type: ignore[attr-defined]
        tenant_id=f.tenant_id,  # type: ignore[attr-defined]
        schema_id=f.schema_id,  # type: ignore[attr-defined]
        field_key=f.field_key,  # type: ignore[attr-defined]
        field_type=f.field_type,  # type: ignore[attr-defined]
        label=f.label,  # type: ignore[attr-defined]
        description=f.description,  # type: ignore[attr-defined]
        placeholder=f.placeholder,  # type: ignore[attr-defined]
        help_text=f.help_text,  # type: ignore[attr-defined]
        display_order=f.display_order,  # type: ignore[attr-defined]
        is_visible=f.is_visible,  # type: ignore[attr-defined]
        is_required=f.is_required,  # type: ignore[attr-defined]
        validation_rules=f.validation_rules,  # type: ignore[attr-defined]
        options=f.options,  # type: ignore[attr-defined]
        created_at=f.created_at,  # type: ignore[attr-defined]
        updated_at=f.updated_at,  # type: ignore[attr-defined]
    )


@router.get("/portal/cfp/{cfp_id}/paper-form-schema", response_model=PaperFormSchemaResponse)
async def get_cfp_paper_form_schema(
    cfp_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> PaperFormSchemaResponse:
    """Get the paper form schema for a CFP (via its conference), including role-based variants."""
    # Get the CFP
    result = await db.execute(select(CallForPapers).where(CallForPapers.id == cfp_id))
    cfp = result.scalar_one_or_none()
    if not cfp:
        raise NotFoundError(f"CFP with ID '{cfp_id}' not found")

    # Get the conference ID for this CFP
    result = await db.execute(select(ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id == cfp_id))
    row = result.first()
    if not row:
        raise NotFoundError(f"Conference not found for CFP '{cfp_id}'")
    conference_id = row[0]

    # Get the form schema for this conference
    result = await db.execute(
        select(ConferencePaperFormSchema)
        .options(selectinload(ConferencePaperFormSchema.fields))
        .where(ConferencePaperFormSchema.conference_id == conference_id)
    )
    schema = result.scalar_one_or_none()

    if not schema:
        # Return default schema if none exists
        default_config = {
            "title": {"visible": True, "required": True},
            "abstract_short": {"visible": True, "required": False},
            "abstract_long": {"visible": True, "required": False},
            "level": {"visible": True, "required": False},
            "learning_objectives": {"visible": True, "required": False},
            "session_type": {"visible": True, "required": False},
            "topics": {"visible": True, "required": False},
        }
        from app.core.utils import utcnow

        return PaperFormSchemaResponse(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            tenant_id=cfp.tenant_id,
            conference_id=conference_id,
            version=1,
            builtin_fields_config=default_config,
            fields=[],
            variants=[],
            created_at=utcnow(),
            updated_at=utcnow(),
        )

    # Load active variants for this schema that match applicant's roles
    applicant_role_ids_result = await db.execute(
        select(UserRoleAssignment.user_role_id).where(
            UserRoleAssignment.applicant_id == current_applicant.applicant_id,
            UserRoleAssignment.tenant_id == current_applicant.tenant_id,
        )
    )
    applicant_role_ids = {row[0] for row in applicant_role_ids_result.all()}

    variant_items: list[PaperFormVariantResponse] = []
    if applicant_role_ids:
        variant_result = await db.execute(
            select(PaperFormVariant)
            .options(selectinload(PaperFormVariant.fields))
            .where(
                PaperFormVariant.schema_id == schema.id,
                PaperFormVariant.is_active == True,
                PaperFormVariant.user_role_id.in_(applicant_role_ids),
            )
        )
        variants = list(variant_result.scalars().all())

        # Load role names
        if variants:
            v_role_ids = [v.user_role_id for v in variants]
            role_result = await db.execute(select(UserRole).where(UserRole.id.in_(v_role_ids)))
            role_names = {r.id: r.name for r in role_result.scalars().all()}

            for v in variants:
                variant_items.append(
                    PaperFormVariantResponse(
                        id=v.id,
                        tenant_id=v.tenant_id,
                        schema_id=v.schema_id,
                        user_role_id=v.user_role_id,
                        role_name=role_names.get(v.user_role_id, "Unknown"),
                        name=v.name,
                        description=v.description,
                        builtin_fields_config=v.builtin_fields_config,
                        is_active=v.is_active,
                        fields=[
                            VariantFieldResponse(
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
                            for f in sorted(v.fields, key=lambda x: x.display_order)
                        ],
                        created_at=v.created_at,
                        updated_at=v.updated_at,
                    )
                )

    return PaperFormSchemaResponse(
        id=schema.id,
        tenant_id=schema.tenant_id,
        conference_id=schema.conference_id,
        version=schema.version,
        builtin_fields_config=schema.builtin_fields_config,
        fields=[_build_field_response(f) for f in sorted(schema.fields, key=lambda x: x.display_order)],
        variants=variant_items,
        created_at=schema.created_at,
        updated_at=schema.updated_at,
    )
