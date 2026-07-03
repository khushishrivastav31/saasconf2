# MAIN-13427: Tasks

> Backend schema change (no migration — line_items is JSONB) + frontend editor
> change. Touches invoice creation/update request/response shape → **OpenAPI
> regeneration required**. User-visible (new input on invoice editor) → handbook
> update required.

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval before
      writing any test or implementation code.**

## RED — tests first

Backend (`backend/tests/invoices/test_invoice_line_item_discount.py`):
- [ ] Line item with `discount_percentage` computes correct `total` on create.
- [ ] Line item with both `discount` and `discount_percentage` set is rejected
      (422) with a clear message.
- [ ] `discount_percentage` outside `[0, 100]` is rejected.
- [ ] Training invoice creation path accepts and computes the same way (whichever
      router/service training invoices go through).
- [ ] ZUGFeRD export of an invoice with a percentage-discounted line item still
      passes existing EN16931 XML validation, with the derived discount amount
      correct.
- [ ] Run and confirm they fail for the right reason (field doesn't exist yet).

Frontend (`frontend/src/pages/ConferenceDetail/tabs/InvoicesTab/__tests__/` or
sibling):
- [ ] Entering an amount-based discount (existing "Discount (amount)" field)
      still computes the expected line total (no regression).
- [ ] Entering a percentage discount computes the expected line total and
      updates invoice subtotal/total.
- [ ] Setting discount % clears the amount-based discount input and vice versa.

## GREEN — implementation

- [ ] Add `discount_percentage` field + `model_validator` to `InvoiceLineItem`
      (`backend/app/schemas/invoice.py`).
- [ ] Update total-calculation formula per `design.md` in whatever server path
      (if any) computes/validates it; decide scope per design.md's trust-boundary
      note (recommend minimal option — validate exclusivity only).
- [ ] Update `app/core/zugferd/xml.py` line-item discount serialization to derive
      absolute amount from `discount_percentage` when set.
- [ ] Add "Discount %" input to `InvoiceLineItemsEditor.tsx` and training
      `LineItemsEditor.tsx`; relabel existing "Discount" input to
      "Discount (amount)"; update `useInvoiceCreateForm.ts` (and training
      equivalent) total calculation.
- [ ] Update `frontend/src/types/invoice.ts` and training `types.ts`.
- [ ] Re-run targeted tests → green.

## REFACTOR

- [ ] Confirm no duplicated total-calculation logic between frontend hooks;
      extract a shared helper if the conference and training editors diverge
      more than cosmetically.

## Verify (full sweep)

- [ ] `venv/bin/python -m pytest tests/invoices/ -v`
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] Full sweep: backend `pytest tests/ -n 4 -q`, frontend `pnpm test`
- [ ] `JWT_SECRET_KEY=test-secret-key-for-ci-pipeline-minimum-32-chars
      SUPER_ADMIN_PASSWORD=TestPassword123! pnpm gen:api` then `pnpm gen:api:check`
      clean (invoice schema changed).
- [ ] Update `frontend/src/pages/Handbook/handbookSections.tsx` — document the
      new percentage-discount option on invoice line items.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `feat(invoices): support percentage-based discounts on
      line items (MAIN-13427)`; PR per workflow, `--auto --squash` once green.
