import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FinancialSettingsTab from '../FinancialSettingsTab';
import type { Conference } from '../../../../../types';

// Mock API
vi.mock('../../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

// Mock Toast
const mockShowToast = vi.fn();
vi.mock('../../../../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock FiscalRepSection — it has its own queries
vi.mock('../../FiscalRepSection', () => ({
  default: ({ conferenceId, isAdmin }: { conferenceId: string; isAdmin: boolean }) => (
    <div
      data-testid="fiscal-rep-section"
      data-conference-id={conferenceId}
      data-is-admin={String(isAdmin)}
    >
      FiscalRepSection
    </div>
  ),
}));

import api from '../../../../../config/api';
const mockedApi = vi.mocked(api);

const CURRENCY_ITEMS = [
  { code: 'EUR', name: 'Euro', symbol: '€', is_active: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', is_active: true },
  { code: 'GBP', name: 'British Pound', symbol: '£', is_active: true },
];

const mockConference: Conference = {
  id: 'conf-123',
  name: 'Test Conference',
  abbreviation: 'TC',
  tenant_id: 'tenant-1',
  tenant_slug: 'demo',
  status: 'active',
  currency: 'EUR',
  invoice_currency: 'USD',
  country: 'DE',
  city: null,
  state: null,
  postal_code: null,
  start_date: null,
  end_date: null,
  timezone: null,
  description: null,
  website: null,
  support_email: null,
  contact_email: null,
  phone: null,
  venue_name: null,
  venue_address: null,
  venue_type: 'in_person',
  venue_url: null,
  virtual_platform_url: null,
  logo_url: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('FinancialSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.get.mockResolvedValue({
      data: { items: CURRENCY_ITEMS, total: 3, page: 1, page_size: 100, pages: 1 },
    });
  });

  it('renders heading and description', () => {
    render(<FinancialSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText('Currency & Tax')).toBeInTheDocument();
    expect(screen.getByText(/configure currencies and tax/i)).toBeInTheDocument();
  });

  it('renders two currency selects', () => {
    render(<FinancialSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText('Primary Currency')).toBeInTheDocument();
    expect(screen.getByText(/Second Currency/)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
  });

  it('renders currency options after API loads', async () => {
    render(<FinancialSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    // Wait for options to appear (async query)
    await waitFor(() => {
      // Each currency appears in both selects (2 occurrences each)
      expect(screen.getAllByText('EUR — Euro')).toHaveLength(2);
    });
  });

  it('selects correct initial values after options load', async () => {
    render(<FinancialSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    // Wait for options to load so the select values resolve
    await waitFor(() => {
      expect(screen.getAllByText('EUR — Euro')).toHaveLength(2);
    });

    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('EUR');
    expect(selects[1]).toHaveValue('USD');
  });

  it('renders FiscalRepSection', () => {
    render(<FinancialSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('fiscal-rep-section')).toBeInTheDocument();
    expect(screen.getByTestId('fiscal-rep-section')).toHaveAttribute(
      'data-conference-id',
      'conf-123'
    );
  });

  it('disables currency selects when isAdmin is false', () => {
    render(<FinancialSettingsTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toBeDisabled();
    expect(selects[1]).toBeDisabled();
  });

  it('does not show save status badges when isAdmin is false', () => {
    render(<FinancialSettingsTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument();
  });

  it('saves currency on explicit Save Changes click', async () => {
    mockedApi.put.mockResolvedValue({ data: {} });

    render(<FinancialSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    // Wait for currency options to load before changing select
    await waitFor(() => {
      expect(screen.getAllByText('GBP — British Pound')).toHaveLength(2);
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'GBP' } });

    // Should not have called API yet (no autosave)
    expect(mockedApi.put).not.toHaveBeenCalled();

    // Click Save Changes button
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedApi.put).toHaveBeenCalledWith(
        '/conferences/conf-123',
        expect.objectContaining({ currency: 'GBP' })
      );
    });
  });

  it('shows error toast on save failure', async () => {
    mockedApi.put.mockRejectedValue({
      response: { data: { detail: 'Invalid currency code' } },
    });

    render(<FinancialSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    // Wait for currency options to load
    await waitFor(() => {
      expect(screen.getAllByText('GBP — British Pound')).toHaveLength(2);
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'XXX' } });

    // Click Save Changes button
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Invalid currency code', 'error');
    });
  });

  it('shows placeholder options for empty currency', () => {
    const confWithoutCurrency = { ...mockConference, currency: null, invoice_currency: null };
    render(<FinancialSettingsTab conference={confWithoutCurrency} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('');
    expect(selects[1]).toHaveValue('');
  });
});
