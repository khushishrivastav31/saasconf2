import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoiceDetailsTab from '../InvoiceDetailsTab';
import type { Invoice, InvoiceUpdate, PlatformCurrency } from '../../../types';

// Mock RichTextEditor
vi.mock('../../common/RichTextEditor', () => ({
  default: ({
    value,
    onChange,
    rows,
  }: {
    value: string;
    onChange: (html: string) => void;
    rows?: number;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      data-rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const mockInvoice: Invoice = {
  id: 'inv-1',
  tenant_id: 'tenant-1',
  conference_id: 'conf-1',
  invoice_number: 'INV-2024-001',
  template_type: 'bank_transfer',
  status: 'draft',
  issue_date: '2024-01-15',
  due_date: '2024-02-15',
  recipient_source_type: null,
  recipient_source_id: null,
  recipient_name: 'Acme Corp',
  recipient_email: 'billing@acme.com',
  recipient_address_line1: '123 Main St',
  recipient_address_line2: 'Suite 100',
  recipient_city: 'New York',
  recipient_state: 'NY',
  recipient_postal_code: '10001',
  recipient_country: 'US',
  recipient_vat_number: 'US123456789',
  line_items: [],
  subtotal: null,
  tax_rate: null,
  tax_amount: null,
  total: null,
  currency: 'USD',
  notes: '<p>Thank you</p>',
  internal_comment: null,
  contact_persons: [],
  is_active: true,
  created_at: '2024-01-10T10:00:00Z',
  updated_at: '2024-01-15T14:30:00Z',
};

const mockFormData: InvoiceUpdate = {
  invoice_number: 'INV-2024-001',
  status: 'draft',
  issue_date: '2024-01-15',
  due_date: '2024-02-15',
  recipient_name: 'Acme Corp',
  recipient_email: 'billing@acme.com',
  recipient_address_line1: '123 Main St',
  recipient_address_line2: 'Suite 100',
  recipient_city: 'New York',
  recipient_state: 'NY',
  recipient_postal_code: '10001',
  recipient_country: 'US',
  recipient_vat_number: 'US123456789',
  currency: 'USD',
  notes: '<p>Thank you</p>',
  internal_comment: '',
  is_active: true,
};

const mockCurrencies: PlatformCurrency[] = [
  {
    id: 'cur-1',
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    is_active: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'cur-2',
    code: 'EUR',
    name: 'Euro',
    symbol: '\u20AC',
    is_active: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'cur-3',
    code: 'GBP',
    name: 'British Pound',
    symbol: '\u00A3',
    is_active: true,
    created_at: '',
    updated_at: '',
  },
];

// Helper to find input by label text (since labels don't use "for" attribute)
function getInputByLabel(container: HTMLElement, labelText: string) {
  const label = within(container).getByText(labelText);
  const parent = label.parentElement;
  if (!parent) throw new Error(`No parent element for label: ${labelText}`);
  const input = parent.querySelector('input, select, textarea');
  if (!input) throw new Error(`No input found for label: ${labelText}`);
  return input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
}

describe('InvoiceDetailsTab', () => {
  const defaultProps = {
    invoice: mockInvoice,
    formData: mockFormData,
    setFormData: vi.fn(),
    currencies: mockCurrencies,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders invoice number field as read-only', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Invoice Number');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('INV-2024-001');
      expect(input).toBeDisabled();
    });

    it("shows 'Not yet assigned' when invoice has no number", () => {
      const draftInvoice = { ...mockInvoice, invoice_number: null };
      const draftFormData = { ...mockFormData, invoice_number: undefined };
      render(
        <InvoiceDetailsTab {...defaultProps} invoice={draftInvoice} formData={draftFormData} />
      );
      expect(screen.getByDisplayValue('Not yet assigned')).toBeInTheDocument();
      expect(screen.getByText('Assigned when invoice is sent')).toBeInTheDocument();
    });

    it('renders status as read-only text for draft invoices', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const statusInput = getInputByLabel(container, 'Status');
      expect(statusInput).toBeInTheDocument();
      expect(statusInput).toBeDisabled();
      expect(statusInput).toHaveValue('Draft');
    });

    it('renders status dropdown with valid transitions for sent invoices', () => {
      const sentInvoice = { ...mockInvoice, status: 'sent' as const };
      const sentFormData = { ...mockFormData, status: 'sent' };
      const { container } = render(
        <InvoiceDetailsTab
          {...defaultProps}
          invoice={sentInvoice}
          formData={sentFormData}
          readOnly
        />
      );
      const statusSelect = getInputByLabel(container, 'Status') as HTMLSelectElement;
      expect(statusSelect.tagName).toBe('SELECT');
      const options = Array.from(statusSelect.options).map((o) => o.value);
      expect(options).toContain('sent');
      expect(options).toContain('paid');
      expect(options).toContain('overdue');
      // cancelled is no longer a manual status transition — use the cancel endpoint instead
      expect(options).not.toContain('cancelled');
    });

    it('renders issue date field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Issue Date');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('2024-01-15');
    });

    it('renders due date field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Due Date');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('2024-02-15');
    });

    it('renders Recipient Information section', () => {
      render(<InvoiceDetailsTab {...defaultProps} />);
      expect(screen.getByText('Recipient Information')).toBeInTheDocument();
    });

    it('renders recipient name field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Recipient Name *');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('Acme Corp');
    });

    it('renders recipient email field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Recipient Email');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('billing@acme.com');
    });

    it('renders address line 1 field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Address Line 1');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('123 Main St');
    });

    it('renders address line 2 field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Address Line 2');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('Suite 100');
    });

    it('renders city field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'City');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('New York');
    });

    it('renders postal code field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Postal Code');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('10001');
    });

    it('renders country as dropdown', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Country') as HTMLSelectElement;
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe('SELECT');
      expect(input).toHaveValue('US');
    });

    it('renders VAT number field with VatNumberInput', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const vatInput = getInputByLabel(container, 'VAT Number');
      expect(vatInput).toBeInTheDocument();
      expect(vatInput).toHaveValue('US123456789');
    });

    it('renders Financial section', () => {
      render(<InvoiceDetailsTab {...defaultProps} />);
      expect(screen.getByText('Financial')).toBeInTheDocument();
    });

    it('renders currency dropdown with all options', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const currencySelect = getInputByLabel(container, 'Currency') as HTMLSelectElement;
      expect(currencySelect).toBeInTheDocument();
      expect(currencySelect).toHaveValue('USD');

      expect(screen.getByRole('option', { name: '-- Select Currency --' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'USD - US Dollar ($)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /EUR - Euro/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /GBP - British Pound/ })).toBeInTheDocument();
    });

    it('renders Notes field with RichTextEditor', () => {
      render(<InvoiceDetailsTab {...defaultProps} />);
      expect(screen.getByText('Notes (shown on invoice)')).toBeInTheDocument();
      expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
    });

    it('renders Internal Comment field', () => {
      render(<InvoiceDetailsTab {...defaultProps} />);
      expect(screen.getByText('Internal Comment (not shown on invoice)')).toBeInTheDocument();
    });
  });

  describe('form interactions - status', () => {
    it('status is not editable for draft invoices', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const statusInput = getInputByLabel(container, 'Status');
      expect(statusInput).toBeDisabled();
    });

    it('calls setFormData when status changes on sent invoice', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const sentInvoice = { ...mockInvoice, status: 'sent' as const };
      const sentFormData = { ...mockFormData, status: 'sent' };
      const { container } = render(
        <InvoiceDetailsTab
          {...defaultProps}
          invoice={sentInvoice}
          formData={sentFormData}
          setFormData={setFormData}
          readOnly
        />
      );

      const select = getInputByLabel(container, 'Status');
      await user.selectOptions(select, 'paid');

      expect(setFormData).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));
    });
  });

  describe('form interactions - dates', () => {
    it('calls setFormData when issue date changes', () => {
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'Issue Date');
      // Use fireEvent.change for date inputs as userEvent.type doesn't work well with them
      fireEvent.change(input, { target: { value: '2024-03-01' } });

      expect(setFormData).toHaveBeenCalled();
      expect(setFormData).toHaveBeenCalledWith(
        expect.objectContaining({ issue_date: '2024-03-01' })
      );
    });

    it('calls setFormData when due date changes', () => {
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'Due Date');
      fireEvent.change(input, { target: { value: '2024-04-01' } });

      expect(setFormData).toHaveBeenCalled();
      expect(setFormData).toHaveBeenCalledWith(expect.objectContaining({ due_date: '2024-04-01' }));
    });
  });

  describe('form interactions - recipient information', () => {
    it('calls setFormData when recipient name changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'Recipient Name *');
      // Type a single character to trigger onChange
      await user.type(input, 'X');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      // Value should contain original + typed char
      expect(lastCall.recipient_name).toContain('X');
    });

    it('calls setFormData when recipient email changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'Recipient Email');
      await user.type(input, 'x');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      expect(lastCall.recipient_email).toContain('x');
    });

    it('calls setFormData when address line 1 changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'Address Line 1');
      await user.type(input, 'X');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      expect(lastCall.recipient_address_line1).toContain('X');
    });

    it('calls setFormData when address line 2 changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'Address Line 2');
      await user.type(input, 'X');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      expect(lastCall.recipient_address_line2).toContain('X');
    });

    it('calls setFormData when city changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'City');
      await user.type(input, 'X');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      expect(lastCall.recipient_city).toContain('X');
    });

    it('calls setFormData when postal code changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'Postal Code');
      await user.type(input, 'X');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      expect(lastCall.recipient_postal_code).toContain('X');
    });

    it('calls setFormData when country changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const select = getInputByLabel(container, 'Country');
      await user.selectOptions(select, 'DE');

      expect(setFormData).toHaveBeenCalledWith(
        expect.objectContaining({ recipient_country: 'DE' })
      );
    });

    it('calls setFormData when VAT number changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const input = getInputByLabel(container, 'VAT Number');
      await user.type(input, 'X');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      expect(lastCall.recipient_vat_number).toContain('X');
    });
  });

  describe('form interactions - financial', () => {
    it('calls setFormData when currency changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const select = getInputByLabel(container, 'Currency');
      await user.selectOptions(select, 'EUR');

      expect(setFormData).toHaveBeenCalledWith(expect.objectContaining({ currency: 'EUR' }));
    });
  });

  describe('form interactions - notes and comments', () => {
    it('calls setFormData when notes changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      render(<InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />);

      const editor = screen.getByTestId('rich-text-editor');
      await user.type(editor, 'X');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      // Notes field appends to existing value
      expect(lastCall.notes).toContain('X');
    });

    it('calls setFormData when internal comment changes', async () => {
      const user = userEvent.setup();
      const setFormData = vi.fn();
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} setFormData={setFormData} />
      );

      const textarea = getInputByLabel(container, 'Internal Comment (not shown on invoice)');
      await user.type(textarea, 'X');

      expect(setFormData).toHaveBeenCalled();
      const lastCall = setFormData.mock.calls[setFormData.mock.calls.length - 1][0];
      expect(lastCall.internal_comment).toContain('X');
    });
  });

  describe('empty/default values', () => {
    it('handles empty form data gracefully', () => {
      const emptyFormData: InvoiceUpdate = {
        invoice_number: undefined,
        recipient_name: '',
      };
      const draftInvoice = { ...mockInvoice, invoice_number: null };
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} invoice={draftInvoice} formData={emptyFormData} />
      );

      expect(getInputByLabel(container, 'Invoice Number')).toHaveValue('Not yet assigned');
      expect(getInputByLabel(container, 'Recipient Name *')).toHaveValue('');
      expect(getInputByLabel(container, 'Status')).toHaveValue('Draft');
    });

    it('handles undefined optional fields', () => {
      const minimalFormData: InvoiceUpdate = {
        invoice_number: 'INV-001',
        recipient_name: 'Test',
      };
      const { container } = render(
        <InvoiceDetailsTab {...defaultProps} formData={minimalFormData} />
      );

      expect(getInputByLabel(container, 'Issue Date')).toHaveValue('');
      expect(getInputByLabel(container, 'Due Date')).toHaveValue('');
      expect(getInputByLabel(container, 'Recipient Email')).toHaveValue('');
      expect(getInputByLabel(container, 'Currency')).toHaveValue('');
    });
  });

  describe('required fields', () => {
    it('renders invoice number as disabled', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Invoice Number');
      expect(input).toBeDisabled();
    });

    it('marks recipient name as required', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Recipient Name *');
      expect(input).toBeRequired();
    });

    it('has email type for recipient email field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Recipient Email');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('has date type for issue date field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Issue Date');
      expect(input).toHaveAttribute('type', 'date');
    });

    it('has date type for due date field', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} />);
      const input = getInputByLabel(container, 'Due Date');
      expect(input).toHaveAttribute('type', 'date');
    });
  });

  describe('empty currencies list', () => {
    it('renders currency dropdown with only placeholder when no currencies', () => {
      const { container } = render(<InvoiceDetailsTab {...defaultProps} currencies={[]} />);
      const currencySelect = getInputByLabel(container, 'Currency');
      const options = currencySelect.querySelectorAll('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('-- Select Currency --');
    });
  });
});
