import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VatNumberInput from '../VatNumberInput';

// Mock the API module
vi.mock('../../../config/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Mock EU_COUNTRY_CODES
vi.mock('../../../config/countries', () => ({
  EU_COUNTRY_CODES: new Set([
    'AT',
    'BE',
    'BG',
    'HR',
    'CY',
    'CZ',
    'DK',
    'EE',
    'FI',
    'FR',
    'DE',
    'GR',
    'HU',
    'IE',
    'IT',
    'LV',
    'LT',
    'LU',
    'MT',
    'NL',
    'PL',
    'PT',
    'RO',
    'SK',
    'SI',
    'ES',
    'SE',
  ]),
}));

import api from '../../../config/api';

const mockedApi = vi.mocked(api);

describe('VatNumberInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default label and placeholder', () => {
    render(<VatNumberInput {...defaultProps} />);
    expect(screen.getByLabelText('VAT Number')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. DE123456789')).toBeInTheDocument();
  });

  it('renders with custom label and placeholder', () => {
    render(
      <VatNumberInput {...defaultProps} label="Fiscal Rep VAT" placeholder="e.g. NL123456789B01" />
    );
    expect(screen.getByLabelText('Fiscal Rep VAT')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. NL123456789B01')).toBeInTheDocument();
  });

  it('renders with provided value', () => {
    render(<VatNumberInput {...defaultProps} value="DE123456789" />);
    expect(screen.getByDisplayValue('DE123456789')).toBeInTheDocument();
  });

  it('calls onChange when user types', () => {
    const onChange = vi.fn();
    render(<VatNumberInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByLabelText('VAT Number');
    fireEvent.change(input, { target: { value: 'DE' } });
    expect(onChange).toHaveBeenCalledWith('DE');
  });

  it('shows no status icon in idle state', () => {
    const { container } = render(<VatNumberInput {...defaultProps} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('calls standalone API on blur', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: true, method: 'stdnum', vat_normalized: 'DE123456789' },
    });
    const onValidationResult = vi.fn();

    render(
      <VatNumberInput
        {...defaultProps}
        value="DE123456789"
        onValidationResult={onValidationResult}
      />
    );

    fireEvent.blur(screen.getByLabelText('VAT Number'));

    await waitFor(() => {
      expect(screen.getByText('Valid')).toBeInTheDocument();
    });
    expect(mockedApi.post).toHaveBeenCalledWith('/my-company/validate-vat', null, {
      params: { vat_number: 'DE123456789', country: 'DE' },
    });
    expect(onValidationResult).toHaveBeenCalledWith(true);
  });

  it('shows invalid status when API returns valid=false', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: false, method: 'stdnum', vat_normalized: 'DE195661616' },
    });
    const onValidationResult = vi.fn();

    render(
      <VatNumberInput
        {...defaultProps}
        value="DE195661616"
        onValidationResult={onValidationResult}
      />
    );

    fireEvent.blur(screen.getByLabelText('VAT Number'));

    await waitFor(() => {
      expect(screen.getByText('Invalid')).toBeInTheDocument();
    });
    expect(onValidationResult).toHaveBeenCalledWith(false);
  });

  it('always uses standalone endpoint regardless of context', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: true, method: 'stdnum', vat_normalized: 'DE123456789' },
    });
    const onValidationResult = vi.fn();

    render(
      <VatNumberInput
        {...defaultProps}
        value="DE123456789"
        country="DE"
        onValidationResult={onValidationResult}
      />
    );

    fireEvent.blur(screen.getByLabelText('VAT Number'));

    await waitFor(() => {
      expect(screen.getByText('Valid')).toBeInTheDocument();
    });
    expect(mockedApi.post).toHaveBeenCalledWith('/my-company/validate-vat', null, {
      params: { vat_number: 'DE123456789', country: 'DE' },
    });
    expect(onValidationResult).toHaveBeenCalledWith(true);
  });

  it('shows invalid status when API returns valid=false with country', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: false, method: 'vies', vat_normalized: 'DE999999999' },
    });

    render(<VatNumberInput {...defaultProps} value="DE999999999" country="DE" />);

    fireEvent.blur(screen.getByLabelText('VAT Number'));

    await waitFor(() => {
      expect(screen.getByText('Invalid')).toBeInTheDocument();
    });
  });

  it('shows uncertain status when API returns valid=null', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: {
        valid: null,
        method: 'regex',
        vat_normalized: 'DE123456789',
        message: 'Format OK but could not verify online',
      },
    });

    render(<VatNumberInput {...defaultProps} value="DE123456789" country="DE" />);

    fireEvent.blur(screen.getByLabelText('VAT Number'));

    await waitFor(() => {
      expect(screen.getByText('Unverified')).toBeInTheDocument();
    });
  });

  it('resets status when user changes the value', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: true, method: 'stdnum', vat_normalized: 'DE123456789' },
    });

    render(<VatNumberInput {...defaultProps} value="DE123456789" />);

    const input = screen.getByLabelText('VAT Number');
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText('Valid')).toBeInTheDocument();
    });

    // Then type to reset
    fireEvent.change(input, { target: { value: 'DE' } });
    expect(screen.queryByText('Valid')).not.toBeInTheDocument();
  });

  it('does not validate empty value on blur', async () => {
    const onValidationResult = vi.fn();
    render(<VatNumberInput {...defaultProps} value="" onValidationResult={onValidationResult} />);

    fireEvent.blur(screen.getByLabelText('VAT Number'));

    // Should stay idle, no API call
    await waitFor(() => {
      expect(screen.queryByText('Valid')).not.toBeInTheDocument();
      expect(screen.queryByText('Invalid')).not.toBeInTheDocument();
    });
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('renders as disabled when disabled prop is true', () => {
    render(<VatNumberInput {...defaultProps} disabled />);
    expect(screen.getByLabelText('VAT Number')).toBeDisabled();
  });

  it('shows green border classes when valid', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: true, method: 'stdnum', vat_normalized: 'DE123456789' },
    });

    render(<VatNumberInput {...defaultProps} value="DE123456789" />);
    const input = screen.getByLabelText('VAT Number');
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input.className).toContain('border-green-500');
      expect(input.className).toContain('ring-green-500');
    });
  });

  it('shows red border classes when invalid', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: false, method: 'stdnum', vat_normalized: 'INVALID' },
    });

    render(<VatNumberInput {...defaultProps} value="INVALID" />);
    const input = screen.getByLabelText('VAT Number');
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input.className).toContain('border-red-500');
      expect(input.className).toContain('ring-red-500');
    });
  });

  it('shows error message text when invalid', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: false, method: 'stdnum', message: 'VAT number could not be verified' },
    });

    render(<VatNumberInput {...defaultProps} value="INVALID" />);
    fireEvent.blur(screen.getByLabelText('VAT Number'));

    await waitFor(() => {
      expect(screen.getByText('VAT number could not be verified')).toBeInTheDocument();
    });
  });

  it('passes full country name to API (backend handles mapping)', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { valid: true, method: 'stdnum', vat_normalized: 'DE123456789' },
    });

    render(<VatNumberInput {...defaultProps} value="DE123456789" country="GERMANY" />);

    fireEvent.blur(screen.getByLabelText('VAT Number'));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith('/my-company/validate-vat', null, {
        params: { vat_number: 'DE123456789', country: 'GERMANY' },
      });
    });
  });
});
