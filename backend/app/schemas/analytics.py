"""Pydantic v2 schemas for analytics endpoints."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PeriodBreakdown(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    booking_period_id: UUID | None
    period_name: str
    period_start: date | None
    period_end: date | None
    attendee_count: int
    total_revenue: Decimal
    subtotal_revenue: Decimal
    tax_amount: Decimal


class BookingOptionRevenue(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    booking_option_id: UUID
    booking_option_name: str
    category: Literal["ticket", "day_pass"]
    conference_day_id: UUID | None
    attendee_count: int
    total_revenue: Decimal
    subtotal_revenue: Decimal
    tax_amount: Decimal
    currency: str
    periods: list[PeriodBreakdown]


class RevenueTrackingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_revenue: Decimal
    registration_revenue: Decimal
    sponsor_revenue: Decimal
    outstanding_revenue: Decimal
    other_revenue: Decimal
    currency: str
    by_booking_option: list[BookingOptionRevenue]
    sponsor_invoice_count: int
    total_registrations: int
    paid_registrations: int
    active_registrations: int
    cancelled_registrations: int
    multiple_currencies: bool


class PLSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_revenue: Decimal
    outstanding_revenue: Decimal
    total_costs: Decimal
    net_result: Decimal
    currency: str
    as_of_date: date


class VarianceLine(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category_name: str
    category_color: str | None
    planned: Decimal
    actual: Decimal
    variance: Decimal
    variance_percent: float


class CostPerAttendee(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_paid_attendees: int
    total_costs: Decimal
    cost_per_attendee: Decimal
    revenue_per_attendee: Decimal
    currency: str


class FinancialReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pl_summary: PLSummary
    variance_by_category: list[VarianceLine]
    cost_per_attendee: CostPerAttendee
    revenue: RevenueTrackingResponse
    budget_id: UUID | None
    budget_name: str | None
    generated_at: datetime
