# Invoice Module Architecture

## Overview

The invoice module has been refactored from a single 2347-line file into a modular, maintainable architecture following industry best practices.

## Architecture Pattern

**Service Layer + Modular API Endpoints**

```
backend/app/
├── api/v1/invoices/
│   ├── __init__.py         # Router aggregation (exports combined router)
│   ├── crud.py             # CRUD operations (list, create, get, update, delete)
│   ├── operations.py       # Business operations (send, cancel, replace, mark_paid, reopen)
│   ├── stripe.py           # Stripe integration (sync, refund, convert)
│   └── pdf.py              # PDF operations (download, preview, validate)
│
└── services/
    └── invoice_service.py  # Business logic layer (extracted from API)
```

## Design Principles

### 1. Separation of Concerns
- **API Layer** (invoices/*.py): Thin endpoints handling HTTP concerns (validation, auth, serialization)
- **Service Layer** (services/invoice_service.py): Business logic (calculations, workflows, orchestration)
- **Data Layer** (models/invoice.py): Database models and relationships

### 2. Single Responsibility
Each file has a clear, focused purpose:
- `crud.py`: Standard CRUD operations only
- `operations.py`: Invoice lifecycle operations (send, cancel, etc.)
- `stripe.py`: Payment processing integration
- `pdf.py`: Document generation and validation

### 3. Testability
- Service layer functions are pure business logic (easy to unit test)
- API endpoints are thin wrappers (easy to integration test)
- Dependencies injected via parameters (no hidden state)

## File Structure

### crud.py (~200 lines)
**Endpoints**: 7 endpoints
- `GET /` - List invoices with pagination and filters
- `POST /` - Create new invoice
- `GET /search-recipients` - Search sponsors/registrations for billing
- `POST /preview-vat` - Preview VAT calculation without saving
- `GET /{id}` - Get invoice by ID
- `PUT /{id}` - Update invoice (draft only, sent/paid limited)
- `DELETE /{id}` - Delete invoice (draft only)

**Pattern**: Simple CRUD, minimal business logic

### operations.py (~300 lines)
**Endpoints**: 6 endpoints
- `POST /{id}/send` - Send or resend invoice email
- `POST /{id}/cancel` - Cancel invoice with credit note
- `POST /{id}/replace` - Replace invoice (billing correction)
- `POST /{id}/mark-paid` - Manually mark as paid (bank transfer)
- `POST /{id}/reopen` - Reopen cancelled/paid invoice
- `POST /{id}/convert-to-credit-card` - Convert bank_transfer to credit_card

**Pattern**: Complex workflows delegated to service layer

### stripe.py (~250 lines)
**Endpoints**: 4 endpoints
- `POST /sync-all-payments` - Sync all Stripe payments for conference
- `POST /{id}/sync-payment` - Sync single invoice payment status
- `POST /{id}/refund` - Refund Stripe payment
- `GET /{id}/debug-stripe-search` - Debug Stripe payment search (dev only)

**Pattern**: External API integration with error handling

### pdf.py (~150 lines)
**Endpoints**: 3 endpoints
- `GET /{id}/pdf` - Download invoice PDF
- `POST /{id}/preview-pdf` - Preview PDF in browser
- `POST /{id}/validate-zugferd` - Validate ZUGFeRD compliance

**Pattern**: Document generation with caching

### invoice_service.py (~800 lines)
**Functions**: Core business logic extracted from API layer

**Invoice Creation**:
- `create_invoice_with_vat_calculation()` - Create invoice with automatic VAT
- `validate_recipient_fields()` - Validate required billing fields

**Invoice Operations**:
- `send_invoice_with_number_assignment()` - Send invoice with PDF and email
- `cancel_invoice_with_credit_note()` - Cancel and create credit note
- `replace_invoice_with_transfer()` - Replace invoice, transfer registrations
- `mark_invoice_paid_manually()` - Mark bank transfer as paid
- `reopen_invoice_to_sent()` - Reopen cancelled/paid invoice

**Stripe Operations**:
- `sync_stripe_payment_status()` - Sync single invoice
- `sync_all_stripe_payments_for_conference()` - Bulk sync
- `refund_stripe_payment_for_invoice()` - Issue refund
- `convert_invoice_to_credit_card()` - Change payment method

**Benefits**:
- Reusable across different API endpoints
- Easy to unit test (no HTTP dependencies)
- Clear separation of business rules
- Consistent error handling

## Migration Guide

### Old Import
```python
from app.api.v1.invoices import router
```

### New Import
```python
from app.api.v1.invoices import router  # Same interface!
```

**No changes required** - the aggregated router in `__init__.py` maintains backward compatibility.

### Calling Service Layer Directly

If you need to call invoice business logic from other parts of the codebase:

```python
from app.services.invoice_service import send_invoice_with_number_assignment

# Example: Send invoice from background job
async def background_invoice_sender(invoice_id: UUID):
    async with async_session_maker() as db:
        invoice = await get_invoice_with_events(db, invoice_id, ...)
        conference = await get_conference_for_tenant(db, ...)

        await send_invoice_with_number_assignment(
            db=db,
            invoice=invoice,
            conference=conference,
            tenant_id=tenant_id,
            user_id=user_id,
        )
        await db.commit()
```

## Testing Strategy

### Unit Tests (Service Layer)
Test business logic in isolation:

```python
# tests/services/test_invoice_service.py
async def test_create_invoice_calculates_vat():
    # Test VAT calculation logic without HTTP
    invoice = await create_invoice_with_vat_calculation(...)
    assert invoice.tax_rate == Decimal("19.00")
```

### Integration Tests (API Layer)
Test endpoints end-to-end:

```python
# tests/test_invoices.py (existing tests still work!)
async def test_create_invoice_success(client):
    response = await client.post("/api/v1/conferences/{id}/invoices", json={...})
    assert response.status_code == 201
```

## Performance Considerations

### Before Refactoring
- Single 2347-line file
- Hard to navigate and maintain
- Business logic mixed with HTTP concerns
- Difficult to test individual operations

### After Refactoring
- 5 focused files (~150-300 lines each)
- Clear separation of concerns
- Reusable business logic
- Easy to test and maintain
- Better IDE performance (smaller files)

## Error Handling

All service layer functions follow consistent error handling:

```python
# Service layer raises domain exceptions
from app.core.exceptions import ValidationError, NotFoundError, ConflictError

# API layer catches and converts to HTTP responses
try:
    result = await service_function(...)
except ValidationError as e:
    raise HTTPException(status_code=400, detail=str(e))
except NotFoundError as e:
    raise HTTPException(status_code=404, detail=str(e))
```

## Authorization

All API endpoints use consistent authorization:

```python
# All endpoints call this helper first
await _require_invoice_admin(db, current_user, conference_id)
```

Authorization is NOT in the service layer (API concern only).

## Audit Logging

Service layer functions return data; API layer handles audit logging:

```python
# Service layer
async def cancel_invoice_with_credit_note(...) -> tuple[Invoice, Invoice]:
    # Business logic only
    return cancelled_invoice, credit_note

# API layer
@router.post("/{invoice_id}/cancel")
async def cancel_invoice(...):
    await _require_invoice_admin(db, current_user, conference_id)

    cancelled, credit_note = await cancel_invoice_with_credit_note(...)

    # API layer handles audit logging
    audit_log = create_invoice_audit_log(...)
    db.add(audit_log)

    await db.commit()
    return build_invoice_response(cancelled)
```

## Future Enhancements

Potential improvements for future iterations:

1. **Caching Layer**: Add Redis caching for frequently accessed invoices
2. **Event Sourcing**: Track all invoice state changes as events
3. **Async Processing**: Move heavy operations (PDF generation, email) to background tasks
4. **API Versioning**: Support v2 API with breaking changes while maintaining v1
5. **GraphQL**: Add GraphQL endpoint for flexible invoice queries

## Questions?

See `.claude/docs/invoices.md` for invoice-specific documentation or `CLAUDE.md` for general project guidelines.
