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
from app.schemas.form_schema import (
    PaperFormFieldResponse,
    PaperFormSchemaResponse,
)

router = APIRouter()


@router.get("/portal/cfp/{cfp_id}/paper-form-schema", response_model=PaperFormSchemaResponse)
async def get_cfp_paper_form_schema(
    cfp_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> PaperFormSchemaResponse:
    """Get the paper form schema for a CFP (via its conference)."""
    # Get the CFP
    result = await db.execute(
        select(CallForPapers).where(CallForPapers.id == cfp_id)
    )
    cfp = result.scalar_one_or_none()
    if not cfp:
        raise NotFoundError(f"CFP with ID '{cfp_id}' not found")

    # Get the conference ID for this CFP
    result = await db.execute(
        select(ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id == cfp_id)
    )
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
            "importance": {"visible": True, "required": False},
            "session_type": {"visible": True, "required": False},
            "topics": {"visible": True, "required": False},
        }
        # Create a temporary response without persisting
        from app.core.utils import utcnow
        return PaperFormSchemaResponse(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            tenant_id=cfp.tenant_id,
            conference_id=conference_id,
            version=1,
            builtin_fields_config=default_config,
            fields=[],
            created_at=utcnow(),
            updated_at=utcnow(),
        )

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
