"""Platform settings management endpoints (super admin only)."""

from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel
from sqlalchemy import case, select

from app.core.currency_formats import get_format_as_dict, get_preset_list
from app.core.dependencies import CurrentUserDep, DbSessionDep, SuperAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.models.audit import AuditAction, AuditLog
from app.models.platform_currency import PlatformCurrency
from app.models.settings import EmailTemplate
from app.schemas.email_template import (
    EmailTemplateListResponse,
    EmailTemplateResponse,
    EmailTemplateType,
    EmailTemplateUpdate,
)
from app.schemas.platform_currency import (
    PlatformCurrencyCreate,
    PlatformCurrencyListResponse,
    PlatformCurrencyResponse,
    PlatformCurrencyUpdate,
)

router = APIRouter()


# Currency list/format endpoints use CurrentUserDep intentionally: tenant admins
# need currency data when configuring invoice settings.  The data (currency names,
# codes, symbols, format presets) is non-sensitive reference data.
@router.get("/currencies", response_model=PlatformCurrencyListResponse)
async def list_platform_currencies(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = None,
    is_active: bool | None = None,
) -> PlatformCurrencyListResponse:
    """List all platform currencies with pagination."""
    query = select(PlatformCurrency)

    if search:
        query = query.where(
            unaccent_ilike(PlatformCurrency.name, search) | unaccent_ilike(PlatformCurrency.code, search)
        )

    if is_active is not None:
        query = query.where(PlatformCurrency.is_active == is_active)

    # EUR first, then alphabetical
    query = query.order_by(
        case((PlatformCurrency.code == "EUR", 0), else_=1),
        PlatformCurrency.code.asc(),
    )
    result = await paginate(db, query, page, page_size)

    items = [PlatformCurrencyResponse.model_validate(c) for c in result.items]

    return PlatformCurrencyListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
    )


@router.post("/currencies", response_model=PlatformCurrencyResponse, status_code=201)
async def create_platform_currency(
    currency_data: PlatformCurrencyCreate,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PlatformCurrencyResponse:
    """Create a new platform currency."""
    # Check code uniqueness
    existing = await db.execute(select(PlatformCurrency).where(PlatformCurrency.code == currency_data.code))
    if existing.scalar_one_or_none():
        raise ValidationError(f"Currency with code '{currency_data.code}' already exists")

    currency = PlatformCurrency(
        code=currency_data.code,
        name=currency_data.name,
        symbol=currency_data.symbol,
        is_active=currency_data.is_active,
    )
    db.add(currency)

    # Audit log
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.PLATFORM_CURRENCY_CREATE,
        resource_type="platform_currency",
        resource_id=currency.id,
        details={"code": currency.code, "name": currency.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(currency)

    return PlatformCurrencyResponse.model_validate(currency)


@router.put("/currencies/{currency_id}", response_model=PlatformCurrencyResponse)
async def update_platform_currency(
    currency_id: UUID,
    currency_data: PlatformCurrencyUpdate,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PlatformCurrencyResponse:
    """Update a platform currency."""
    result = await db.execute(select(PlatformCurrency).where(PlatformCurrency.id == currency_id))
    currency = result.scalar_one_or_none()
    if not currency:
        raise NotFoundError(f"Platform currency with ID '{currency_id}' not found")

    update_data = currency_data.model_dump(exclude_unset=True)

    # If code is changing, check uniqueness
    if "code" in update_data and update_data["code"] != currency.code:
        existing = await db.execute(select(PlatformCurrency).where(PlatformCurrency.code == update_data["code"]))
        if existing.scalar_one_or_none():
            raise ValidationError(f"Currency with code '{update_data['code']}' already exists")

    for field, value in update_data.items():
        setattr(currency, field, value)

    # Audit log
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.PLATFORM_CURRENCY_UPDATE,
        resource_type="platform_currency",
        resource_id=currency.id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(currency)

    return PlatformCurrencyResponse.model_validate(currency)


@router.delete("/currencies/{currency_id}", status_code=204)
async def delete_platform_currency(
    currency_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> None:
    """Delete a platform currency."""
    result = await db.execute(select(PlatformCurrency).where(PlatformCurrency.id == currency_id))
    currency = result.scalar_one_or_none()
    if not currency:
        raise NotFoundError(f"Platform currency with ID '{currency_id}' not found")

    # Audit log
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.PLATFORM_CURRENCY_DELETE,
        resource_type="platform_currency",
        resource_id=currency.id,
        details={"code": currency.code, "name": currency.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(currency)
    await db.commit()


class SuggestedNumberFormat(BaseModel):
    """Suggested number format for a currency."""

    decimal_separator: str
    thousands_separator: str
    currency_position: str
    decimal_places: int


@router.get("/currencies/{currency_code}/suggested-format", response_model=SuggestedNumberFormat)
async def get_suggested_number_format(
    currency_code: str,
    current_user: CurrentUserDep,
) -> SuggestedNumberFormat:
    """Get suggested number format for a currency code.

    Returns standard formatting conventions for the given currency.
    This is a suggestion that can be overridden by the user.
    """
    format_dict = get_format_as_dict(currency_code)
    return SuggestedNumberFormat(**format_dict)


class NumberFormatPreset(BaseModel):
    """Number format preset for dropdown."""

    code: str
    label: str
    decimal_separator: str
    thousands_separator: str
    currency_position: str
    decimal_places: int


@router.get("/number-format-presets", response_model=list[NumberFormatPreset])
async def list_number_format_presets(
    current_user: CurrentUserDep,
) -> list[NumberFormatPreset]:
    """Get list of number format presets for dropdown selection."""
    presets = get_preset_list()
    return [NumberFormatPreset(**p) for p in presets]


# ────────────────────────────────────────────────────────────────────────────
# Email Templates (System Level)
# ────────────────────────────────────────────────────────────────────────────


@router.get("/email-templates", response_model=EmailTemplateListResponse)
async def list_system_email_templates(
    current_user: SuperAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> EmailTemplateListResponse:
    """List all system-level email templates (super admin only)."""
    query = (
        select(EmailTemplate)
        .where(
            EmailTemplate.tenant_id.is_(None),
            EmailTemplate.conference_id.is_(None),
        )
        .order_by(EmailTemplate.template_type)
    )

    result = await paginate(db, query, page, page_size)

    items = [EmailTemplateResponse.model_validate(t) for t in result.items]

    return EmailTemplateListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
    )


@router.get("/email-templates/{template_type}", response_model=EmailTemplateResponse)
async def get_system_email_template(
    template_type: str,
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> EmailTemplateResponse:
    """Get a specific system-level email template by type."""
    if template_type not in EmailTemplateType.SYSTEM_TYPES:
        raise ValidationError(f"Invalid system template type: {template_type}")

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.tenant_id.is_(None),
            EmailTemplate.conference_id.is_(None),
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        raise NotFoundError(f"Email template '{template_type}' not found")

    return EmailTemplateResponse.model_validate(template)


@router.put("/email-templates/{template_type}", response_model=EmailTemplateResponse)
async def update_system_email_template(
    template_type: str,
    template_data: EmailTemplateUpdate,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> EmailTemplateResponse:
    """Update a system-level email template."""
    if template_type not in EmailTemplateType.SYSTEM_TYPES:
        raise ValidationError(f"Invalid system template type: {template_type}")

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.tenant_id.is_(None),
            EmailTemplate.conference_id.is_(None),
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        raise NotFoundError(f"Email template '{template_type}' not found")

    update_data = template_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    # Audit log
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.SETTINGS_UPDATE,
        resource_type="email_template",
        resource_id=template.id,
        details={"template_type": template_type, **update_data},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(template)

    return EmailTemplateResponse.model_validate(template)
