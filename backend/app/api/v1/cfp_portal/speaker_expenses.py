"""Portal speaker expense endpoints — speakers submit and track their own expenses."""

from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.speaker_expense import (
    ExpenseCategory,
    SpeakerExpense,
    SpeakerExpenseAllowance,
)

router = APIRouter()


# ── Portal-specific schemas ──


class PortalExpenseCreate(BaseModel):
    conference_id: UUID
    title: str = Field(..., max_length=255)
    category_id: UUID | None = None
    description: str | None = None
    expense_date: date
    original_amount: Decimal = Field(..., gt=0)
    original_currency: str = Field(..., max_length=3)
    session_id: UUID | None = None
    notes: str | None = None


class PortalExpenseUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    category_id: UUID | None = None
    description: str | None = None
    expense_date: date | None = None
    original_amount: Decimal | None = Field(None, gt=0)
    original_currency: str | None = Field(None, max_length=3)
    session_id: UUID | None = None
    notes: str | None = None


class PortalExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conference_id: UUID
    conference_name: str | None = None
    title: str
    category_id: UUID | None = None
    category_name: str | None = None
    description: str | None = None
    expense_date: str
    original_amount: Decimal
    original_currency: str
    session_id: UUID | None = None
    session_title: str | None = None
    status: str
    rejection_reason: str | None = None
    paid_at: str | None = None
    payment_reference: str | None = None
    notes: str | None = None
    attachment_count: int = 0
    created_at: str
    updated_at: str


class PortalAttachmentResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str
    file_size: int
    description: str | None = None


class PortalAllowanceResponse(BaseModel):
    conference_id: UUID
    conference_name: str | None = None
    max_amount: Decimal
    currency: str
    total_claimed: Decimal = Decimal("0")
    total_approved: Decimal = Decimal("0")
    remaining: Decimal = Decimal("0")


# ── Endpoints ──


@router.get("/portal/my-conferences")
async def list_my_conferences(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """List conferences the applicant is associated with (via papers)."""
    from app.models.cfp import ConferenceCFP
    from app.models.cfp_papers import CFPPaper
    from app.models.conference import Conference

    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    result = await db.execute(
        select(Conference.id, Conference.name)
        .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
        .join(CFPPaper, CFPPaper.cfp_id == ConferenceCFP.cfp_id)
        .where(
            CFPPaper.main_speaker_id == applicant_id,
            Conference.tenant_id == tenant_id,
        )
        .distinct()
        .order_by(Conference.name)
    )
    rows = result.all()
    return {"items": [{"id": str(r.id), "name": r.name} for r in rows]}


@router.get("/portal/expenses")
async def list_my_expenses(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    conference_id: UUID | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
) -> dict:
    """List the current speaker's expenses."""
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    base_filter = [
        SpeakerExpense.cfp_applicant_id == applicant_id,
        SpeakerExpense.tenant_id == tenant_id,
    ]
    if conference_id:
        base_filter.append(SpeakerExpense.conference_id == conference_id)
    if status:
        base_filter.append(SpeakerExpense.status == status)

    count_result = await db.execute(select(func.count()).select_from(SpeakerExpense).where(*base_filter))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(SpeakerExpense)
        .options(
            selectinload(SpeakerExpense.category),
            selectinload(SpeakerExpense.session),
            selectinload(SpeakerExpense.conference),
        )
        .where(*base_filter)
        .order_by(SpeakerExpense.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    expenses = result.scalars().all()

    # Batch-fetch attachment counts
    from app.models.attachment import Attachment

    expense_ids = [e.id for e in expenses]
    attachment_counts: dict[UUID, int] = {}
    if expense_ids:
        att_result = await db.execute(
            select(Attachment.entity_id, func.count().label("cnt"))
            .where(
                Attachment.entity_type == "speaker_expense",
                Attachment.entity_id.in_(expense_ids),
            )
            .group_by(Attachment.entity_id)
        )
        for entity_id, cnt in att_result.all():
            attachment_counts[entity_id] = cnt

    items = [
        PortalExpenseResponse(
            id=e.id,
            conference_id=e.conference_id,
            conference_name=e.conference.name if e.conference else None,
            title=e.title,
            category_id=e.category_id,
            category_name=e.category.name if e.category else None,
            description=e.description,
            expense_date=str(e.expense_date),
            original_amount=e.original_amount,
            original_currency=e.original_currency,
            session_id=e.session_id,
            session_title=e.session.title if e.session else None,
            status=e.status,
            rejection_reason=e.rejection_reason,
            paid_at=str(e.paid_at) if e.paid_at else None,
            payment_reference=e.payment_reference,
            notes=e.notes,
            attachment_count=attachment_counts.get(e.id, 0),
            created_at=str(e.created_at),
            updated_at=str(e.updated_at),
        )
        for e in expenses
    ]

    return {"items": items, "total": total}


@router.get("/portal/expenses/allowances")
async def get_my_allowances(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    conference_id: UUID | None = Query(None),
) -> dict:
    """Get the current speaker's expense allowances (read-only)."""
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    base_filter = [
        SpeakerExpenseAllowance.cfp_applicant_id == applicant_id,
        SpeakerExpenseAllowance.tenant_id == tenant_id,
    ]
    if conference_id:
        base_filter.append(SpeakerExpenseAllowance.conference_id == conference_id)

    result = await db.execute(
        select(SpeakerExpenseAllowance).options(selectinload(SpeakerExpenseAllowance.conference)).where(*base_filter)
    )
    allowances = result.scalars().all()

    # Get expense totals per conference for this speaker
    expense_stats = await db.execute(
        select(
            SpeakerExpense.conference_id,
            SpeakerExpense.status,
            func.coalesce(func.sum(SpeakerExpense.original_amount), 0),
        )
        .where(
            SpeakerExpense.cfp_applicant_id == applicant_id,
            SpeakerExpense.tenant_id == tenant_id,
        )
        .group_by(SpeakerExpense.conference_id, SpeakerExpense.status)
    )

    totals: dict[UUID, dict[str, Decimal]] = {}
    for conf_id, exp_status, amount in expense_stats.all():
        if conf_id not in totals:
            totals[conf_id] = {"claimed": Decimal("0"), "approved": Decimal("0")}
        amount_d = Decimal(str(amount))
        if exp_status in ("submitted", "approved", "paid"):
            totals[conf_id]["claimed"] += amount_d
        if exp_status in ("approved", "paid"):
            totals[conf_id]["approved"] += amount_d

    items = []
    for a in allowances:
        conf_totals = totals.get(a.conference_id, {"claimed": Decimal("0"), "approved": Decimal("0")})
        items.append(
            PortalAllowanceResponse(
                conference_id=a.conference_id,
                conference_name=a.conference.name if a.conference else None,
                max_amount=a.max_amount,
                currency=a.currency,
                total_claimed=conf_totals["claimed"],
                total_approved=conf_totals["approved"],
                remaining=a.max_amount - conf_totals["approved"],
            )
        )

    return {"items": [i.model_dump() for i in items]}


@router.get("/portal/expenses/categories")
async def list_expense_categories_for_conference(
    conference_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """List expense categories for a conference (for the expense form dropdown)."""
    result = await db.execute(
        select(ExpenseCategory)
        .where(
            ExpenseCategory.conference_id == conference_id,
            ExpenseCategory.tenant_id == current_applicant.tenant_id,
            ExpenseCategory.is_active.is_(True),
        )
        .order_by(ExpenseCategory.sort_order, ExpenseCategory.name)
    )
    categories = result.scalars().all()
    return {"items": [{"id": str(c.id), "name": c.name} for c in categories]}


@router.post("/portal/expenses", status_code=201)
async def create_my_expense(
    data: PortalExpenseCreate,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Create a new expense (status: draft)."""
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    # Get applicant name
    from app.models.cfp_applicants import CFPApplicant

    app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == applicant_id))
    applicant = app_result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Applicant not found")

    speaker_name = f"{applicant.first_name or ''} {applicant.last_name or ''}".strip()

    expense = SpeakerExpense(
        tenant_id=tenant_id,
        conference_id=data.conference_id,
        cfp_applicant_id=applicant_id,
        speaker_name=speaker_name,
        category_id=data.category_id,
        title=data.title,
        description=data.description,
        expense_date=data.expense_date,
        original_amount=data.original_amount,
        original_currency=data.original_currency,
        session_id=data.session_id,
        notes=data.notes,
        status="draft",
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)

    return {"id": str(expense.id), "status": expense.status}


@router.put("/portal/expenses/{expense_id}")
async def update_my_expense(
    expense_id: UUID,
    data: PortalExpenseUpdate,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Update an expense (only draft or rejected)."""
    expense = await _get_own_expense(expense_id, current_applicant, db)

    if expense.status not in ("draft", "rejected"):
        raise ValidationError("Can only edit expenses in draft or rejected status")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(expense, field, value)

    # Reset rejection on re-edit
    if expense.status == "rejected":
        expense.status = "draft"
        expense.rejection_reason = None

    await db.commit()
    return {"id": str(expense.id), "status": expense.status}


@router.post("/portal/expenses/{expense_id}/submit")
async def submit_my_expense(
    expense_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Submit an expense for admin approval."""
    expense = await _get_own_expense(expense_id, current_applicant, db)

    if expense.status != "draft":
        raise ValidationError("Can only submit expenses in draft status")

    expense.status = "submitted"
    await db.commit()
    return {"id": str(expense.id), "status": "submitted"}


@router.delete("/portal/expenses/{expense_id}", status_code=204)
async def delete_my_expense(
    expense_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> None:
    """Delete an expense (only drafts)."""
    expense = await _get_own_expense(expense_id, current_applicant, db)

    if expense.status != "draft":
        raise ValidationError("Can only delete expenses in draft status")

    await db.delete(expense)
    await db.commit()


@router.get("/portal/expenses/{expense_id}/attachments")
async def list_expense_attachments(
    expense_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """List attachments for one of the speaker's own expenses."""
    from app.models.attachment import Attachment

    # Verify ownership
    await _get_own_expense(expense_id, current_applicant, db)

    result = await db.execute(
        select(Attachment)
        .where(
            Attachment.entity_type == "speaker_expense",
            Attachment.entity_id == expense_id,
            Attachment.tenant_id == current_applicant.tenant_id,
        )
        .order_by(Attachment.created_at)
    )
    attachments = result.scalars().all()
    return {
        "items": [
            PortalAttachmentResponse(
                id=a.id,
                filename=a.filename,
                content_type=a.content_type,
                file_size=a.file_size,
                description=a.description,
            ).model_dump()
            for a in attachments
        ]
    }


# ── Helpers ──


async def _get_own_expense(
    expense_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> SpeakerExpense:
    """Get an expense that belongs to the current applicant."""
    result = await db.execute(
        select(SpeakerExpense).where(
            SpeakerExpense.id == expense_id,
            SpeakerExpense.cfp_applicant_id == current_applicant.applicant_id,
            SpeakerExpense.tenant_id == current_applicant.tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFoundError("Expense not found")
    return expense
