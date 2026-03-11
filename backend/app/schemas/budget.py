"""Budget planning schemas."""

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ── Budget Categories ──


class BudgetCategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    color: str | None = Field(None, max_length=7)
    sort_order: int = 0


class BudgetCategoryUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    color: str | None = Field(None, max_length=7)
    sort_order: int | None = None


class BudgetCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    color: str | None = None
    sort_order: int
    conference_id: UUID


# ── Budget Line Items ──


class BudgetLineItemCreate(BaseModel):
    category_id: UUID | None = None
    description: str = Field(..., max_length=500)
    planned_amount: Decimal = Decimal("0")
    actual_amount: Decimal = Decimal("0")
    vendor_name: str | None = Field(None, max_length=255)
    notes: str | None = None
    sort_order: int = 0


class BudgetLineItemUpdate(BaseModel):
    category_id: UUID | None = None
    description: str | None = Field(None, max_length=500)
    planned_amount: Decimal | None = None
    actual_amount: Decimal | None = None
    vendor_name: str | None = Field(None, max_length=255)
    notes: str | None = None
    sort_order: int | None = None


class BudgetLineItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    budget_id: UUID
    category_id: UUID | None = None
    category_name: str | None = None
    description: str
    planned_amount: Decimal
    actual_amount: Decimal
    variance: Decimal = Decimal("0")
    vendor_name: str | None = None
    notes: str | None = None
    sort_order: int


# ── Budgets ──


class BudgetCreate(BaseModel):
    name: str = Field(..., max_length=255)
    currency: str = Field("EUR", max_length=3)
    notes: str | None = None


class BudgetUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    notes: str | None = None


class BudgetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conference_id: UUID
    name: str
    status: str
    total_planned: Decimal
    total_actual: Decimal
    total_remaining: Decimal = Decimal("0")
    percent_used: float = 0.0
    currency: str
    notes: str | None = None
    created_by: UUID | None = None
    created_at: str
    updated_at: str
    items_count: int = 0


class BudgetDetailResponse(BudgetResponse):
    items: list[BudgetLineItemResponse] = []


class BudgetListResponse(BaseModel):
    items: list[BudgetResponse]
    total: int


# ── Summary ──


class CategorySummary(BaseModel):
    category_id: UUID | None = None
    category_name: str
    color: str | None = None
    planned: Decimal
    actual: Decimal
    remaining: Decimal
    percent_used: float


class BudgetSummaryResponse(BaseModel):
    total_planned: Decimal
    total_actual: Decimal
    total_remaining: Decimal
    percent_used: float
    by_category: list[CategorySummary]
