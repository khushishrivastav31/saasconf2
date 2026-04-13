# Task: Copy Conference Invoice Templates to Training

## Context

The training invoice template system is fully built (backend API, frontend UI, all endpoints). However, the training invoice templates are empty/minimal (576 chars each, no header/footer). The conference already has rich templates with full HTML body, header (logo), and footer (company details). The user wants the conference template content copied to trainings.

## What Exists

- **Conference templates** (`conference.settings`): 3 templates (bank_transfer: 1884 chars, credit_card: 1166 chars, credit_note: 1064 chars), header HTML (50K chars with logo), footer HTML (1.3M chars with company details)
- **Training templates** (`tenant.settings.training_finance`): 3 bare templates (576 chars each), no header, no footer
- Templates use generic placeholders (`[RECIPIENT_NAME]`, `[INVOICE_NUMBER]`, etc.) — no conference-specific text, so they can be copied directly

## Implementation

**No code changes needed** — this is a DB data copy.

Run a script to copy from `conferences.settings` to `tenants.settings.training_finance`:
- `invoice_templates` (bank_transfer, credit_card, credit_note HTML bodies)
- `invoice_header_html`
- `invoice_footer_html`
- `invoice_page_format`
- `company_info` fields (name, address, tax_id, etc.)

Copy for the **trendig** tenant only (active tenant).

## Verification

1. Refresh Training → Settings → Invoice Templates → templates should show the same content as conference
2. Preview a training invoice PDF — should render with header/footer
