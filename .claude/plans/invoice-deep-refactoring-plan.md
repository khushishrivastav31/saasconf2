# Invoice Deep Refactoring Plan

## Status: IN PROGRESS

## Goal
Refactor `backend/app/api/v1/invoices.py` (2347 lines) into maintainable, testable architecture.

## Architecture

### Service Layer (NEW)
**File**: `backend/app/services/invoice_service.py` (~800 lines)

Extract all business logic from API endpoints into reusable functions.

### API Layer (SPLIT)
**Directory**: `backend/app/api/v1/invoices/`

Split into 4 focused files:
1. **crud.py** (~200 lines) - 7 endpoints: list, create, get, update, delete, search, preview-vat
2. **operations.py** (~300 lines) - 6 endpoints: send, cancel, replace, mark-paid, reopen, convert
3. **stripe.py** (~250 lines) - 4 endpoints: sync-all, sync-one, refund, debug
4. **pdf.py** (~150 lines) - 3 endpoints: download, preview, validate

5. **__init__.py** (~50 lines) - Router aggregation

**Total**: ~950 lines (60% reduction from 2347 lines)

## Implementation Steps

### Step 1: Create Service Layer ✅
- [x] Create `backend/app/services/__init__.py`
- [x] Create `backend/app/services/invoice_service.py`
- [x] Extract business logic functions:
  - `create_invoice_with_vat_calculation()`
  - `send_invoice_with_number_assignment()`
  - `cancel_invoice_with_credit_note()`
  - `replace_invoice_with_transfer()`
  - `sync_stripe_payment_status()`
  - etc. (12-15 functions total)

### Step 2: Create CRUD API File
- [ ] Create `backend/app/api/v1/invoices/crud.py`
- [ ] Move endpoints:
  - `list_invoices()`
  - `create_invoice()` - thin wrapper calling service
  - `get_invoice()`
  - `update_invoice()`
  - `delete_invoice()`
  - `search_recipients()`
  - `preview_vat_calculation()`

### Step 3: Create Operations API File
- [ ] Create `backend/app/api/v1/invoices/operations.py`
- [ ] Move endpoints:
  - `send_invoice()` - delegates to service
  - `cancel_invoice()` - delegates to service
  - `replace_invoice()` - delegates to service
  - `mark_invoice_paid()` - delegates to service
  - `reopen_invoice()` - delegates to service
  - `convert_to_credit_card()` - delegates to service

### Step 4: Create Stripe API File
- [ ] Create `backend/app/api/v1/invoices/stripe.py`
- [ ] Move endpoints:
  - `sync_all_stripe_payments()` - delegates to service
  - `sync_stripe_payment()` - delegates to service
  - `refund_stripe_payment()` - delegates to service
  - `debug_stripe_search()`

### Step 5: Create PDF API File
- [ ] Create `backend/app/api/v1/invoices/pdf.py`
- [ ] Move endpoints:
  - `download_invoice_pdf()`
  - `preview_invoice_pdf()`
  - `validate_invoice_zugferd()`

### Step 6: Create Router Aggregation
- [ ] Create `backend/app/api/v1/invoices/__init__.py`
- [ ] Import all sub-routers
- [ ] Combine into single router
- [ ] Maintain backward compatibility

### Step 7: Update Main Router
- [ ] Update `backend/app/api/v1/__init__.py`
- [ ] Change import from `invoices` to `invoices` (no code change needed!)

### Step 8: Testing
- [ ] Run all 53 invoice tests
- [ ] Verify no regressions
- [ ] Add service layer unit tests (NEW)
- [ ] Update test imports if needed

### Step 9: Documentation
- [x] Create `backend/app/api/v1/invoices/README.md`
- [ ] Update `.claude/docs/invoices.md` with new architecture
- [ ] Add docstrings to all service functions
- [ ] Add examples to README

## Benefits

### Code Quality
- **60% reduction** in line count (2347 → ~950 lines)
- **Clear separation** of concerns (API vs business logic)
- **Reusable** business logic across contexts
- **Easier testing** (unit tests for service, integration for API)

### Maintainability
- **Focused files** (~150-300 lines each)
- **Single responsibility** per file
- **Easier navigation** (IDE, code review)
- **Clearer intent** (file names describe purpose)

### Performance
- **Better IDE performance** (smaller files)
- **Faster compilation** (Python imports)
- **Parallel development** (fewer merge conflicts)

## Testing Strategy

### Unit Tests (Service Layer) - NEW
```python
# tests/services/test_invoice_service.py
async def test_create_invoice_calculates_vat_germany():
    """Test VAT calculation for German company."""
    # Test service function directly (no HTTP)
    invoice = await create_invoice_with_vat_calculation(
        db=db,
        invoice_data=invoice_data,
        conference=conference,
    )
    assert invoice.tax_rate == Decimal("19.00")
    assert invoice.vat_auto_calculated is True
```

### Integration Tests (API Layer) - EXISTING
```python
# tests/test_invoices.py (no changes needed!)
async def test_create_invoice_success(client):
    response = await client.post("/api/v1/conferences/{id}/invoices", json={...})
    assert response.status_code == 201
    assert response.json()["tax_rate"] == "19.00"
```

## Migration Path

### Phase 1: Parallel Implementation
1. Create new structure alongside old
2. Keep old `invoices.py` as fallback
3. Test new structure thoroughly

### Phase 2: Cutover
1. Update imports to use new structure
2. Run full test suite
3. Monitor for issues

### Phase 3: Cleanup
1. Delete old `invoices.py`
2. Update documentation
3. Celebrate! 🎉

## Rollback Strategy

If issues arise:
1. Revert import changes in `backend/app/api/v1/__init__.py`
2. Old `invoices.py` still exists as backup
3. All tests still passing means safe to proceed

## Timeline Estimate

- **Step 1 (Service Layer)**: 2-3 hours
- **Steps 2-5 (Split API)**: 3-4 hours
- **Steps 6-7 (Router)**: 30 minutes
- **Step 8 (Testing)**: 1-2 hours
- **Step 9 (Docs)**: 1 hour

**Total**: 8-10 hours of focused work

## Current Progress

- [x] Phase 1 & 2 complete (security fixes, helper extraction)
- [x] Documentation created
- [ ] Service layer implementation (IN PROGRESS)
- [ ] API split (PENDING)
- [ ] Testing (PENDING)

## Next Steps

**Option A**: Continue full refactoring now (8-10 hours)
**Option B**: Commit Phases 1 & 2, tackle this separately
**Option C**: Create service layer skeleton + 1 example, then decide

Recommendation: **Option C** - Show the pattern with one complete example, then user can decide.
