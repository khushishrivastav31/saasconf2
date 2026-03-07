import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BillingFields from '../BillingFields';
import type { BillingProfileCreate, Conference } from '../../../../../types';

// Mock VatNumberInput component
vi.mock('../../../../../components/common/VatNumberInput', () => ({
  default: ({
    value,
    onChange,
    country,
    required,
    level,
    requirementReason,
    label,
  }: {
    value: string;
    onChange: (val: string) => void;
    country?: string;
    required?: boolean;
    level?: string;
    requirementReason?: string;
    label?: string;
  }) => (
    <div data-testid="vat-number-input">
      <label>{label}</label>
      <input
        data-testid="vat-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-country={country}
        data-required={required}
        data-level={level}
        data-reason={requirementReason}
      />
    </div>
  ),
}));

describe('BillingFields', () => {
  const mockConference: Conference = {
    id: '123',
    tenant_id: '456',
    name: 'TestConf 2026',
    abbreviation: 'TC26',
    country: 'DE', // Germany
    venue_type: 'in_person',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as Conference;

  const emptyBilling: BillingProfileCreate = {
    company_name: null,
    street: '',
    postal_code: '',
    city: '',
    country: '',
    vat_number: null,
    vat_validated: null,
    contact_first_name: '',
    contact_last_name: '',
    contact_phone: '',
    contact_email: '',
    procurement_code: null,
    payment_method: 'bank_transfer',
    discount_code: null,
  };

  it('marks VAT as required for virtual EU B2B scenario', () => {
    const virtualConference = { ...mockConference, venue_type: 'virtual' };
    const b2bBilling = {
      ...emptyBilling,
      company_name: 'Acme Corp', // B2B indicator
      country: 'FR', // France (EU, non-domestic)
    };

    render(<BillingFields data={b2bBilling} onChange={vi.fn()} conference={virtualConference} />);

    const vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-required', 'true');
    expect(vatInput).toHaveAttribute('data-level', 'required');
    expect(vatInput).toHaveAttribute('data-reason', expect.stringContaining('reverse charge'));
  });

  it('marks VAT as recommended for domestic B2B scenario', () => {
    const b2bBilling = {
      ...emptyBilling,
      company_name: 'Tech GmbH', // B2B indicator
      country: 'DE', // Germany (domestic)
    };

    render(<BillingFields data={b2bBilling} onChange={vi.fn()} conference={mockConference} />);

    const vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-required', 'false');
    expect(vatInput).toHaveAttribute('data-level', 'recommended');
    expect(vatInput).toHaveAttribute('data-reason', expect.stringContaining('recommended'));
  });

  it('marks VAT as optional for B2C scenario', () => {
    const b2cBilling = {
      ...emptyBilling,
      company_name: null, // No company = B2C
      country: 'FR',
    };

    render(<BillingFields data={b2cBilling} onChange={vi.fn()} conference={mockConference} />);

    const vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-required', 'false');
    expect(vatInput).toHaveAttribute('data-level', 'optional');
  });

  it('updates requirement when country changes', () => {
    const { rerender } = render(
      <BillingFields
        data={{ ...emptyBilling, company_name: 'Company', country: 'US' }}
        onChange={vi.fn()}
        conference={{ ...mockConference, venue_type: 'virtual' }}
      />
    );

    // Non-EU should be optional
    let vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-level', 'optional');

    // Change to EU country
    rerender(
      <BillingFields
        data={{ ...emptyBilling, company_name: 'Company', country: 'FR' }}
        onChange={vi.fn()}
        conference={{ ...mockConference, venue_type: 'virtual' }}
      />
    );

    // EU + virtual + B2B should be required
    vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-level', 'required');
  });

  it('updates requirement when company name is entered', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BillingFields
        data={{ ...emptyBilling, country: 'FR' }}
        onChange={onChange}
        conference={{ ...mockConference, venue_type: 'virtual' }}
      />
    );

    // No company = optional
    let vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-level', 'optional');

    // Add company name
    const companyInput = screen.getByLabelText('Company Name');
    fireEvent.change(companyInput, { target: { value: 'New Company' } });

    // Should call onChange
    expect(onChange).toHaveBeenCalled();

    // Rerender with company name
    rerender(
      <BillingFields
        data={{ ...emptyBilling, company_name: 'New Company', country: 'FR' }}
        onChange={onChange}
        conference={{ ...mockConference, venue_type: 'virtual' }}
      />
    );

    // Now should be required (virtual + EU + B2B)
    vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-level', 'required');
  });

  it('updates requirement when company name is cleared', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BillingFields
        data={{ ...emptyBilling, company_name: 'Company', country: 'FR' }}
        onChange={onChange}
        conference={{ ...mockConference, venue_type: 'virtual' }}
      />
    );

    // With company = required
    let vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-level', 'required');

    // Clear company name
    const companyInput = screen.getByLabelText('Company Name');
    fireEvent.change(companyInput, { target: { value: '' } });

    // Rerender without company
    rerender(
      <BillingFields
        data={{ ...emptyBilling, company_name: null, country: 'FR' }}
        onChange={onChange}
        conference={{ ...mockConference, venue_type: 'virtual' }}
      />
    );

    // Now should be optional (B2C)
    vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-level', 'optional');
  });

  it('marks VAT as required for hybrid online EU B2B', () => {
    const hybridConference = { ...mockConference, venue_type: 'hybrid' };
    const b2bBilling = {
      ...emptyBilling,
      company_name: 'Business Ltd',
      country: 'IE', // Ireland (EU)
    };

    render(<BillingFields data={b2bBilling} onChange={vi.fn()} conference={hybridConference} />);

    const vatInput = screen.getByTestId('vat-input');
    // Hybrid is treated as virtual for VAT purposes (includes online component)
    expect(vatInput).toHaveAttribute('data-level', 'required');
  });

  it('marks VAT as recommended for in-person EU B2B', () => {
    const inPersonConference = { ...mockConference, venue_type: 'in_person' };
    const b2bBilling = {
      ...emptyBilling,
      company_name: 'Business BV',
      country: 'NL', // Netherlands (EU)
    };

    render(<BillingFields data={b2bBilling} onChange={vi.fn()} conference={inPersonConference} />);

    const vatInput = screen.getByTestId('vat-input');
    expect(vatInput).toHaveAttribute('data-level', 'recommended');
  });

  it('handles missing conference gracefully', () => {
    const b2bBilling = {
      ...emptyBilling,
      company_name: 'Company',
      country: 'FR',
    };

    render(<BillingFields data={b2bBilling} onChange={vi.fn()} conference={undefined} />);

    const vatInput = screen.getByTestId('vat-input');
    // Should default to optional when no conference
    expect(vatInput).toHaveAttribute('data-level', 'optional');
  });

  it('handles empty country gracefully', () => {
    const b2bBilling = {
      ...emptyBilling,
      company_name: 'Company',
      country: '',
    };

    render(<BillingFields data={b2bBilling} onChange={vi.fn()} conference={mockConference} />);

    const vatInput = screen.getByTestId('vat-input');
    // Should default to optional when no country selected
    expect(vatInput).toHaveAttribute('data-level', 'optional');
  });
});
