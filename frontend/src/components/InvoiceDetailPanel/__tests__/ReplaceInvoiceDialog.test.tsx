import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReplaceInvoiceDialog from '../ReplaceInvoiceDialog';
import type { Invoice, ReplaceInvoiceRequest } from '../../../types';

const mockInvoice: Invoice = {
  id: 'invoice-123',
  invoice_number: 'INV-2026-001',
  status: 'sent',
  template_type: 'bank_transfer',
  recipient_name: 'Original Company Ltd',
  recipient_email: 'original@example.com',
  recipient_address_line1: '123 Old Street',
  recipient_city: 'Berlin',
  recipient_postal_code: '10115',
  recipient_country: 'DE',
  recipient_vat_number: 'DE111222333',
  procurement_code: 'PO-OLD-001',
  subtotal: 1000,
  tax_amount: 190,
  tax_rate: 19,
  total: 1190,
  currency: 'EUR',
  issue_date: '2026-03-01',
  due_date: '2026-03-31',
  is_active: true,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
};

describe('ReplaceInvoiceDialog', () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onConfirm: ReturnType<typeof vi.fn<[ReplaceInvoiceRequest], void>>;

  beforeEach(() => {
    onClose = vi.fn();
    onConfirm = vi.fn();
  });

  it('should not render when open is false', () => {
    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    expect(screen.queryByText(/Replace Invoice/i)).not.toBeInTheDocument();
  });

  it('should render with invoice data when open is true', () => {
    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    expect(
      screen.getByText(/Replace Invoice with Corrected Billing Information/i)
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Original Company Ltd')).toBeInTheDocument();
    expect(screen.getByDisplayValue('original@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('123 Old Street')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Berlin')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10115')).toBeInTheDocument();
    expect(screen.getByDisplayValue('DE111222333')).toBeInTheDocument();
    expect(screen.getByDisplayValue('PO-OLD-001')).toBeInTheDocument();
  });

  it('should show paid status inheritance message for paid invoices', () => {
    const paidInvoice = { ...mockInvoice, status: 'paid' as const };

    render(
      <ReplaceInvoiceDialog
        invoice={paidInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText(/The new invoice will inherit the "paid" status/i)).toBeInTheDocument();
  });

  it('should show payment link message for sent credit card invoices', () => {
    const sentCreditCardInvoice = {
      ...mockInvoice,
      status: 'sent' as const,
      template_type: 'credit_card' as const,
    };

    render(
      <ReplaceInvoiceDialog
        invoice={sentCreditCardInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText(/A new payment link will be created/i)).toBeInTheDocument();
  });

  it('should disable confirm button when reason is empty', () => {
    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByRole('button', {
      name: /Replace Invoice & Create Credit Note/i,
    });
    expect(confirmButton).toBeDisabled();
  });

  it('should disable confirm button when no fields have changed', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, 'Test reason');

    const confirmButton = screen.getByRole('button', {
      name: /Replace Invoice & Create Credit Note/i,
    });
    expect(confirmButton).toBeDisabled();
  });

  it('should show warning when no fields changed but reason provided', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, 'Test reason');

    await waitFor(() => {
      expect(screen.getByText(/At least one billing field must be different/i)).toBeInTheDocument();
    });
  });

  it('should enable confirm button when reason and at least one field changed', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, 'Company name was incorrect');

    const nameInput = screen.getByDisplayValue('Original Company Ltd');
    await user.clear(nameInput);
    await user.type(nameInput, 'Corrected Company GmbH');

    const confirmButton = screen.getByRole('button', {
      name: /Replace Invoice & Create Credit Note/i,
    });
    expect(confirmButton).toBeEnabled();
  });

  it('should call onConfirm with correct data when form is submitted', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Fill reason
    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, 'Company name and VAT number incorrect');

    // Change recipient name
    const nameInput = screen.getByDisplayValue('Original Company Ltd');
    await user.clear(nameInput);
    await user.type(nameInput, 'Corrected Company GmbH');

    // Change VAT number
    const vatInput = screen.getByDisplayValue('DE111222333');
    await user.clear(vatInput);
    await user.type(vatInput, 'DE999888777');

    // Submit
    const confirmButton = screen.getByRole('button', {
      name: /Replace Invoice & Create Credit Note/i,
    });
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'Company name and VAT number incorrect',
      recipient_name: 'Corrected Company GmbH',
      recipient_vat_number: 'DE999888777',
    });
  });

  it('should include custom email message when provided', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Fill reason
    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, 'VAT correction');

    // Change VAT number
    const vatInput = screen.getByDisplayValue('DE111222333');
    await user.clear(vatInput);
    await user.type(vatInput, 'DE999888777');

    // Add custom message
    const customMessageTextarea = screen.getByPlaceholderText(
      /e\.g\. Please use this corrected invoice/i
    );
    await user.type(
      customMessageTextarea,
      'Please use this invoice with the corrected VAT number.'
    );

    // Submit
    const confirmButton = screen.getByRole('button', {
      name: /Replace Invoice & Create Credit Note/i,
    });
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'VAT correction',
      recipient_vat_number: 'DE999888777',
      custom_email_message: 'Please use this invoice with the corrected VAT number.',
    });
  });

  it('should only include changed fields in the request', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Fill reason
    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, 'Address correction');

    // Change only address fields
    const addressInput = screen.getByDisplayValue('123 Old Street');
    await user.clear(addressInput);
    await user.type(addressInput, '456 New Avenue');

    const cityInput = screen.getByDisplayValue('Berlin');
    await user.clear(cityInput);
    await user.type(cityInput, 'Munich');

    // Submit
    const confirmButton = screen.getByRole('button', {
      name: /Replace Invoice & Create Credit Note/i,
    });
    await user.click(confirmButton);

    // Should not include unchanged fields
    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'Address correction',
      recipient_address_line1: '456 New Avenue',
      recipient_city: 'Munich',
      // Should NOT include name, email, postal_code, country, vat_number, procurement_code
    });
  });

  it('should call onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('should call onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Click backdrop (the overlay div)
    const backdrop = screen.getByRole('dialog').querySelector('.absolute.inset-0');
    if (backdrop) {
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('should reset form state when dialog is closed and reopened', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Make changes
    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, 'Test reason');

    const nameInput = screen.getByDisplayValue('Original Company Ltd');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');

    // Close dialog
    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);

    // Reopen dialog
    rerender(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Form should be reset to original values
    expect(screen.getByDisplayValue('Original Company Ltd')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Changed Name')).not.toBeInTheDocument();
    const reasonField = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    expect(reasonField).toHaveValue('');
  });

  it('should handle country selection change', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Fill reason
    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, 'Country correction');

    // Change country
    const countrySelect = screen.getByDisplayValue(/Germany/i);
    await user.selectOptions(countrySelect, 'FR');

    // Submit
    const confirmButton = screen.getByRole('button', {
      name: /Replace Invoice & Create Credit Note/i,
    });
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'Country correction',
      recipient_country: 'FR',
    });
  });

  it('should trim whitespace from text inputs before submission', async () => {
    const user = userEvent.setup();

    render(
      <ReplaceInvoiceDialog
        invoice={mockInvoice}
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Fill reason with extra whitespace
    const reasonTextarea = screen.getByPlaceholderText(/e\.g\. Wrong company name/i);
    await user.type(reasonTextarea, '  Test reason with spaces  ');

    // Change name with extra whitespace
    const nameInput = screen.getByDisplayValue('Original Company Ltd');
    await user.clear(nameInput);
    await user.type(nameInput, '  New Company Name  ');

    // Submit
    const confirmButton = screen.getByRole('button', {
      name: /Replace Invoice & Create Credit Note/i,
    });
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'Test reason with spaces',
      recipient_name: 'New Company Name',
    });
  });
});
