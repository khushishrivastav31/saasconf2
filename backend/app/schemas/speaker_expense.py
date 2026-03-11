"""Speaker expense management schemas."""

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ── Expense Categories ──


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    sort_order: int = 0


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    sort_order: int | None = None
    is_active: bool | None = None


class ExpenseCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    sort_order: int
    is_active: bool
    conference_id: UUID


# ── Expense Tiers ──


class ExpenseTierCreate(BaseModel):
    name: str = Field(..., max_length=150)
    max_amount: Decimal = Field(..., ge=0)
    currency: str = Field("EUR", max_length=3)
    sort_order: int = 0


class ExpenseTierUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    max_amount: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    sort_order: int | None = None
    is_active: bool | None = None


class ExpenseTierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    max_amount: Decimal
    currency: str
    sort_order: int
    is_active: bool
    conference_id: UUID


# ── Allowance Defaults (per session type) ──


class AllowanceDefaultCreate(BaseModel):
    session_type_id: UUID
    max_amount: Decimal = Field(..., ge=0)
    currency: str = Field("EUR", max_length=3)


class AllowanceDefaultUpdate(BaseModel):
    max_amount: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)


class AllowanceDefaultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_type_id: UUID
    session_type_name: str | None = None
    max_amount: Decimal
    currency: str
    conference_id: UUID


# ── Speaker Allowances (per speaker) ──


class SpeakerAllowanceUpdate(BaseModel):
    max_amount: Decimal = Field(..., ge=0)
    currency: str = Field("EUR", max_length=3)
    notes: str | None = None


class AssignTierRequest(BaseModel):
    expense_tier_id: UUID


class AssignTierByApplicantRequest(BaseModel):
    expense_tier_id: UUID
    cfp_applicant_id: UUID


class SpeakerAllowanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cfp_applicant_id: UUID
    speaker_name: str | None = None
    expense_tier_id: UUID | None = None
    expense_tier_name: str | None = None
    max_amount: Decimal
    currency: str
    source: str  # auto, manual, tier
    notes: str | None = None
    total_claimed: Decimal = Decimal("0")
    total_approved: Decimal = Decimal("0")
    remaining: Decimal = Decimal("0")


# ── Speaker Expenses ──


class SpeakerExpenseCreate(BaseModel):
    title: str = Field(..., max_length=255)
    category_id: UUID | None = None
    description: str | None = None
    expense_date: date
    original_amount: Decimal = Field(..., gt=0)
    original_currency: str = Field(..., max_length=3)
    converted_amount: Decimal | None = None
    exchange_rate: Decimal | None = None
    session_id: UUID | None = None
    notes: str | None = None


class AdminSpeakerExpenseCreate(SpeakerExpenseCreate):
    """Admin creates an expense on behalf of a speaker."""

    cfp_applicant_id: UUID
    status: str = Field("submitted", pattern="^(draft|submitted)$")


class SpeakerExpenseUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    category_id: UUID | None = None
    description: str | None = None
    expense_date: date | None = None
    original_amount: Decimal | None = Field(None, gt=0)
    original_currency: str | None = Field(None, max_length=3)
    converted_amount: Decimal | None = None
    exchange_rate: Decimal | None = None
    session_id: UUID | None = None
    notes: str | None = None


class SpeakerExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conference_id: UUID
    cfp_applicant_id: UUID
    speaker_name: str
    category_id: UUID | None = None
    category_name: str | None = None
    title: str
    description: str | None = None
    expense_date: str
    original_amount: Decimal
    original_currency: str
    converted_amount: Decimal | None = None
    conference_currency: str | None = None
    exchange_rate: Decimal | None = None
    session_id: UUID | None = None
    session_title: str | None = None
    status: str
    approved_by: UUID | None = None
    approved_at: str | None = None
    rejection_reason: str | None = None
    paid_at: str | None = None
    payment_reference: str | None = None
    notes: str | None = None
    attachment_count: int = 0
    created_at: str
    updated_at: str


class SpeakerExpenseListResponse(BaseModel):
    items: list[SpeakerExpenseResponse]
    total: int


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)


class MarkPaidRequest(BaseModel):
    payment_reference: str | None = Field(None, max_length=255)


# ── Stats ──


class ExpenseStatusCount(BaseModel):
    status: str
    count: int
    total_amount: Decimal


class ExpenseStatsResponse(BaseModel):
    by_status: list[ExpenseStatusCount]
    total_expenses: int
    total_amount: Decimal
    currency: str | None = None
