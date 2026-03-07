import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InvoiceDetailPanel from '../index';
import type { Invoice, PlatformCurrency, VatWarning, VatRequirement } from '../../../types';

// Mock child components
vi.mock('../InvoiceDetailsTab', () => ({
  default: () => <div data-testid="details-tab">Details Tab</div>,
}));
vi.mock('../InvoiceLineItemsTab', () => ({
  default: () => <div data-testid="line-items-tab">Line Items Tab</div>,
}));
vi.mock('../InvoiceContactsTab', () => ({
  default: () => <div data-testid="contacts-tab">Contacts Tab</div>,
}));
vi.mock('../InvoiceDocumentsTab', () => ({
  default: () => <div data-testid="documents-tab">Documents Tab</div>,
}));

describe('InvoiceDetailPanel - VAT Warnings', () => {
  const mockCurrencies: PlatformCurrency[] = [
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'USD', name: 'US Dollar', symbol: '$' },
  ];

  const baseInvoice: Invoice = {
    id: 'inv-123',
    tenant_id: 't-1',
    conference_id: 'c-1',
    invoice_number: 'INV-2026-001',
    template_type: 'bank_transfer',
    status: 'draft',
    issue_date: '2026-03-01',
    due_date: '2026-03-31',
    recipient_name: 'Acme Corp',
    recipient_email: 'billing@acme.com',
    recipient_address_line1: '123 Main St',
    recipient_city: 'Paris',
    recipient_postal_code: '75001',
    recipient_country: 'FR',
    recipient_vat_number: '',
    line_items: [{ description: 'Sponsorship', quantity: 1, unit_price: 1000, total: 1000 }],
    subtotal: 1000,
    tax_rate: 0,
    tax_amount: 0,
    total: 1000,
    currency: 'EUR',
    notes: '',
    internal_comment: '',
    contact_persons: [],
    is_active: true,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    vat_warnings: null,
    vat_requirement: null,
    vat_auto_calculated: true,
  };

  const defaultProps = {
    invoice: baseInvoice,
    currencies: mockCurrencies,
    onSave: vi.fn().mockResolvedValue(undefined),
  };

  it('renders error warning banner for required VAT', () => {
    const vatWarning: VatWarning = {
      code: 'vat_required_missing',
      level: 'error',
      message:
        'VAT number is REQUIRED for this transaction. Virtual/online services to EU businesses are subject to reverse charge under Article 196.',
      requirement: {
        level: 'required',
        reason: 'Required for reverse charge',
        rule_reference: 'Article 196, VAT Directive 2006/112/EC',
      },
      can_override: true,
    };

    render(
      <InvoiceDetailPanel
        {...defaultProps}
        invoice={{ ...baseInvoice, vat_warnings: [vatWarning] }}
      />
    );

    // Error banner should be present
    expect(screen.getByText('VAT Number Required')).toBeInTheDocument();
    expect(screen.getByText(/Virtual\/online services to EU businesses/)).toBeInTheDocument();
    expect(screen.getByText(/Article 196, VAT Directive 2006\/112\/EC/)).toBeInTheDocument();

    // Check red error styling - navigate up to the banner div (3 levels up)
    const titleElement = screen.getByText('VAT Number Required');
    const banner = titleElement.parentElement?.parentElement?.parentElement;
    expect(banner?.className).toContain('bg-red-50');
    expect(banner?.className).toContain('dark:bg-red-900/30');
  });

  it('renders warning banner for recommended VAT', () => {
    const vatWarning: VatWarning = {
      code: 'vat_recommended_missing',
      level: 'warning',
      message:
        'VAT number is recommended for business-to-business transactions. Providing a VAT number helps with tax compliance.',
      requirement: {
        level: 'recommended',
        reason: 'Recommended for B2B',
        rule_reference: 'Best practice for B2B invoicing',
      },
      can_override: true,
    };

    render(
      <InvoiceDetailPanel
        {...defaultProps}
        invoice={{ ...baseInvoice, vat_warnings: [vatWarning] }}
      />
    );

    // Warning banner should be present
    expect(screen.getByText('VAT Number Recommended')).toBeInTheDocument();
    expect(screen.getByText(/business-to-business transactions/)).toBeInTheDocument();
    expect(screen.getByText(/Best practice for B2B invoicing/)).toBeInTheDocument();

    // Check yellow warning styling - navigate up to the banner div (3 levels up)
    const titleElement = screen.getByText('VAT Number Recommended');
    const banner = titleElement.parentElement?.parentElement?.parentElement;
    expect(banner?.className).toContain('bg-yellow-50');
    expect(banner?.className).toContain('dark:bg-yellow-900/30');
  });

  it('renders multiple warnings', () => {
    const warnings: VatWarning[] = [
      {
        code: 'vat_required_missing',
        level: 'error',
        message: 'VAT number is REQUIRED.',
        requirement: {
          level: 'required',
          reason: 'Required for reverse charge',
          rule_reference: 'Article 196',
        },
        can_override: true,
      },
      {
        code: 'vat_recommended_invalid',
        level: 'warning',
        message: 'VAT number could not be validated.',
        requirement: {
          level: 'recommended',
          reason: 'Recommended for B2B',
          rule_reference: null,
        },
        can_override: true,
      },
    ];

    render(
      <InvoiceDetailPanel {...defaultProps} invoice={{ ...baseInvoice, vat_warnings: warnings }} />
    );

    // Both warnings should be present
    expect(screen.getByText('VAT Number Required')).toBeInTheDocument();
    expect(screen.getByText('VAT Number Recommended')).toBeInTheDocument();
    expect(screen.getByText('VAT number is REQUIRED.')).toBeInTheDocument();
    expect(screen.getByText('VAT number could not be validated.')).toBeInTheDocument();
  });

  it('does not render warning section when vat_warnings is null', () => {
    render(
      <InvoiceDetailPanel {...defaultProps} invoice={{ ...baseInvoice, vat_warnings: null }} />
    );

    expect(screen.queryByText('VAT Number Required')).not.toBeInTheDocument();
    expect(screen.queryByText('VAT Number Recommended')).not.toBeInTheDocument();
  });

  it('does not render warning section when vat_warnings is empty array', () => {
    render(<InvoiceDetailPanel {...defaultProps} invoice={{ ...baseInvoice, vat_warnings: [] }} />);

    expect(screen.queryByText('VAT Number Required')).not.toBeInTheDocument();
    expect(screen.queryByText('VAT Number Recommended')).not.toBeInTheDocument();
  });

  it('renders info banner when vat_requirement exists without warnings', () => {
    const vatRequirement: VatRequirement = {
      level: 'required',
      reason:
        'VAT number is required for reverse charge on virtual services to EU businesses under Article 196.',
      rule_reference: 'Article 196, VAT Directive 2006/112/EC',
    };

    render(
      <InvoiceDetailPanel
        {...defaultProps}
        invoice={{
          ...baseInvoice,
          vat_requirement: vatRequirement,
          vat_warnings: null,
        }}
      />
    );

    // Info banner should be present
    expect(screen.getByText('VAT Rule Applied')).toBeInTheDocument();
    expect(screen.getByText(/reverse charge on virtual services/)).toBeInTheDocument();
    expect(screen.getByText(/Article 196, VAT Directive 2006\/112\/EC/)).toBeInTheDocument();

    // Check blue info styling - navigate up to the banner div (3 levels up)
    const titleElement = screen.getByText('VAT Rule Applied');
    const banner = titleElement.parentElement?.parentElement?.parentElement;
    expect(banner?.className).toContain('bg-blue-50');
    expect(banner?.className).toContain('dark:bg-blue-900/30');
  });

  it('does not render info banner when vat_requirement level is optional', () => {
    const vatRequirement: VatRequirement = {
      level: 'optional',
      reason: 'VAT number is optional for this transaction.',
      rule_reference: null,
    };

    render(
      <InvoiceDetailPanel
        {...defaultProps}
        invoice={{
          ...baseInvoice,
          vat_requirement: vatRequirement,
          vat_warnings: null,
        }}
      />
    );

    expect(screen.queryByText('VAT Rule Applied')).not.toBeInTheDocument();
  });

  it('does not render info banner when warnings are present', () => {
    const vatRequirement: VatRequirement = {
      level: 'required',
      reason: 'VAT required',
      rule_reference: 'Article 196',
    };

    const vatWarning: VatWarning = {
      code: 'vat_required_missing',
      level: 'error',
      message: 'VAT is missing',
      requirement: vatRequirement,
      can_override: true,
    };

    render(
      <InvoiceDetailPanel
        {...defaultProps}
        invoice={{
          ...baseInvoice,
          vat_requirement: vatRequirement,
          vat_warnings: [vatWarning],
        }}
      />
    );

    // Should show warning banner but NOT info banner
    expect(screen.getByText('VAT Number Required')).toBeInTheDocument();
    expect(screen.queryByText('VAT Rule Applied')).not.toBeInTheDocument();
  });

  it('renders warning without rule_reference gracefully', () => {
    const vatWarning: VatWarning = {
      code: 'vat_recommended_missing',
      level: 'warning',
      message: 'VAT recommended',
      requirement: {
        level: 'recommended',
        reason: 'Recommended',
        rule_reference: null, // No reference
      },
      can_override: true,
    };

    render(
      <InvoiceDetailPanel
        {...defaultProps}
        invoice={{ ...baseInvoice, vat_warnings: [vatWarning] }}
      />
    );

    expect(screen.getByText('VAT Number Recommended')).toBeInTheDocument();
    expect(screen.getByText('VAT recommended')).toBeInTheDocument();
    // Reference text should not be present
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });

  it('handles multiline warning messages', () => {
    const vatWarning: VatWarning = {
      code: 'vat_required_missing',
      level: 'error',
      message: 'VAT number is REQUIRED.\n\nAdditional context:\n- Line 1\n- Line 2',
      requirement: {
        level: 'required',
        reason: 'Required',
        rule_reference: null,
      },
      can_override: true,
    };

    render(
      <InvoiceDetailPanel
        {...defaultProps}
        invoice={{ ...baseInvoice, vat_warnings: [vatWarning] }}
      />
    );

    // Check that message is rendered (whitespace-pre-line should handle formatting)
    const messageElement = screen.getByText(/Additional context/);
    expect(messageElement.className).toContain('whitespace-pre-line');
  });
});
