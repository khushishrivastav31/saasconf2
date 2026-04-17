"""Invoice domain: PDF generation, numbering, line items, validation, events.

Moved under ``app.core.invoice`` in audit Step 28. Old flat paths
(``app.core.invoice_*``) continue to work via backwards-compatible shims
and will be removed once callers are updated.

Key submodules:
- :mod:`app.core.invoice.pdf` — PDF rendering (WeasyPrint)
- :mod:`app.core.invoice.pdf_normalize` — HTML normalization
- :mod:`app.core.invoice.pdf_placeholders` — template variable substitution
- :mod:`app.core.invoice.number` — invoice number generation
- :mod:`app.core.invoice.line_items` — line-item construction
- :mod:`app.core.invoice.auto_generation` — bulk invoice creation from registrations
- :mod:`app.core.invoice.email` — email composition and sending
- :mod:`app.core.invoice.events` — audit log events
- :mod:`app.core.invoice.audit` — audit log writers
- :mod:`app.core.invoice.operations` — credit notes, cancellations
- :mod:`app.core.invoice.queries` — query helpers
- :mod:`app.core.invoice.replacement` — invoice replacement flow
- :mod:`app.core.invoice.registration_cancellation` — registration refund flow
- :mod:`app.core.invoice.registration_transfer` — registration transfer flow
- :mod:`app.core.invoice.validation` — recipient-field validation
"""
