# Invoice System - Complete Guide

## Table of Contents
1. [Invoice Lifecycle](#invoice-lifecycle)
2. [Core Modules](#core-modules)
3. [Stripe Payment Integration](#stripe-payment-integration)
4. [Email System](#email-system)
5. [PDF Generation](#pdf-generation)
6. [API Endpoints](#api-endpoints)
7. [Frontend Components](#frontend-components)

---

## Invoice Lifecycle

### Status Flow
```
draft → sent → paid
  ↓      ↓       ↓
deleted  ↓   cancelled (with credit note)
       overdue
         ↓
      reopened → sent
```

### Template Types
1. **`invoice`** - Standard invoice (default)
2. **`bank_transfer`** - Payment via bank transfer (manual reconciliation)
3. **`credit_card`** - Payment via Stripe (automatic reconciliation)
4. **`credit_note`** - Negative invoice for cancellations (immutable, cannot be deleted)

### Key Business Rules
- **Draft invoices**: Fully editable, can be deleted, no invoice number
- **Sent/Overdue invoices**: Read-only except status changes, cannot be deleted
- **Paid invoices**: Can be reopened (back to `sent`) or cancelled (creates credit note + refund)
- **Cancelled invoices**: Immutable, linked to credit note via `related_invoice_id`
- **Credit notes**: Auto-generated on cancel, status always `sent`, cannot be deleted

### Bulk-cancel-with-credit-note (conference + training)
For mass cleanup of bot/script registrations after the fact. Two parallel surfaces:
- **Conference**: `POST /api/v1/conferences/{conference_id}/registrations/bulk-cancel/{preview,confirm}` — orchestrator at `app/api/v1/registrations/bulk_cancel.py`. Reuses `cancel_registrations_for_invoice`, `create_credit_note_for_invoice`, `generate_cancellation_number`, `deactivate_payment_link_for_invoice`, `refund_payment`, `send_invoice_email`. Deduplicates by `billing_profile_id` (a multi-attendee submission produces ONE credit note for the bundled invoice, not N).
- **Training**: `POST /api/v1/trainings/registrations/bulk-cancel/{preview,confirm}` — orchestrator at `app/api/v1/trainings/bulk_cancel.py`. Reuses the per-attendee cancel path's primitives (`build_credit_note`, `generate_training_invoice_number`, etc.). One credit note per matching `TrainingRegistration` (training reg's 1:1 reg-to-invoice shape).

Both endpoints share `app/schemas/bulk_cancel.py` (`RegistrationBulkCancelFilter` + preview/result types) and the same frontend dialog (`frontend/src/components/trainings/BulkCancelDialog.tsx`, parameterized via `previewUrl` + `confirmUrl` props). Cap is `MAX_BULK_CANCEL = 500` per call; the filter enforces it on the unrestricted match count so a forged `registration_ids` subset can't sidestep it. `TenantAdminDep` gates both — conference admins are NOT permitted (consistent with single-cancel).

Conference-side caveat: `billing_email_pattern` is unsupported and returns 400, because `BillingProfile.contact_email` is PII-encrypted at rest and ILIKE can't be evaluated in SQL. Use `originating_ip` + time window instead.

---

## Core Modules

### Helper Modules (Refactored Architecture)

#### 1. **invoice_queries.py** - Database Query Helpers
```python
# Fetch invoice with validation and eager-loaded events
invoice = await get_invoice_with_events(db, invoice_id, conference_id, tenant_id)
# Raises NotFoundError if not found

# Re-query after commit (safer than db.refresh)
invoice = await refresh_invoice_with_events(db, invoice_id)
```

**Why**: Replaces 11+ duplicated query patterns, ensures consistent event loading, prevents MissingGreenlet errors.

#### 2. **invoice_audit.py** - Audit Log Creation
```python
audit_log = create_invoice_audit_log(
    tenant_id=current_user.tenant_id,
    user_id=current_user.user_id,
    action="invoice.sent",
    invoice=invoice,
    details={"recipient_email": invoice.recipient_email},
    request=request,
)
db.add(audit_log)
```

**Why**: Standardizes audit log creation, auto-includes invoice_number, extracts IP/user agent.

#### 3. **invoice_validation.py** - Field Validation
```python
# Validates: name, address, city, postal code, country
validate_recipient_fields(invoice_data)
# Raises HTTPException 400 with list of missing fields
```

**Why**: Used in create + update endpoints, ensures required fields before sending.

#### 4. **invoice_email.py** - Email Operations
```python
# Complete email workflow: generate PDF + build HTML + send
email_sent = await send_invoice_email(
    db=db,
    invoice=invoice,
    conference=conference,
    payment_link_url="https://...",  # Optional
    custom_subject="...",  # Optional
    custom_message="<p>...</p>",  # Optional
)
```

**Functions**:
- `send_invoice_email()` - Full workflow (PDF generation → email sending)
- `build_invoice_email_html()` - HTML with payment link button
- `build_pdf_attachment()` - PDF → base64 attachment dict

**Why**: Eliminates 45 lines of duplication across 3 endpoints (send, cancel, convert).

#### 5. **invoice_operations.py** - Business Logic
```python
# Create credit note with negated amounts
credit_note = create_credit_note_for_invoice(
    invoice=original_invoice,
    credit_note_number="CN-2024-00001",
    tenant_id=tenant_id,
    conference_id=conference_id,
)
```

**Why**: Centralizes credit note creation logic (40 lines), used in cancel endpoint.

#### 6. **stripe_helper.py** - Stripe Operations (Enhanced)
```python
# Create payment link (returns None for payment_intent_id, URL for link)
payment_intent_id, payment_link_url = await create_payment_link(...)

# Find payment intent using 3-tier discovery
payment_intent = await find_payment_intent_for_invoice(invoice, stripe_client, "[SYNC] ")

# Issue refund
refund_result = await refund_payment(db, conference, invoice, current_user)

# Deactivate payment link
success = await deactivate_payment_link_for_invoice(invoice, conference)
```

**Why**: Replaces 130+ lines of duplicated Stripe logic across sync endpoints.

---

## Stripe Payment Integration

### Overview
Stripe integration enables credit card payments for invoices via **Payment Links** (hosted payment pages).

### Architecture

#### Payment Flow
```
1. User creates invoice (template_type = "credit_card")
2. User clicks "Send Invoice"
3. Backend creates Stripe Payment Link
4. Email sent with "Pay Online" button
5. Customer clicks button → Stripe checkout page
6. Customer pays → Stripe creates PaymentIntent automatically
7. Webhook notifies backend → Invoice status → "paid"
```

#### Key Concept: Payment Link vs PaymentIntent
- **Payment Link**: Reusable URL to Stripe-hosted checkout page
- **PaymentIntent**: Created automatically when customer pays via Payment Link
- **Why this matters**: Payment Link doesn't have PaymentIntent ID upfront, only after payment

### Configuration

**Stripe Settings** (`conference.settings["stripe"]`):
```python
{
    "is_enabled": true,
    "secret_key": "sk_live_...",  # Stripe API key
    "publishable_key": "pk_live_...",  # For client-side (future use)
    "webhook_secret": "whsec_..."  # For webhook signature verification
}
```

**Setup Steps**:
1. Create Stripe account at stripe.com
2. Get API keys from Stripe Dashboard → Developers → API keys
3. Configure webhook:
   - URL: `https://your-domain.com/api/v1/stripe/webhook`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`
   - Copy webhook secret
4. Enter keys in SaaSConf: Settings → Stripe Setup

### Stripe Helper Functions

#### 1. `create_payment_link()`
Creates Stripe Payment Link for invoice.

**Flow**:
```python
# 1. Validate Stripe is enabled
client = get_stripe_client(conference)

# 2. Create Payment Link
payment_link = stripe.PaymentLink.create(
    line_items=[{
        "price_data": {
            "currency": invoice.currency.lower(),
            "product_data": {"name": f"Invoice {invoice.invoice_number}"},
            "unit_amount": int(invoice.total * 100),  # Convert to cents
        },
        "quantity": 1,
    }],
    metadata={
        "system": "saasconf",
        "invoice_id": str(invoice.id),
    },
    payment_intent_data={
        "metadata": {
            "system": "saasconf",
            "tenant_id": str(invoice.tenant_id),
            "conference_id": str(invoice.conference_id),
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "template_type": invoice.template_type,
        }
    },
)

# 3. Log event
await log_invoice_event(..., event_type=PAYMENT_LINK_CREATED, stripe_object_id=payment_link.id)

# 4. Return
return (None, payment_link.url)  # PaymentIntent created when customer pays
```

**Important**: `payment_intent_data` passes metadata to the auto-created PaymentIntent. This is critical for syncing.

#### 2. `find_payment_intent_for_invoice()` (3-Tier Discovery)
Finds PaymentIntent for invoice using multiple strategies.

**Strategy 1: Stored ID Retrieval**
```python
if invoice.stripe_payment_intent_id:
    payment_intent = stripe.PaymentIntent.retrieve(invoice.stripe_payment_intent_id)
```

**Strategy 2: Metadata Search** (handles converted invoices)
```python
search_query = f'metadata["invoice_id"]:"{invoice.id}" AND status:"succeeded"'
search_results = stripe.PaymentIntent.search(query=search_query, limit=1)
if search_results.data:
    payment_intent = search_results.data[0]
    invoice.stripe_payment_intent_id = payment_intent.id  # Update stored ID
```

**Strategy 3: Payment Link Traversal** (handles old links without metadata)
```python
# Find payment link ID from events
payment_link_event = next(e for e in invoice.events if e.event_type == PAYMENT_LINK_CREATED)

# Get checkout sessions for this link
sessions = stripe.checkout.Session.list(payment_link=payment_link_event.stripe_object_id)

# Find completed session with succeeded payment
for session in sessions.data:
    if session.payment_intent and session.status == "complete":
        pi = stripe.PaymentIntent.retrieve(session.payment_intent)
        if pi.status == "succeeded":
            payment_intent = pi
            invoice.stripe_payment_intent_id = pi.id
```

**Why 3 tiers**: Handles edge cases (converted invoices, old payment links, metadata migration).

#### 3. `refund_payment()`
Issues Stripe refund for paid credit card invoice.

**Flow**:
```python
# 1. Log refund initiation
await log_invoice_event(..., event_type=REFUND_INITIATED, status="pending")

# 2. Create Stripe refund
refund = stripe.Refund.create(
    payment_intent=invoice.stripe_payment_intent_id,
    reason="requested_by_customer",
    amount=int(amount * 100) if amount else None,  # Partial or full
    metadata={...},
    idempotency_key=f"refund-{invoice.id}-{timestamp}",
)

# 3. Log result
await log_invoice_event(..., event_type=REFUND_SUCCEEDED, stripe_object_id=refund.id)

# 4. Return details
return {
    "refund_id": refund.id,
    "status": refund.status,
    "amount": Decimal(refund.amount) / 100,
    "currency": refund.currency.upper(),
}
```

**Error Handling**: Logs `REFUND_FAILED` event on exception, raises ValidationError with Stripe error message.

#### 4. `deactivate_payment_link_for_invoice()`
Deactivates Stripe Payment Link when invoice is cancelled.

**Flow**:
```python
# 1. Find payment link ID from events
payment_link_event = next(e for e in invoice.events if e.event_type == PAYMENT_LINK_CREATED)

# 2. Deactivate link
stripe.PaymentLink.modify(payment_link_event.stripe_object_id, active=False)
```

**Why**: Prevents customer from paying after invoice cancellation.

### Invoice Event Logging

**Event Types** (13 total):
```python
# Payment
PAYMENT_LINK_CREATED = "payment_link_created"
PAYMENT_SUCCEEDED = "payment_succeeded"
PAYMENT_FAILED = "payment_failed"

# Refund
REFUND_INITIATED = "refund_initiated"
REFUND_SUCCEEDED = "refund_succeeded"
REFUND_FAILED = "refund_failed"

# Invoice
INVOICE_SENT = "invoice_sent"
INVOICE_CANCELLED = "invoice_cancelled"

# Management
CONVERTED_TO_CREDIT_CARD = "converted_to_credit_card"
MANUAL_PAYMENT_RECORDED = "manual_payment_recorded"
INVOICE_REOPENED = "invoice_reopened"
```

**Event Model** (`invoice_events` table):
```python
class InvoiceEvent(Base):
    id: UUID
    tenant_id: UUID  # Multi-tenancy
    invoice_id: UUID  # FK to invoices
    event_type: String(100)  # From enum above
    status: String(50)  # succeeded, failed, pending, cancelled

    # Stripe identification
    stripe_object_id: String(255)  # payment_intent_id, refund_id, etc.
    stripe_object_type: String(50)  # payment_intent, refund, charge, payment_link
    stripe_idempotency_key: String(255)  # For retry safety

    # Financial
    amount: Decimal(10, 2)
    currency: String(3)

    # User context
    user_id: UUID
    user_email: String(255)

    # Debug/metadata
    metadata: JSON  # Flexible additional data
    error_message: Text  # For failed events

    created_at: DateTime
```

**Indexes**: `invoice_id`, `stripe_object_id`, `event_type`, `created_at`

### Webhook Handling

**Endpoint**: `POST /api/v1/stripe/webhook` (public, no auth)

**Security**:
```python
# Verify Stripe signature
try:
    event = stripe.Webhook.construct_event(
        payload=await request.body(),
        sig_header=request.headers.get("Stripe-Signature"),
        secret=webhook_secret,
    )
except stripe.error.SignatureVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
```

**Handled Events**:

1. **`payment_intent.succeeded`**
```python
# 1. Find invoice by metadata
invoice = await find_invoice_by_stripe_metadata(payment_intent.metadata)

# 2. Update invoice status
invoice.status = "paid"
invoice.stripe_payment_intent_id = payment_intent.id

# 3. Log event
await log_invoice_event(..., event_type=PAYMENT_SUCCEEDED, stripe_object_id=payment_intent.id)

# 4. Commit
await db.commit()
```

2. **`payment_intent.payment_failed`**
```python
await log_invoice_event(
    ...,
    event_type=PAYMENT_FAILED,
    status="failed",
    error_message=payment_intent.last_payment_error.message,
)
```

3. **`charge.succeeded`**
```python
# Capture charge_id for record-keeping
invoice.stripe_charge_id = charge.id
```

### Manual Sync Operations

For cases when webhooks fail or aren't configured:

#### 1. **Single Invoice Sync**
`POST /conferences/{id}/invoices/{invoice_id}/sync-stripe-payment`

```python
# 1. Find payment intent (3-tier discovery)
payment_intent = await find_payment_intent_for_invoice(invoice, stripe_client)

# 2. Update invoice if payment succeeded
if payment_intent.status == "succeeded" and invoice.status != "paid":
    invoice.status = "paid"
    invoice.stripe_charge_id = payment_intent.latest_charge

    await log_invoice_event(..., event_type=PAYMENT_SUCCEEDED)
```

#### 2. **Bulk Sync**
`POST /conferences/{id}/invoices/sync-stripe-payments`

```python
# 1. Find all pending credit card invoices
invoices = await db.execute(
    select(Invoice).where(
        Invoice.conference_id == conference_id,
        Invoice.template_type == "credit_card",
        Invoice.status.in_(["sent", "overdue"]),
    )
)

# 2. Sync each invoice
for invoice in invoices:
    payment_intent = await find_payment_intent_for_invoice(invoice, stripe_client, "[SYNC] ")
    if payment_intent and payment_intent.status == "succeeded":
        # Update invoice...
```

**Returns**: `{total_checked, updated_to_paid, payment_failures_logged, errors: []}`

### Bidirectional Identification

**SaaSConf → Stripe** (via metadata):
```python
{
    "system": "saasconf",
    "tenant_id": "uuid",
    "conference_id": "uuid",
    "invoice_id": "uuid",
    "invoice_number": "2024-00001",
    "template_type": "credit_card",
}
```

**Stripe → SaaSConf** (via stored IDs):
```python
class Invoice:
    stripe_payment_intent_id: str  # pi_...
    stripe_charge_id: str  # ch_...
    stripe_payment_link_url: str  # https://buy.stripe.com/...
```

**Events table**:
```python
stripe_object_id: str  # ID from Stripe (pi_, re_, ch_, plink_)
stripe_object_type: str  # payment_intent, refund, charge, payment_link
```

---

## Email System

### Email Workflow

#### 1. **Send Invoice** (`POST /{invoice_id}/send`)
```python
# Draft → Sent transition
if invoice.status == "draft":
    # 1. Validate required fields
    validate_recipient_fields(invoice)

    # 2. Generate invoice number
    invoice.invoice_number = await generate_invoice_number(...)
    invoice.status = "sent"
    invoice.issue_date = today()

    # 3. Create payment link (credit card only)
    if invoice.template_type == "credit_card":
        payment_intent_id, payment_link_url = await create_payment_link(...)
        invoice.stripe_payment_link_url = payment_link_url

    # 4. Send email with PDF
    email_sent = await send_invoice_email(
        db=db,
        invoice=invoice,
        conference=conference,
        payment_link_url=payment_link_url,
    )

    # 5. Log event
    await log_invoice_event(..., event_type=INVOICE_SENT)

# Resend (sent/overdue)
else:
    # Use existing payment link
    payment_link_url = invoice.stripe_payment_link_url

    await send_invoice_email(...)
    await log_invoice_event(..., event_type=INVOICE_SENT, metadata={"is_resend": True})
```

#### 2. **Send Email Implementation**
```python
async def send_invoice_email(
    db, invoice, conference,
    payment_link_url=None,
    custom_subject=None,
    custom_message=None,
):
    # 1. Generate PDF
    pdf_bytes = await generate_invoice_pdf(invoice, conference, db)

    # 2. Build attachment
    attachment = {
        "filename": f"invoice_{invoice.invoice_number}.pdf",
        "content": base64.b64encode(pdf_bytes).decode("ascii"),
    }

    # 3. Build HTML (with payment button if applicable)
    is_credit_note = invoice.template_type == "credit_note"
    doc_label = "Credit Note" if is_credit_note else "Invoice"

    if custom_message:
        html = f"<p>{custom_message}</p>"
    else:
        html = f"<p>Please find attached {doc_label.lower()} {invoice.invoice_number}.</p>"

    if payment_link_url:
        html += '''
        <p><a href="{url}" style="display: inline-block; padding: 10px 20px;
           background-color: #0066cc; color: white; text-decoration: none;
           border-radius: 5px; margin-top: 10px;">Pay Online</a></p>
        '''.format(url=payment_link_url)

    # 4. Send email
    subject = custom_subject or f"{doc_label} {invoice.invoice_number}"
    return await send_email(
        to=invoice.recipient_email,
        subject=subject,
        html=html,
        attachments=[attachment],
    )
```

#### 3. **Email for Credit Note** (cancel endpoint)
```python
# After creating credit note
if credit_note.recipient_email:
    with contextlib.suppress(Exception):
        await send_invoice_email(
            db=db,
            invoice=credit_note,
            conference=conference,
            custom_message=(
                f"Please find attached the credit note {credit_note.invoice_number} "
                f"for invoice {original_invoice.invoice_number}."
            ),
        )
```

#### 4. **Email for Converted Invoice** (bank transfer → credit card)
```python
# After converting to credit card
if invoice.recipient_email and payment_link_url:
    await send_invoice_email(
        db=db,
        invoice=invoice,
        conference=conference,
        payment_link_url=payment_link_url,
        custom_subject=f"Payment Link for Invoice {invoice.invoice_number}",
        custom_message=(
            f"<p>Your invoice {invoice.invoice_number} can now be paid online.</p>"
            f"<p>Please find the invoice attached, or use the button below to pay by credit card:</p>"
        ),
    )
```

### Email Configuration

**SMTP Settings** (environment variables):
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@yourcompany.com
SMTP_FROM_NAME=YourCompany Billing
```

**Email Helper** (`app/core/email.py`):
```python
async def send_email(
    to: str,
    subject: str,
    html: str,
    attachments: list[dict] = None,
) -> bool:
    # Uses aiosmtplib for async SMTP
    # Supports HTML content
    # Base64-encoded attachments
```

---

## PDF Generation

### Overview
Uses **WeasyPrint** for HTML → PDF conversion with full CSS support.

### Entry Points

1. **`generate_invoice_pdf(invoice, conference, db)`**
   - Real invoices from database
   - Input: Invoice model
   - Returns: PDF bytes

2. **`generate_invoice_pdf_from_data(invoice_data, settings, conference, db)`**
   - Preview/testing
   - Input: Dict with invoice data
   - Returns: PDF bytes

### Template Pipeline

```python
# 1. Load template HTML
template_html = conference.settings["invoice_template_html"]
footer_html = conference.settings["invoice_footer_html"]
header_html = conference.settings["invoice_header_html"]

# 2. Build replacements dict (40+ placeholders)
replacements = {
    "[INVOICE_NUMBER]": invoice.invoice_number,
    "[COMPANY_NAME]": company_info["name"],
    "[TOTAL]": format_amount(invoice.total, settings),
    # ... 40+ more
}

# 3. Apply placeholders to all sections
body_html = _apply_placeholders(template_html, replacements)
footer_html = _apply_placeholders(footer_html, replacements)
header_html = _apply_placeholders(header_html, replacements)

# 4. Special handling for [ITEMS_TABLE]
body_html = _replace_items_placeholder(body_html, invoice.line_items, ...)

# 5. Normalize TipTap output
body_html = _normalize_table_widths(body_html)  # px → %
body_html = _normalize_image_widths(body_html)  # Scale images

# 6. Wrap in full HTML doc
html = f'''
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>{EDITOR_MATCHING_CSS}</style>
</head>
<body>
    <div class="page-header">{header_html}</div>
    <div class="content">{body_html}</div>
    <div class="page-footer">{footer_html}</div>
</body>
</html>
'''

# 7. Generate PDF
pdf_bytes = await _generate_pdf_with_weasyprint(html, page_size, orientation)
```

### Placeholder Categories

**Company** (9 placeholders):
```
[COMPANY_NAME], [COMPANY_ADDRESS], [COMPANY_CITY], [COMPANY_POSTAL_CODE],
[COMPANY_COUNTRY], [COMPANY_VAT], [COMPANY_TAX_ID], [COMPANY_TAX_SYSTEM],
[COMPANY_LOGO]
```

**Fiscal Representative** (6 placeholders):
```
[FISCAL_REP_NAME], [FISCAL_REP_ADDRESS], [FISCAL_REP_CITY],
[FISCAL_REP_POSTAL_CODE], [FISCAL_REP_COUNTRY], [FISCAL_REP_VAT]
```

**Banking** (3 placeholders):
```
[BANK_NAME], [IBAN], [BIC]
```
*Resolved from `bank_accounts[]` array (uses `is_default: true`) or legacy fields*

**Invoice** (7 placeholders):
```
[INVOICE_NUMBER], [ISSUE_DATE], [DUE_DATE], [ITEMS_TABLE], [NOTES],
[CREDIT_NOTE_NUMBER], [ORIGINAL_INVOICE_NUMBER]
```

**Financial** (11 placeholders):
```
[SUBTOTAL], [TAX_RATE], [TAX_AMOUNT], [TOTAL], [CURRENCY],
[SECOND_CURRENCY], [SECOND_TOTAL], [SECOND_SUBTOTAL], [SECOND_TAX_AMOUNT],
[CURRENCY_2], [EXCHANGE_RATE]
```

**Recipient** (7 placeholders):
```
[RECIPIENT_NAME], [RECIPIENT_ADDRESS], [RECIPIENT_CITY],
[RECIPIENT_POSTAL_CODE], [RECIPIENT_COUNTRY], [RECIPIENT_VAT], [RECIPIENT_EMAIL]
```

**Contact** (4 placeholders):
```
[CONTACT_EMAIL], [CONTACT EMAIL] (alias), [PHONE], [TELEFON] (alias)
```

**Footer**:
```
[FOOTER_TEXT]
```

### Page Layout

**Header** (`position: fixed; top: -1.5cm`):
```css
.page-header {
    position: fixed;
    top: -1.5cm;
    left: 0;
    right: 0;
    height: 1.5cm;
}
```

**Body** (`padding-top` prevents header overlap):
```css
.content {
    padding-top: 2.5cm;  /* Includes header height + margin */
}
```

**Footer** (`position: fixed; bottom: 0`):
```css
.page-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: auto;
}
```

**Body padding** (prevents footer overlap):
- `5cm` for complex footers (tables/images)
- `3cm` for text-only footers

### Special Features

#### 1. **Items Table**
Generated from `invoice.line_items` array:
```python
items_table = '''
<table class="items-table">
    <thead>
        <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total</th>
        </tr>
    </thead>
    <tbody>
        {rows}
    </tbody>
</table>
'''
```

**Compact Mode**: Uses `padding: 2px 6px; line-height: 1.2` for dense tables.

#### 2. **Company Logo**
```python
# Fetch from attachments table
logo_attachment = await get_tenant_logo(db, tenant_id)
logo_base64 = logo_attachment.file_content  # Already base64

# Embed as data URL
replacements["[COMPANY_LOGO]"] = f'<img src="data:{mime_type};base64,{logo_base64}">'
```

#### 3. **Country Normalization**
Converts full country names → ISO codes:
```python
def _normalize_country_to_iso(country: str) -> str:
    mapping = {
        "Germany": "DE",
        "United States": "US",
        # ... 200+ countries
    }
    return mapping.get(country, country)
```

#### 4. **Number Formatting**
```python
from app.core.currency_formats import format_amount

# Reads from conference.settings
format_amount(1234.56, settings)
# European: "1.234,56"
# US: "1,234.56"
# French: "1 234,56"
```

**Presets**:
- European: `.` thousands, `,` decimal
- US: `,` thousands, `.` decimal
- French: space thousands, `,` decimal
- Swiss: `'` thousands, `.` decimal
- Indian: lakhs/crores system

#### 5. **Dual Currency**
For international invoices:
```python
settings = {
    "second_currency": "USD",
    "exchange_rate": 1.18,
}

# Placeholders
[SECOND_CURRENCY] → "USD"
[SECOND_TOTAL] → "$118.00"
[SECOND_SUBTOTAL] → "$100.00"
[SECOND_TAX_AMOUNT] → "$18.00"
```

---

## ZUGFeRD/Factur-X E-Invoicing

### Overview

ZUGFeRD (Zentraler User Guide des Forums elektronische Rechnung Deutschland) and Factur-X are identical hybrid e-invoicing standards that combine human-readable PDF with machine-readable XML data in a single file.

**Why ZUGFeRD?**
- **EU Compliance**: German B2B e-invoicing mandatory from 2025-2028, French similar timeline
- **Automated Processing**: Customers can import invoices directly into accounting systems
- **Single File**: PDF/A-3 format embeds XML, no separate files needed
- **EN 16931 Standard**: Full EU standard compliance with recommended profile

**Architecture**:
```
Invoice Data → factur-x Library → CII XML
                                     ↓
HTML Template → WeasyPrint → PDF + Embedded XML → PDF/A-3b
```

**Technical Stack**:
- **Standard**: ZUGFeRD 2.4 / Factur-X 1.08 (2026 specification)
- **XML Format**: UN/CEFACT CII (Cross-Industry Invoice)
- **PDF Format**: PDF/A-3b (ISO 19005-3 archival standard)
- **Library**: factur-x==3.15 for XML generation
- **Embedding**: WeasyPrint native Attachment API

### Configuration

#### Enable ZUGFeRD

**Settings → Finance → ZUGFeRD Settings**

**Required Fields**:
- **Enabled**: Toggle to activate ZUGFeRD
- **Profile**: Compliance level (recommended: EN16931)
- **Seller VAT ID**: Required for e-invoicing (e.g., DE123456789)

**Optional Fields**:
- **Seller Contact Email**: Invoice issuer email
- **Seller Contact Phone**: Invoice issuer phone
- **Payment Terms Code**: Net days (default: 30)
- **Payment Means Code**: Payment method (default: 30 = credit transfer)
- **Tax Category Code**: VAT category (default: S = standard rate)
- **Invoice Type Code**: Document type (default: 380 = commercial invoice)

**Settings Schema** (`conference.settings["zugferd_settings"]`):
```python
{
    "enabled": true,
    "profile": "EN16931",  # MINIMUM | BASIC_WL | BASIC | EN16931 | EXTENDED
    "seller_vat_id": "DE123456789",
    "seller_contact_email": "billing@company.com",
    "seller_contact_phone": "+49301234567",
    "payment_terms_code": "30",  # Net 30 days
    "payment_means_code": "30",  # Credit transfer
    "tax_category_code": "S",  # Standard rate
    "invoice_type_code": "380",  # Commercial invoice
}
```

#### Profile Selection

**EN16931 (COMFORT)** - Recommended:
- Full EU standard compliance
- Required for public sector contracts
- Supported by all major accounting software
- Balanced between simplicity and features

**MINIMUM** - Basic:
- Bare minimum fields
- Limited adoption
- Use only if explicitly required

**EXTENDED** - Complex:
- Maximum detail
- Overly complex for most use cases
- Rarely needed

### Data Requirements

For ZUGFeRD to generate successfully, invoices must have:

#### Seller Requirements
- **Company Name**: From `invoice_company_info.name`
- **VAT ID**: From `invoice_company_info.tax_id` OR `zugferd_settings.seller_vat_id`
- **Country**: From `invoice_company_info.country` (must be ISO code)
- **Address**: From `invoice_company_info.address` OR `address_line1`
- **City**: From `invoice_company_info.city`
- **Postal Code**: From `invoice_company_info.postal_code`

#### Buyer Requirements
- **Name**: `invoice.recipient_name`
- **Country**: `invoice.recipient_country` (must be ISO 3166-1 alpha-2, e.g., DE, FR)
- **Address**: `invoice.recipient_address_line1` (recommended)
- **City**: `invoice.recipient_city` (recommended)
- **VAT ID**: `invoice.recipient_vat_number` (recommended for B2B)

#### Financial Requirements
- **Invoice Number**: `invoice.invoice_number`
- **Issue Date**: `invoice.issue_date`
- **Due Date**: `invoice.due_date`
- **Currency**: `invoice.currency` (ISO code, e.g., EUR, USD)
- **Subtotal**: `invoice.subtotal`
- **Tax Rate**: `invoice.tax_rate`
- **Tax Amount**: `invoice.tax_amount`
- **Total**: `invoice.total`

#### Line Items
- **Minimum 1 line item** required
- Each item must have:
  - Description: `line_items[].description`
  - Quantity: `line_items[].quantity`
  - Unit Price: `line_items[].unit_price`
  - Total: `line_items[].total`

### XML Generation

**Module**: `app/core/zugferd_xml.py`

**Main Function**:
```python
async def generate_zugferd_xml(
    invoice: Invoice,
    conference: Conference,
    zugferd_settings: dict,
) -> bytes:
    """Generate ZUGFeRD CII XML from invoice data."""
```

**Process**:
```python
# 1. Map invoice fields to factur-x dict structure
xml_data = _map_invoice_to_zugferd(invoice, conference, zugferd_settings)

# 2. Generate XML using factur-x library (CPU-bound, run in thread pool)
from facturx import generate_facturx_from_dict

xml_bytes = await asyncio.to_thread(
    generate_facturx_from_dict,
    xml_data,
    level=zugferd_settings["profile"],  # EN16931
)

# 3. Return XML bytes ready for PDF embedding
return xml_bytes
```

**Data Mapping** (`_map_invoice_to_zugferd()`):
- Converts Invoice model → factur-x dict
- Normalizes country names → ISO codes
- Formats amounts as floats (factur-x expects float, not Decimal)
- Resolves bank info from `bank_accounts[]` array or legacy fields
- Builds seller, buyer, line items, payment terms, tax breakdown

### PDF Embedding

**Integration Point**: `app/core/invoice_pdf.py`

**Updated `generate_invoice_pdf()` Signature**:
```python
async def generate_invoice_pdf(
    invoice: Invoice,
    conference: Conference,
    db: AsyncSession,
    enable_zugferd: bool | None = None,  # None = auto-detect from settings
) -> bytes:
```

**Flow**:
```python
# 1-11. Generate standard PDF (existing logic)
pdf_bytes = await _generate_pdf_with_weasyprint(html, page_format, orientation)

# 12. Check if ZUGFeRD enabled
zugferd_config = conference.settings.get("zugferd_settings", {})
if not zugferd_config.get("enabled"):
    return pdf_bytes  # Return standard PDF

# 13. Validate invoice data
from app.core.zugferd_validation import validate_zugferd_requirements
validation_errors = validate_zugferd_requirements(invoice)
if validation_errors:
    logger.warning(f"Invoice {invoice.id} doesn't meet ZUGFeRD requirements")
    return pdf_bytes  # Graceful fallback

# 14. Generate ZUGFeRD XML
from app.core.zugferd_xml import generate_zugferd_xml
zugferd_xml = await generate_zugferd_xml(invoice, conference, zugferd_config)

# 15. Embed XML using WeasyPrint Attachment API
from weasyprint import HTML, Attachment
import base64

html_obj = HTML(string=full_html)
facturx_attachment = Attachment(
    url="data:application/xml;base64," + base64.b64encode(zugferd_xml).decode(),
    description="Factur-X/ZUGFeRD invoice data",
    relationship="Data",
    filename="factur-x.xml",
)

zugferd_pdf_bytes = html_obj.write_pdf(
    pdf_variant="pdf/a-3b",  # PDF/A-3 compliance
    attachments=[facturx_attachment],
)

return zugferd_pdf_bytes
```

**Graceful Fallback**:
- If validation fails → return standard PDF
- If XML generation fails → return standard PDF
- If embedding fails → return standard PDF
- Logs warnings but never blocks PDF generation

### Validation

**Module**: `app/core/zugferd_validation.py`

#### Pre-Generation Validation

**Function**: `validate_zugferd_requirements(invoice) -> list[str]`

```python
errors = validate_zugferd_requirements(invoice)
if errors:
    # Example errors:
    # - "Missing seller VAT ID (company tax_id in settings)"
    # - "Missing buyer country (required for ZUGFeRD)"
    # - "Buyer country must be ISO 3166-1 alpha-2 code (e.g., DE, FR)"
    # - "Missing issue date"
    # - "Line item 1: missing description"
```

**Returns**: List of error messages (empty list = valid)

#### Post-Generation Validation

**Function**: `validate_zugferd_pdf(pdf_bytes) -> dict`

```python
result = await validate_zugferd_pdf(pdf_bytes)
# Returns:
{
    "valid": bool,
    "profile": str,  # "EN16931" if detected
    "errors": list[str],
    "warnings": list[str],
}
```

**Uses**: factur-x library's `check_facturx_pdf()` function

#### Settings Validation

**Function**: `validate_zugferd_settings(settings) -> list[str]`

```python
errors = validate_zugferd_settings(settings)
# Checks:
# - seller_vat_id required when enabled
# - profile in valid list (MINIMUM, BASIC_WL, BASIC, EN16931, EXTENDED)
# - payment_terms_code is numeric
# - payment_means_code is standard (30, 48, 49, etc.)
# - tax_category_code is valid (S, Z, E, AE, K, G, O, L, M)
# - invoice_type_code is standard (380, 381, 384, etc.)
```

### API Endpoints

#### Validation Endpoint

**`POST /conferences/{id}/invoices/{invoice_id}/validate-zugferd`**

**Purpose**: Check if invoice meets ZUGFeRD requirements before generating

**Returns**:
```json
{
    "valid": true,
    "profile": "EN16931",
    "errors": [],
    "warnings": [],
    "can_generate": true
}
```

**Flow**:
1. Validate data requirements
2. Test-generate PDF with ZUGFeRD
3. Validate generated PDF
4. Return detailed status

#### Download with ZUGFeRD Override

**`GET /conferences/{id}/invoices/{invoice_id}/pdf?enable_zugferd=true`**

**Query Parameters**:
- `enable_zugferd`: `true` = force ZUGFeRD, `false` = force standard PDF, `null` = auto-detect from settings

**Use Cases**:
- Download standard PDF even when ZUGFeRD enabled (for testing)
- Download ZUGFeRD PDF even when disabled (for testing)

### Frontend Integration

#### Settings UI

**Component**: `FinancialSettingsTab.tsx → ZugferdSection`

**Features**:
- Enable/disable toggle
- Profile dropdown (MINIMUM, EN16931, EXTENDED)
- Seller VAT ID input (required when enabled)
- Advanced settings (contact email/phone, payment codes)
- Help text explaining EU compliance
- Auto-save on change

#### Validation Status Indicator

**Component**: `InvoiceDetailsTab.tsx → ZugferdValidationStatus`

**Features**:
- Shows validation status when ZUGFeRD enabled
- Green badge: "ZUGFeRD Compliant (EN16931)"
- Yellow badge: "Missing ZUGFeRD Requirements"
- Lists validation errors with specific missing fields
- Updates on invoice data changes

**Example**:
```
⚠️ Missing ZUGFeRD Requirements
  • Missing buyer country (required for ZUGFeRD)
  • Missing due date (required for payment terms)
```

#### Download Toggle

**Location**: Invoice list and detail panel

**Feature**: Toggle to include/exclude ZUGFeRD XML when downloading PDF

### Email Integration

**Module**: `app/core/invoice_email.py`

**Updated `build_pdf_attachment()`**:
```python
# Filename prefix for ZUGFeRD PDFs
if zugferd_enabled:
    filename = f"zugferd_{invoice.invoice_number}.pdf"
else:
    filename = f"invoice_{invoice.invoice_number}.pdf"
```

**Why**: Clear indicator to recipients that PDF contains structured data

### Testing

#### Unit Tests

**File**: `backend/tests/test_zugferd.py` (50+ tests)

**Coverage**:
- XML generation for all profiles
- Validation (requirements, settings, PDF)
- Bank info resolution (array vs legacy fields)
- Multiple line items
- Edge cases (no buyer VAT, different currencies, minimal data)

**Run**:
```bash
cd backend
venv/bin/python -m pytest tests/test_zugferd.py -v
```

#### External Validators

**German Official Validator**:
- URL: https://www.zugferd-rechnung.de/validator/
- Upload generated PDF
- Check: "Valid ZUGFeRD PDF/A-3" green checkmark

**factur-x CLI**:
```bash
# Extract embedded XML for inspection
pip install factur-x
facturx-pdfextractxml invoice.pdf

# Validate PDF
facturx-validate invoice.pdf
```

**Accounting Software**:
- DATEV (Germany)
- Lexware (Germany)
- sevDesk (Germany)
- Test import into customer's actual accounting system

### Common Issues

#### Invoice doesn't meet requirements

**Symptom**: Standard PDF generated instead of ZUGFeRD

**Check**:
1. Validation status indicator in invoice detail panel
2. Backend logs for warning messages
3. Run validation endpoint to get specific errors
4. Ensure buyer country is ISO code (DE, not Germany)

**Fix**: Fill in missing required fields listed in validation errors

#### Generated PDF fails external validation

**Symptom**: Validator reports "Not a valid ZUGFeRD PDF"

**Check**:
1. ZUGFeRD enabled in settings?
2. XML actually embedded? (use `facturx-pdfextractxml` to check)
3. Check logs for embedding errors
4. Verify WeasyPrint version supports PDF/A-3

**Fix**:
- Ensure WeasyPrint >= 60.0
- Check for PDF generation exceptions in logs
- Test with minimal invoice data first

#### Buyer country validation fails

**Symptom**: "Buyer country must be ISO 3166-1 alpha-2 code"

**Cause**: Country stored as full name (e.g., "Germany") instead of code (e.g., "DE")

**Fix**:
- Frontend uses country dropdown (stores ISO codes)
- Backend has `_normalize_country_to_iso()` helper for legacy data
- Update invoice recipient_country to 2-letter ISO code

#### Missing seller VAT ID

**Symptom**: "Missing seller VAT ID (company tax_id in settings)"

**Fix**: Settings → Finance → Company Info → Tax ID / VAT Number

**Fallback**: Or set `zugferd_settings.seller_vat_id` explicitly

### Performance

**Overhead per invoice**:
- XML generation: +50-150ms (CPU-bound, runs in thread pool)
- PDF embedding: +20-50ms (WeasyPrint native support)
- Total: ~100-200ms additional per ZUGFeRD invoice

**Optimization**:
- XML generation runs async via `asyncio.to_thread()` (non-blocking)
- PDF embedding integrated in WeasyPrint pipeline (single pass)
- No database schema changes (no query impact)
- XML size: typically 10-50KB (negligible memory impact)

**Caching**: Not implemented (invoices change, settings change). Consider if performance issues arise.

### Security & Compliance

**Input Validation**:
- All XML generation uses Pydantic schemas
- XSD validation via factur-x library
- Country codes validated against ISO 3166-1 list
- VAT IDs validated (existing python-stdnum integration)

**PDF/A-3 Security**:
- Embedded XML is metadata only (no executable content)
- WeasyPrint ensures PDF/A-3b compliance (no JavaScript)
- Attachments restricted to application/xml MIME type

**Data Privacy**:
- ZUGFeRD XML contains same data as visible PDF
- No additional PII exposure
- Embedded XML inherits PDF security (encryption, permissions)

**Compliance Standards**:
- **EN 16931-1**: EU e-invoicing standard (full compliance with EN16931 profile)
- **PDF/A-3b**: ISO 19005-3 (archival standard)
- **ZUGFeRD 2.4 / Factur-X 1.08**: Latest 2026 specification
- **UN/CEFACT CII**: Cross-Industry Invoice XML format

---

## API Endpoints

### Invoice CRUD

#### 1. **Create Invoice**
`POST /conferences/{id}/invoices`

**Body**:
```json
{
    "template_type": "credit_card",
    "status": "draft",
    "recipient_name": "ACME Corp",
    "recipient_address_line1": "123 Main St",
    "recipient_city": "New York",
    "recipient_postal_code": "10001",
    "recipient_country": "US",
    "recipient_email": "billing@acme.com",
    "line_items": [
        {
            "description": "Conference Sponsorship",
            "quantity": "1",
            "unit_price": "5000.00",
            "total": "5000.00"
        }
    ],
    "subtotal": 5000.00,
    "tax_rate": 20.0,
    "tax_amount": 1000.00,
    "total": 6000.00,
    "currency": "EUR",
    "due_date": "2024-12-31"
}
```

**Validation**:
- Required fields: name, address, city, postal code, country
- Raises 400 with list of missing fields

**Returns**: Invoice with events array

#### 2. **Update Invoice**
`PUT /conferences/{id}/invoices/{invoice_id}`

**Rules**:
- Draft invoices: Fully editable
- Non-draft: Only status changes allowed
- Draft → Sent: Auto-assigns invoice number, sets issue_date

**Status Transitions**:
```python
VALID_STATUS_TRANSITIONS = {
    "draft": {"sent"},
    "sent": {"paid", "overdue"},
    "overdue": {"paid", "sent"},
    "paid": {},  # Terminal (use reopen endpoint)
    "cancelled": {},  # Terminal
}
```

#### 3. **Delete Invoice**
`DELETE /conferences/{id}/invoices/{invoice_id}`

**Rules**:
- Only draft invoices can be deleted
- Credit notes cannot be deleted
- Deletes associated attachments

#### 4. **Get Invoice**
`GET /conferences/{id}/invoices/{invoice_id}`

**Returns**: Invoice with:
- Events array (payments, refunds, status changes)
- Related invoice number (for credit notes)

#### 5. **List Invoices**
`GET /conferences/{id}/invoices`

**Query Parameters**:
- `status`: Filter by status
- `template_type`: Filter by type
- `search`: Search by invoice number or recipient name
- `skip`, `limit`: Pagination (default 0, 100; max 500)

**Returns**: Paginated list with total count

### Invoice Actions

#### 6. **Send Invoice**
`POST /conferences/{id}/invoices/{invoice_id}/send`

**Behavior**:
- **Draft**: Assigns number, sets status to sent, creates payment link (if credit card), sends email
- **Sent/Overdue**: Re-sends email with existing payment link

**Returns**: Invoice with updated events

#### 7. **Cancel Invoice**
`POST /conferences/{id}/invoices/{invoice_id}/cancel`

**Body**:
```json
{
    "reason": "Customer requested cancellation due to event postponement"
}
```

**Flow**:
```python
# 1. Deactivate payment link (if credit card)
await deactivate_payment_link_for_invoice(invoice, conference)

# 2. Issue Stripe refund (if paid + credit card)
if invoice.status == "paid" and invoice.template_type == "credit_card":
    refund_result = await refund_payment(...)

# 3. Cancel original invoice
invoice.status = "cancelled"
invoice.internal_comment = reason

# 4. Create credit note
credit_note = create_credit_note_for_invoice(...)

# 5. Send credit note email (best-effort)
await send_invoice_email(credit_note, ...)
```

**Returns**: `{cancelled_invoice, credit_note}`

#### 8. **Convert to Credit Card**
`POST /conferences/{id}/invoices/{invoice_id}/convert-to-credit-card`

**Converts**: Bank transfer → Credit card

**Flow**:
```python
# 1. Validate
if invoice.template_type != "bank_transfer":
    raise HTTPException(400, "Only bank transfer invoices can be converted")
if invoice.status not in ("sent", "overdue"):
    raise HTTPException(400, "Can only convert sent or overdue invoices")

# 2. Convert
invoice.template_type = "credit_card"

# 3. Create payment link
payment_intent_id, payment_link_url = await create_payment_link(...)
invoice.stripe_payment_link_url = payment_link_url

# 4. Log event
await log_invoice_event(..., event_type=CONVERTED_TO_CREDIT_CARD)

# 5. Send email with payment link
await send_invoice_email(..., payment_link_url=payment_link_url)
```

**Returns**: `{invoice, payment_link_url}`

#### 9. **Mark Paid Manually**
`POST /conferences/{id}/invoices/{invoice_id}/mark-paid`

**Body**:
```json
{
    "payment_date": "2024-03-15",
    "comment": "Bank transfer received, reference: TRX-12345"
}
```

**For**: Bank transfer invoices (manual reconciliation)

**Returns**: Invoice with new event

#### 10. **Reopen Invoice**
`POST /conferences/{id}/invoices/{invoice_id}/reopen`

**Body**:
```json
{
    "comment": "Payment was reversed by bank, reopening invoice"
}
```

**Transitions**: paid/cancelled/overdue → sent

**Returns**: Invoice with new event

### Stripe Operations

#### 11. **Sync Single Invoice**
`POST /conferences/{id}/invoices/{invoice_id}/sync-stripe-payment`

**Purpose**: Manually sync payment status from Stripe

**Flow**: Uses 3-tier payment intent discovery, updates invoice if payment succeeded

**Returns**: Updated invoice

#### 12. **Sync All Invoices**
`POST /conferences/{id}/invoices/sync-stripe-payments`

**Purpose**: Bulk sync all pending credit card invoices

**Returns**:
```json
{
    "message": "Sync completed",
    "total_checked": 15,
    "updated_to_paid": 3,
    "payment_failures_logged": 1,
    "errors": []
}
```

### Export & Download

#### 13. **Download PDF**
`GET /conferences/{id}/invoices/{invoice_id}/pdf`

**Returns**: PDF file (Content-Type: application/pdf)

#### 14. **Preview PDF**
`POST /conferences/{id}/invoices/preview-pdf`

**Body**: Invoice data (same as create endpoint)

**Returns**: PDF file (for testing templates)

---

## Frontend Components

### Invoice List (`InvoicesTab.tsx`)

**Features**:
- Paginated table with search
- Filter by status, template type
- Create, edit, delete, send actions
- Download PDF
- Sync Stripe payments (bulk button)

**Actions**:
- **Send**: Opens send dialog, calls send endpoint
- **Cancel**: Opens cancel dialog with reason input
- **Convert**: Button for bank transfer invoices
- **Mark Paid**: Button for bank transfer invoices
- **Reopen**: Button for paid/cancelled invoices
- **Sync**: Button to sync Stripe payments

### Invoice Detail Panel (`InvoiceDetailPanel/`)

**Tabs**:

1. **Details Tab**
   - Event timeline (payments, refunds, status changes)
   - Stripe object IDs (payment_intent, charge, refund)
   - Error messages for failed events
   - Icons: ✓ success, ✗ error, ⟳ pending

2. **Preview Tab**
   - PDF preview (iframe)
   - Download button

3. **Actions**
   - Send/Resend
   - Cancel (with refund warning for paid invoices)
   - Convert to Credit Card
   - Mark Paid
   - Reopen
   - Delete (draft only)
   - Sync Stripe Payment

### Invoice Editor (`InvoiceDetailPanel/InvoiceDetailsTab.tsx`)

**Fields**:
- Template type (invoice, bank_transfer, credit_card, credit_note)
- Status (draft, sent, overdue, paid, cancelled)
- Recipient info (name, address, email, VAT)
- Line items (description, quantity, unit_price, total)
- Financial (subtotal, tax_rate, tax_amount, total, currency)
- Dates (issue_date, due_date)
- Notes, internal comment

**Validation**:
- Required fields marked with *
- Client-side validation before submit
- Server validates on save

### Template Editor (`InvoiceTemplateEditor.tsx`)

**TipTap WYSIWYG Editor**:
- Page canvas (A4/Letter preview)
- Toolbar (bold, italic, underline, lists, tables, images)
- Placeholder panel (click to insert)
- Live preview (generates PDF on save)

**Sections**:
- Header HTML (repeated on every page)
- Body HTML (main content)
- Footer HTML (repeated on every page)

---

## Key Files Reference

### Backend Core
- **invoice_queries.py**: Database helpers (get, refresh)
- **invoice_audit.py**: Audit log creation
- **invoice_validation.py**: Field validation
- **invoice_email.py**: Email operations (send, build HTML, attach PDF)
- **invoice_operations.py**: Business logic (credit note creation)
- **stripe_helper.py**: Stripe operations (payment link, refund, sync, deactivate)
- **invoice_events.py**: Event logging (`log_invoice_event()`)
- **invoice_pdf.py**: PDF generation (WeasyPrint)
- **invoice_number.py**: Number generation (counters, templates)
- **currency_formats.py**: Number formatting (localized)

### Backend API
- **invoices.py**: All invoice endpoints (19 endpoints, 1805 lines)
- **stripe_webhooks.py**: Webhook handler
- **invoice_settings.py**: Settings CRUD + preview

### Backend Models
- **invoice.py**: Invoice model (30+ columns)
- **invoice_event.py**: InvoiceEvent model (16 columns)
- **audit.py**: AuditLog model

### Backend Schemas
- **invoice.py**: Pydantic schemas (InvoiceCreate, InvoiceUpdate, InvoiceResponse)
- **settings.py**: InvoiceSettingsResponse, InvoiceSettingsUpdate

### Frontend
- **InvoicesTab.tsx**: List view with actions
- **InvoiceDetailPanel/**: Detail view (index, InvoiceDetailsTab, InvoicePreviewTab)
- **InvoiceTemplateEditor.tsx**: WYSIWYG template editor
- **Invoice settings tabs**: InvoiceTemplateTab, InvoiceCompanyDataTab, FinancialSettingsTab

---

## Testing

### Backend Tests
- **test_invoices.py**: 42 tests (CRUD, status transitions, cancellation, send)
- **test_invoice_settings.py**: 31 tests (template, company info, counters, bank accounts)
- **test_invoice_pdf_helpers.py**: 14 tests (country normalization, number formatting)

**Run**:
```bash
cd backend
venv/bin/python -m pytest tests/test_invoices.py -v
venv/bin/python -m pytest tests/test_invoice_settings.py -v
```

### Frontend Tests
```bash
cd frontend
npm run test -- InvoicesTab.test.tsx
npm run test -- InvoiceDetailPanel.test.tsx
```

---

## Common Workflows

### 1. Create and Send Invoice
```python
# 1. Create draft
invoice = Invoice(
    template_type="credit_card",
    status="draft",
    recipient_name="ACME Corp",
    # ... required fields
)
db.add(invoice)
await db.commit()

# 2. Send (triggers number assignment, payment link, email)
POST /conferences/{id}/invoices/{invoice.id}/send
```

### 2. Cancel Invoice with Refund
```python
# 1. Cancel (creates credit note, issues refund, sends email)
POST /conferences/{id}/invoices/{invoice.id}/cancel
Body: {"reason": "Customer requested cancellation"}

# Backend automatically:
# - Deactivates payment link
# - Issues Stripe refund (if paid)
# - Creates credit note
# - Sends credit note email
```

### 3. Convert Bank Transfer to Credit Card
```python
# 1. Convert
POST /conferences/{id}/invoices/{invoice.id}/convert-to-credit-card

# Backend automatically:
# - Changes template_type
# - Creates payment link
# - Sends email with "Pay Online" button
```

### 4. Manual Payment Reconciliation
```python
# 1. Mark paid
POST /conferences/{id}/invoices/{invoice.id}/mark-paid
Body: {
    "payment_date": "2024-03-15",
    "comment": "Bank transfer received"
}
```

### 5. Sync Stripe Payments
```python
# Option A: Single invoice
POST /conferences/{id}/invoices/{invoice.id}/sync-stripe-payment

# Option B: Bulk sync
POST /conferences/{id}/invoices/sync-stripe-payments
```

---

## Troubleshooting

### Invoice not marking as paid automatically
**Check**:
1. Webhook configured in Stripe?
2. Webhook secret correct in settings?
3. Check invoice events for PAYMENT_FAILED
4. Run manual sync endpoint

### Payment link not working
**Check**:
1. Stripe enabled in conference settings?
2. Secret key valid?
3. Invoice has `stripe_payment_link_url`?
4. Link not deactivated (check events for payment_link modification)?

### Email not sending
**Check**:
1. SMTP settings configured?
2. Recipient email valid?
3. Check backend logs for email errors
4. PDF generation successful?

### Refund failing
**Check**:
1. Invoice has `stripe_payment_intent_id`?
2. Payment already refunded?
3. Stripe account has funds?
4. Check invoice events for REFUND_FAILED with error_message

### PDF generation errors
**Check**:
1. Template has all required placeholders?
2. Images base64-encoded correctly?
3. WeasyPrint installed?
4. Check logs for CSS/HTML errors
