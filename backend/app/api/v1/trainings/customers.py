"""Customer CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, literal, select

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.search import unaccent_ilike
from app.models.audit import AuditLog
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["customers"])


def _tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return Customer.tenant_id == current_user.tenant_id


@router.get("", response_model=dict)
async def list_customers(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
) -> dict:
    """List customers with pagination and search."""
    base = select(Customer).where(_tenant_filter(current_user))

    if search:
        base = base.where(
            unaccent_ilike(Customer.name, search)
            | unaccent_ilike(Customer.contact_person, search)
            | unaccent_ilike(Customer.email, search)
        )
    if is_active is not None:
        base = base.where(Customer.is_active == is_active)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    items_q = base.order_by(Customer.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(items_q)
    items = [CustomerResponse.model_validate(c) for c in result.scalars().all()]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> CustomerResponse:
    """Get a single customer."""
    result = await db.execute(select(Customer).where(Customer.id == customer_id, _tenant_filter(current_user)))
    customer = result.scalar_one_or_none()
    if not customer:
        raise NotFoundError("Customer not found")
    return CustomerResponse.model_validate(customer)


@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    data: CustomerCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CustomerResponse:
    """Create a new customer."""
    customer = Customer(tenant_id=current_user.tenant_id, **data.model_dump())
    db.add(customer)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="customer.create",
        resource_type="customer",
        details={"name": data.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: UUID,
    data: CustomerUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CustomerResponse:
    """Update a customer."""
    result = await db.execute(select(Customer).where(Customer.id == customer_id, _tenant_filter(current_user)))
    customer = result.scalar_one_or_none()
    if not customer:
        raise NotFoundError("Customer not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(customer, key, value)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="customer.update",
        resource_type="customer",
        resource_id=customer_id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a customer (only if no inhouse trainings linked)."""
    from app.models.inhouse_training import InhouseTraining

    result = await db.execute(select(Customer).where(Customer.id == customer_id, _tenant_filter(current_user)))
    customer = result.scalar_one_or_none()
    if not customer:
        raise NotFoundError("Customer not found")

    # Check for linked inhouse trainings
    count_result = await db.execute(select(func.count()).where(InhouseTraining.customer_id == customer_id))
    if (count_result.scalar() or 0) > 0:
        raise ValidationError("Cannot delete customer with linked inhouse trainings")

    await db.delete(customer)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="customer.delete",
        resource_type="customer",
        resource_id=customer_id,
        details={"name": customer.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    return {"message": "Customer deleted"}
